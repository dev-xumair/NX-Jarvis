/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import type { VerificationCheckResult } from '../../types/agent.ts';
import { StorageAdapter } from '../persistence/storageAdapter.ts';
import { evaluateCommandPolicy, sanitizeSafePath, scrubSecrets } from '../policy/policyEngine.ts';
import { TelemetryAdapter } from '../../adapters/system/telemetryAdapter.ts';
import { StorageWorker } from '../../adapters/storage/storageWorker.ts';
import { BrowserWorker } from '../../adapters/browser/browserWorker.ts';
import { AdbWorker } from '../../adapters/mobile/adbWorker.ts';
import { ModelGateway } from '../providers/modelGateway.ts';
import { NxEventBus } from '../events/eventBus.ts';

export interface VerificationSuiteReport {
  ok: boolean;
  allPassed: boolean;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  unavailableCount: number;
  totalCount: number;
  results: VerificationCheckResult[];
  timestamp: number;
}

export class VerificationEngine {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly telemetry: TelemetryAdapter,
    private readonly storageWorker: StorageWorker,
    private readonly browserWorker: BrowserWorker,
    private readonly adbWorker: AdbWorker,
    private readonly modelGateway: ModelGateway,
    private readonly eventBus: NxEventBus
  ) {}

  async runSuite(): Promise<VerificationSuiteReport> {
    const envLabel = `${os.platform()} ${os.release()} (${os.arch()})`;
    const results: VerificationCheckResult[] = [];
    this.eventBus.emit('VERIFICATION_STARTED', 'Executing runtime verification suite');

    // 1. VT-CPU-01: Live CPU Sampler
    {
      const started_at = Date.now();
      const cpu = this.telemetry.sampleCpuLoad();
      const ended_at = Date.now();
      const ok = cpu.status === 'LIVE' && typeof cpu.value === 'number' && cpu.capturedAt > 0;
      results.push({
        test_id: 'VT-CPU-01',
        name: 'Real Host CPU Telemetry Sampler',
        description: 'Reads actual host CPU counters with source and freshness timestamp.',
        started_at,
        ended_at,
        duration: Math.max(1, ended_at - started_at),
        status: ok ? 'PASS' : 'FAIL',
        command: 'TelemetryAdapter.sampleCpuLoad()',
        stdout: ok ? `cpu=${cpu.value}% source=${cpu.source}` : '',
        stderr: ok ? '' : cpu.detail || 'CPU telemetry unavailable',
        expected: 'status=LIVE and numeric CPU value',
        actual: `status=${cpu.status}, value=${cpu.value}`,
        environment: envLabel,
        evidence: { source: cpu.source, value: cpu.value },
      });
    }

    // 2. VT-MEM-01: Live Memory & Process RSS Check
    {
      const started_at = Date.now();
      const mem = this.telemetry.sampleMemory();
      const ended_at = Date.now();
      const ok =
        mem.ramTotalMB.status === 'LIVE' &&
        (mem.ramTotalMB.value || 0) > 0 &&
        (mem.nxProcessRssMB.value || 0) > 0;
      results.push({
        test_id: 'VT-MEM-01',
        name: 'Host RAM & NX Footprint Sampler',
        description: 'Validates OS memory counters and measures current NX Node RSS.',
        started_at,
        ended_at,
        duration: Math.max(1, ended_at - started_at),
        status: ok ? 'PASS' : 'FAIL',
        command: 'TelemetryAdapter.sampleMemory()',
        stdout: ok ? `used=${mem.ramUsedMB.value}MB total=${mem.ramTotalMB.value}MB rss=${mem.nxProcessRssMB.value}MB` : '',
        stderr: ok ? '' : 'Host RAM counters returned invalid total or RSS',
        expected: 'ramTotalMB > 0 and nxProcessRssMB > 0',
        actual: `total=${mem.ramTotalMB.value}MB, rss=${mem.nxProcessRssMB.value}MB`,
        environment: envLabel,
        evidence: { ramTotalMB: mem.ramTotalMB.value, nxRssMB: mem.nxProcessRssMB.value },
      });
    }

    // 3. VT-PROC-01: Live OS Process Discovery
    {
      const started_at = Date.now();
      const proc = this.telemetry.discoverProcesses(true);
      const ended_at = Date.now();
      const ok = proc.status === 'LIVE' && proc.processes.length > 0;
      results.push({
        test_id: 'VT-PROC-01',
        name: 'Live OS Process Enumeration',
        description: 'Discovers live running host processes instead of static mock windows.',
        started_at,
        ended_at,
        duration: Math.max(1, ended_at - started_at),
        status: ok ? 'PASS' : 'FAIL',
        command: process.platform === 'win32' ? 'powershell Get-Process' : 'ps -eo pid,pcpu,pmem,comm --sort=-pcpu',
        stdout: ok ? `count=${proc.processes.length} first=${proc.processes[0].processName}` : '',
        stderr: ok ? '' : 'Process enumeration returned empty list',
        expected: 'status=LIVE and at least 1 active host process',
        actual: `status=${proc.status}, count=${proc.processes.length}`,
        environment: envLabel,
        evidence: { count: proc.processes.length },
      });
    }

    // 4. VT-USB-01: Real Storage Discovery, FAT32 Preflight & Transactional SHA-256 Copy
    {
      const started_at = Date.now();
      const volumes = this.storageWorker.discoverVolumes();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-vt-usb-'));
      const tempSrc = path.join(tmpDir, 'probe.txt');
      const tempDestDir = path.join(tmpDir, 'dest');
      fs.writeFileSync(tempSrc, 'nx-preflight-sha256-check', 'utf-8');

      const overFat32 = this.storageWorker.validatePreFlight('F:\\', [], [4500]);
      const validCopy = this.storageWorker.copyFilesTransactional([tempSrc], tempDestDir);

      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failure
      }

      const ended_at = Date.now();
      const sysVol = volumes.find((v) => v.type === 'SYSTEM_OS');
      const ok =
        volumes.length > 0 &&
        Boolean(sysVol?.isProtected) &&
        overFat32.checks.fat32Safe === false &&
        validCopy.ok &&
        validCopy.copiedCount === 1;

      results.push({
        test_id: 'VT-USB-01',
        name: 'Storage Discovery, FAT32 Boundary & Transactional SHA-256 Copy',
        description: 'Discovers volumes, rejects FAT32 >4GB payload, and executes SHA-256 verified atomic copy.',
        started_at,
        ended_at,
        duration: Math.max(1, ended_at - started_at),
        status: ok ? 'PASS' : 'FAIL',
        command: 'StorageWorker.discoverVolumes + validatePreFlight(F:\\, 4500MB) + copyFilesTransactional()',
        stdout: ok
          ? `volumes=${volumes.length}, fat32Blocked=true, sha256=${validCopy.results[0]?.destinationSha256}`
          : '',
        stderr: ok ? '' : validCopy.warnings?.join('; ') || 'Storage verification failed',
        expected: 'Protected OS root, FAT32 4500MB blocked, SHA-256 copy verified',
        actual: `volumes=${volumes.length}, fat32Safe=${overFat32.checks.fat32Safe}, copyOk=${validCopy.ok}`,
        environment: envLabel,
        evidence: { volumesCount: volumes.length, fat32Blocked: !overFat32.checks.fat32Safe, copyOk: validCopy.ok },
      });
    }

    // 5. VT-GUARD-01: Destructive OS Policy, Injection & Path Traversal Enforcement
    {
      const started_at = Date.now();
      const vectors = ['format C:', 'del /f /s /q C:\\Windows\\*', 'rm -rf /', 'ls && rm -rf /'];
      const decisions = vectors.map((v) => evaluateCommandPolicy(v));
      const traversalCheck = sanitizeSafePath('../../etc/passwd');
      const allBlocked =
        decisions.every((d) => !d.allowed && d.riskLevel === 'BLOCKED') && !traversalCheck.safe;
      const ended_at = Date.now();
      results.push({
        test_id: 'VT-GUARD-01',
        name: 'OS Drive, Shell Injection & Path Traversal Guard',
        description: 'Dry-run verification that destructive C:/root vectors, shell chaining, and .. traversal are blocked.',
        started_at,
        ended_at,
        duration: Math.max(1, ended_at - started_at),
        status: allBlocked ? 'PASS' : 'FAIL',
        command: 'evaluateCommandPolicy(vectors) + sanitizeSafePath("../../etc/passwd")',
        stdout: allBlocked ? `Blocked ${vectors.length}/${vectors.length} cmd vectors + path traversal` : '',
        stderr: allBlocked ? '' : 'One or more security vectors were permitted',
        expected: 'All command & traversal vectors blocked cleanly',
        actual: `cmdBlocked=${decisions.filter((d) => !d.allowed).length}/${vectors.length}, traversalBlocked=${!traversalCheck.safe}`,
        environment: envLabel,
      });
    }

    // 6. VT-SANDBOX-01: Sandboxed Child Process Execution
    {
      const started_at = Date.now();
      let ok = false;
      let stdout = '';
      let stderr = '';
      try {
        stdout = execSync('echo NX_SANDBOX_OK', { timeout: 1000, encoding: 'utf-8' }).trim();
        ok = stdout.includes('NX_SANDBOX_OK');
      } catch (err: unknown) {
        stderr = err instanceof Error ? err.message : 'Sandbox process failed';
      }
      const ended_at = Date.now();
      results.push({
        test_id: 'VT-SANDBOX-01',
        name: 'Bounded Process Execution Sandbox',
        description: 'Executes a safe bounded command and verifies timeout and stdout capture.',
        started_at,
        ended_at,
        duration: Math.max(1, ended_at - started_at),
        status: ok ? 'PASS' : 'FAIL',
        command: 'echo NX_SANDBOX_OK',
        stdout,
        stderr,
        expected: 'stdout contains NX_SANDBOX_OK within 1000ms',
        actual: stdout || stderr,
        environment: envLabel,
      });
    }

    // 7. VT-SCRUB-01: Secret Scrubbing Enforcement
    {
      const started_at = Date.now();
      const sample = 'CNIC 42101-1234567-1 and api_key=AIzaSyTestSecret99887766';
      const res = scrubSecrets(sample);
      const ok =
        res.hadSecrets &&
        !res.cleanText.includes('42101-1234567-1') &&
        !res.cleanText.includes('AIzaSyTestSecret99887766') &&
        res.cleanText.includes('[REDACTED_SECRET]');
      const ended_at = Date.now();
      results.push({
        test_id: 'VT-SCRUB-01',
        name: 'Secret Scrubber Filter',
        description: 'Redacts CNICs, API keys, passwords, OTPs, and bearer tokens before storage.',
        started_at,
        ended_at,
        duration: Math.max(1, ended_at - started_at),
        status: ok ? 'PASS' : 'FAIL',
        command: 'scrubSecrets(CNIC + AIza sample)',
        stdout: ok ? res.cleanText : '',
        stderr: ok ? '' : 'Secret pattern leaked',
        expected: 'hadSecrets=true and raw secrets replaced by [REDACTED_SECRET]',
        actual: `hadSecrets=${res.hadSecrets}, categories=${res.redactedCategories.join(',')}`,
        environment: envLabel,
      });
    }

    // 8. VT-MEMORY-01: Persistent Memory Disk Roundtrip
    {
      const started_at = Date.now();
      const probe = this.storage.addMemory('__VT_PERSISTENCE_PROBE__', 'TASK', 'verification_suite', 1);
      const reloaded = this.storage.reload();
      const found = reloaded.memories.some((m) => m.id === probe.id);
      this.storage.deleteMemory(probe.id);
      const ended_at = Date.now();
      results.push({
        test_id: 'VT-MEMORY-01',
        name: 'Persistent Memory Disk Roundtrip',
        description: 'Writes a memory record to disk, reloads storage adapter, verifies existence, and cleans up.',
        started_at,
        ended_at,
        duration: Math.max(1, ended_at - started_at),
        status: found ? 'PASS' : 'FAIL',
        command: 'StorageAdapter.addMemory -> reload -> deleteMemory',
        stdout: found ? `Verified persistence in ${this.storage.getStorageStats().filePath}` : '',
        stderr: found ? '' : 'Probe record missing after reload',
        expected: 'Added memory survives StorageAdapter.reload()',
        actual: `foundAfterReload=${found}`,
        environment: envLabel,
      });
    }

    // 9. VT-EVENT-01: Typed Event Bus Emission
    {
      const started_at = Date.now();
      let received = false;
      const unsub = this.eventBus.subscribe((evt) => {
        if (evt.summary === 'VT-EVENT-01-PROBE') received = true;
      });
      this.eventBus.emit('SYSTEM_BOOT', 'VT-EVENT-01-PROBE');
      unsub();
      const ended_at = Date.now();
      results.push({
        test_id: 'VT-EVENT-01',
        name: 'Central Typed Event Bus',
        description: 'Publishes and receives a typed event in real time.',
        started_at,
        ended_at,
        duration: Math.max(1, ended_at - started_at),
        status: received ? 'PASS' : 'FAIL',
        command: 'NxEventBus.subscribe + emit(SYSTEM_BOOT)',
        stdout: received ? 'Subscriber received live event synchronously' : '',
        stderr: received ? '' : 'Subscriber did not receive emitted event',
        expected: 'received=true',
        actual: `received=${received}`,
        environment: envLabel,
      });
    }

    // 10. VT-PROVIDER-01: Live Provider Profile Check (Supports Vault & Env credentials honestly)
    {
      const started_at = Date.now();
      const profiles = this.modelGateway.getProfiles();
      const hasAnyCred = this.modelGateway.hasAnyConfiguredCredential();

      if (!hasAnyCred || profiles.length === 0) {
        const ended_at = Date.now();
        results.push({
          test_id: 'VT-PROVIDER-01',
          name: 'Model Gateway Live Provider Probe',
          description: 'Calls configured Gemini profiles using vault or server environment credentials.',
          started_at,
          ended_at,
          duration: Math.max(1, ended_at - started_at),
          status: 'SKIPPED',
          command: 'ModelGateway.testAllProfiles()',
          stdout: '',
          stderr: 'No valid API key configured in encrypted vault or server environment',
          expected: 'At least 1 HEALTHY Gemini profile when credentials exist',
          actual: 'SKIPPED (no credentials configured)',
          environment: envLabel,
        });
      } else {
        const summary = await this.modelGateway.testAllProfiles();
        const ended_at = Date.now();
        const ok = summary.healthyCount > 0;
        const firstChecked = summary.profiles.find((p) => p.enabled);
        results.push({
          test_id: 'VT-PROVIDER-01',
          name: 'Model Gateway Live Provider Probe',
          description: 'Validates all enabled Gemini key profiles independently via real API calls.',
          started_at,
          ended_at,
          duration: Math.max(1, ended_at - started_at),
          status: ok ? 'PASS' : 'FAIL',
          command: `ModelGateway.testAllProfiles() (${summary.validatedCount} profile(s))`,
          stdout: ok ? `healthy=${summary.healthyCount}/${summary.validatedCount}` : '',
          stderr: ok
            ? ''
            : firstChecked?.lastError || `healthy=0, authFailed=${summary.authFailedCount}`,
          expected: 'healthyCount >= 1',
          actual: `healthy=${summary.healthyCount}, authFailed=${summary.authFailedCount}, quota=${summary.quotaExhaustedCount}`,
          environment: envLabel,
        });
      }
    }

    // 11. VT-BROWSER-01: Real CDP Browser Session Check
    {
      const started_at = Date.now();
      const session = await this.browserWorker.inspectSession();
      const ended_at = Date.now();
      results.push({
        test_id: 'VT-BROWSER-01',
        name: 'Browser CDP Session Availability',
        description: 'Probes Chrome/Edge binary and live CDP endpoint without fake click coordinates.',
        started_at,
        ended_at,
        duration: Math.max(1, ended_at - started_at),
        status: session.cdpConnected ? 'PASS' : 'UNAVAILABLE',
        command: `GET ${session.cdpEndpoint}/json/list`,
        stdout: session.cdpConnected ? session.detail : '',
        stderr: session.cdpConnected ? '' : session.detail,
        expected: 'Active CDP endpoint if Chrome/Edge remote debugging is running',
        actual: `status=${session.status}, binary=${session.binaryDetected ?? 'none'}`,
        environment: envLabel,
        evidence: { status: session.status, binaryDetected: session.binaryDetected },
      });
    }

    // 12. VT-ADB-01: Real Android ADB Discovery
    {
      const started_at = Date.now();
      const adb = this.adbWorker.inspectStatus();
      const ended_at = Date.now();
      results.push({
        test_id: 'VT-ADB-01',
        name: 'Android ADB Device Discovery',
        description: 'Executes `adb devices -l` and reports actual device state.',
        started_at,
        ended_at,
        duration: Math.max(1, ended_at - started_at),
        status: adb.isConnected ? 'PASS' : 'UNAVAILABLE',
        command: 'adb devices -l',
        stdout: adb.isConnected ? `${adb.deviceName} (${adb.serial})` : '',
        stderr: adb.isConnected ? '' : adb.detail || adb.connectionState,
        expected: 'Connected authorized Android device if attached',
        actual: `${adb.connectionState}: ${adb.detail || adb.deviceName}`,
        environment: envLabel,
        evidence: { connectionState: adb.connectionState },
      });
    }

    const passedCount = results.filter((r) => r.status === 'PASS').length;
    const failedCount = results.filter((r) => r.status === 'FAIL').length;
    const skippedCount = results.filter((r) => r.status === 'SKIPPED').length;
    const unavailableCount = results.filter((r) => r.status === 'UNAVAILABLE').length;

    const eventType = failedCount === 0 ? 'VERIFICATION_PASSED' : 'VERIFICATION_FAILED';
    const summary = `Verification suite finished: ${passedCount} PASS, ${failedCount} FAIL, ${unavailableCount} UNAVAILABLE, ${skippedCount} SKIPPED.`;
    this.eventBus.emit(eventType, summary);
    this.eventBus.emit('VERIFICATION_FINISHED', summary, undefined, {
      passedCount,
      failedCount,
      unavailableCount,
      skippedCount,
    });

    return {
      ok: failedCount === 0,
      allPassed: passedCount === results.length,
      passedCount,
      failedCount,
      skippedCount,
      unavailableCount,
      totalCount: results.length,
      results,
      timestamp: Date.now(),
    };
  }
}
