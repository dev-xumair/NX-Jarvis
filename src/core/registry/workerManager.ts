/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolContract, WorkerContract } from '../../types/agent.ts';
import type { NxEventBus } from '../events/eventBus.ts';
import type { BrowserWorker } from '../../adapters/browser/browserWorker.ts';
import type { AdbWorker } from '../../adapters/mobile/adbWorker.ts';
import type { GeminiProviderAdapter } from '../providers/geminiAdapter.ts';
import type { WindowsWorker } from '../../adapters/windows/windowsWorker.ts';

export interface RecoveryRunOptions<T> {
  taskId?: string;
  operationName: string;
  maxRetries?: number;
  primaryFn: (attempt: number) => Promise<T>;
  isRecoverableError?: (err: unknown) => boolean;
  fallbackFn?: (lastError: unknown) => Promise<T>;
}

export interface RecoveryResult<T> {
  ok: boolean;
  data?: T;
  attempts: number;
  usedFallback: boolean;
  error?: string;
}

export class RecoveryEngine {
  constructor(private readonly eventBus: NxEventBus) {}

  async runWithBoundedRecovery<T>(opts: RecoveryRunOptions<T>): Promise<RecoveryResult<T>> {
    const maxRetries = Math.max(0, Math.min(opts.maxRetries ?? 2, 3));
    let attempts = 0;
    let lastErr: unknown;

    while (attempts <= maxRetries) {
      attempts += 1;
      try {
        const data = await opts.primaryFn(attempts);
        if (attempts > 1) {
          this.eventBus.emit(
            'RECOVERY_FINISHED',
            `${opts.operationName} recovered cleanly on attempt ${attempts}`,
            opts.taskId,
            { attempts, usedFallback: false }
          );
        }
        return { ok: true, data, attempts, usedFallback: false };
      } catch (err: unknown) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const permanent =
          /BLOCKED|POL-|PROTECTED_OS_DRIVE|AUTH_FAILED|SECRET_EXPOSURE/i.test(msg) ||
          (opts.isRecoverableError ? !opts.isRecoverableError(err) : false);

        if (permanent || attempts > maxRetries) {
          break;
        }

        this.eventBus.emit(
          'RECOVERY_STARTED',
          `${opts.operationName} failed (${msg}); bounded retry ${attempts}/${maxRetries}`,
          opts.taskId,
          { attempt: attempts, maxRetries }
        );
      }
    }

    if (opts.fallbackFn) {
      this.eventBus.emit(
        'RECOVERY_STARTED',
        `${opts.operationName} switching to alternate fallback path`,
        opts.taskId,
        { attempts }
      );
      try {
        const data = await opts.fallbackFn(lastErr);
        this.eventBus.emit(
          'RECOVERY_FINISHED',
          `${opts.operationName} completed via alternate path`,
          opts.taskId,
          { attempts, usedFallback: true }
        );
        return { ok: true, data, attempts, usedFallback: true };
      } catch (fallbackErr: unknown) {
        const errMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        this.eventBus.emit(
          'RECOVERY_FINISHED',
          `${opts.operationName} fallback failed: ${errMsg}`,
          opts.taskId,
          { attempts, usedFallback: true, failed: true }
        );
        return { ok: false, attempts, usedFallback: true, error: errMsg };
      }
    }

    const finalMsg = lastErr instanceof Error ? lastErr.message : String(lastErr || 'Operation failed');
    this.eventBus.emit(
      'RECOVERY_FINISHED',
      `${opts.operationName} exhausted max retries (${maxRetries}): ${finalMsg}`,
      opts.taskId,
      { attempts, usedFallback: false, failed: true }
    );
    return { ok: false, attempts, usedFallback: false, error: finalMsg };
  }
}

export class ToolRegistry {
  listTools(): ToolContract[] {
    return [
      {
        toolId: 'policy.evaluate_command',
        workerId: 'policy-engine',
        description: 'Classify command risk level, redact secrets, and enforce C: drive guard.',
        riskLevel: 'READ_ONLY',
        requiresConfirmation: false,
        hostRequired: 'CROSS_PLATFORM',
      },
      {
        toolId: 'telemetry.capture_snapshot',
        workerId: 'telemetry-adapter',
        description: 'Capture host CPU, RAM, NX RSS, network delta, and process list.',
        riskLevel: 'READ_ONLY',
        requiresConfirmation: false,
        hostRequired: 'CROSS_PLATFORM',
      },
      {
        toolId: 'storage.discover_volumes',
        workerId: 'storage-worker',
        description: 'Inspect mounted OS drives and removable USB volumes.',
        riskLevel: 'READ_ONLY',
        requiresConfirmation: false,
        hostRequired: 'CROSS_PLATFORM',
      },
      {
        toolId: 'storage.preflight_check',
        workerId: 'storage-worker',
        description: 'Validate 12-point storage preflight and FAT32 4GB limit before transfer.',
        riskLevel: 'READ_ONLY',
        requiresConfirmation: false,
        hostRequired: 'CROSS_PLATFORM',
      },
      {
        toolId: 'storage.transactional_copy',
        workerId: 'storage-worker',
        description: 'Copy files atomically (.nx_tmp staging + SHA-256 parity verification + OS C: block).',
        riskLevel: 'SAFE_REVERSIBLE',
        requiresConfirmation: false,
        hostRequired: 'CROSS_PLATFORM',
      },
      {
        toolId: 'storage.safe_eject',
        workerId: 'storage-worker',
        description: 'Safely unmount verified removable non-OS volumes.',
        riskLevel: 'HIGH_IMPACT_CONFIRM',
        requiresConfirmation: true,
        hostRequired: 'WINDOWS_HOST_REQUIRED',
      },
      {
        toolId: 'windows.inspect_foreground',
        workerId: 'windows-worker',
        description: 'Query active Win32 desktop window title, process name, and PID.',
        riskLevel: 'READ_ONLY',
        requiresConfirmation: false,
        hostRequired: 'WINDOWS_HOST_REQUIRED',
      },
      {
        toolId: 'windows.launch_app',
        workerId: 'windows-worker',
        description: 'Launch allowlisted desktop application (notepad, calc, explorer, chrome, msedge).',
        riskLevel: 'SAFE_REVERSIBLE',
        requiresConfirmation: false,
        hostRequired: 'WINDOWS_HOST_REQUIRED',
      },
      {
        toolId: 'browser.cdp_navigate',
        workerId: 'browser-worker',
        description: 'Inspect active CDP session and verify page navigation via /json/list.',
        riskLevel: 'SAFE_REVERSIBLE',
        requiresConfirmation: false,
        hostRequired: 'CROSS_PLATFORM',
      },
      {
        toolId: 'adb.inspect_and_ping',
        workerId: 'adb-worker',
        description: 'Probe real Android ADB devices and execute authorized device commands.',
        riskLevel: 'READ_ONLY',
        requiresConfirmation: false,
        hostRequired: 'CROSS_PLATFORM',
      },
      {
        toolId: 'memory.add_and_reload',
        workerId: 'memory-engine',
        description: 'Persist memory item atomically and verify reload parity.',
        riskLevel: 'SAFE_REVERSIBLE',
        requiresConfirmation: false,
        hostRequired: 'CROSS_PLATFORM',
      },
      {
        toolId: 'storage.create_file_or_folder',
        workerId: 'storage-worker',
        description: 'Safely create files, folders, documents, and rename paths outside OS system roots.',
        riskLevel: 'SAFE_REVERSIBLE',
        requiresConfirmation: false,
        hostRequired: 'CROSS_PLATFORM',
      },
      {
        toolId: 'media.scan_and_play',
        workerId: 'media-worker',
        description: 'Scan Music/Downloads/Desktop for local audio/video files and play on Windows desktop.',
        riskLevel: 'SAFE_REVERSIBLE',
        requiresConfirmation: false,
        hostRequired: 'WINDOWS_HOST_REQUIRED',
      },
      {
        toolId: 'windows.inspect_system',
        workerId: 'windows-worker',
        description: 'Inspect Win32 CIM OS build, CPU, RAM, GPU, battery, and installed browsers.',
        riskLevel: 'READ_ONLY',
        requiresConfirmation: false,
        hostRequired: 'WINDOWS_HOST_REQUIRED',
      },
      {
        toolId: 'customer.vault_crud',
        workerId: 'customer-worker',
        description: 'AES-256-GCM encrypted customer profile CRUD, masking, service history, and backup.',
        riskLevel: 'SAFE_REVERSIBLE',
        requiresConfirmation: false,
        hostRequired: 'CROSS_PLATFORM',
      },
      {
        toolId: 'model.gateway_complete',
        workerId: 'model-gateway',
        description: 'Route inference through quota-isolated Gemini project pools with automatic failover.',
        riskLevel: 'READ_ONLY',
        requiresConfirmation: false,
        hostRequired: 'CROSS_PLATFORM',
      },
    ];
  }
}

export class WorkerManager {
  constructor(
    private readonly browserWorker: BrowserWorker,
    private readonly adbWorker: AdbWorker,
    private readonly geminiAdapter: GeminiProviderAdapter,
    private readonly windowsWorker?: WindowsWorker
  ) {}

  async listWorkers(): Promise<WorkerContract[]> {
    const isWindows = process.platform === 'win32';
    const browserSession = await this.browserWorker.inspectSession();
    const adbStatus = this.adbWorker.inspectStatus();
    const winSupported = this.windowsWorker ? this.windowsWorker.isSupportedHost() : isWindows;

    return [
      {
        workerId: 'policy-engine',
        name: 'Security & Policy Guard',
        health: 'READY',
        capabilities: ['secret_scrubbing', 'c_drive_guard', 'risk_classification_r0_r5', 'negation_aware_guard', 'confirmation_gate'],
        permissions: ['read:prompts', 'block:destructive_os_ops'],
        timeoutMs: 250,
        maxRetries: 0,
        resourceLimits: { maxRamMB: 16, maxCpuPercent: 2 },
        verificationContract: 'Deterministic R0-R5 rule verdict + zero secret persistence',
        hostRequired: 'CROSS_PLATFORM',
      },
      {
        workerId: 'telemetry-adapter',
        name: 'Host OS Telemetry Adapter',
        health: 'READY',
        capabilities: ['cpu_load', 'ram_usage', 'nx_rss', 'network_delta', 'process_list'],
        permissions: ['os:read_counters', isWindows ? 'powershell:Get-Process' : 'posix:ps'],
        timeoutMs: 2500,
        maxRetries: 1,
        resourceLimits: { maxRamMB: 32, maxCpuPercent: 5 },
        verificationContract: 'Non-synthetic OS counters with source & freshnessMs',
        hostRequired: isWindows ? 'CROSS_PLATFORM' : 'WINDOWS_HOST_REQUIRED',
      },
      {
        workerId: 'windows-worker',
        name: 'Windows Desktop & UIA Worker',
        health: winSupported ? 'READY' : 'UNAVAILABLE',
        capabilities: ['foreground_window_inspect', 'windows_cim_specs', 'allowlisted_app_launch', 'browser_auto_launch'],
        permissions: ['win32:Get-Process', 'win32:Get-CimInstance', 'win32:spawn_allowlisted'],
        timeoutMs: 6000,
        maxRetries: 1,
        resourceLimits: { maxRamMB: 40, maxCpuPercent: 10 },
        verificationContract: 'Win32 MainWindowTitle & CIM specs readback; fails closed on non-Windows hosts',
        hostRequired: 'WINDOWS_HOST_REQUIRED',
      },
      {
        workerId: 'storage-worker',
        name: 'Storage & Transactional Copy Worker',
        health: 'READY',
        capabilities: [
          'volume_discovery',
          '12_point_preflight',
          'fat32_4gb_guard',
          'sha256_transactional_copy',
          'safe_file_folder_crud',
          'safe_eject',
        ],
        permissions: ['fs:read', 'fs:write_non_os', 'os:unmount'],
        timeoutMs: 30000,
        maxRetries: 2,
        resourceLimits: { maxRamMB: 64, maxCpuPercent: 20 },
        verificationContract: 'Source vs written SHA-256 checksum parity + OS mount verification',
        hostRequired: isWindows ? 'CROSS_PLATFORM' : 'WINDOWS_HOST_REQUIRED',
      },
      {
        workerId: 'media-worker',
        name: 'Local Media Scanner & Playback Worker',
        health: winSupported ? 'READY' : 'UNAVAILABLE',
        capabilities: ['media_folder_scan', 'audio_video_playback'],
        permissions: ['fs:read_media_dirs', 'win32:Start-Process'],
        timeoutMs: 5000,
        maxRetries: 1,
        resourceLimits: { maxRamMB: 32, maxCpuPercent: 8 },
        verificationContract: 'Real filesystem media enumeration; playback requires Windows desktop host',
        hostRequired: 'WINDOWS_HOST_REQUIRED',
      },
      {
        workerId: 'browser-worker',
        name: 'CDP Browser Worker',
        health: browserSession.cdpConnected ? 'READY' : 'UNAVAILABLE',
        capabilities: ['binary_probe', 'cdp_auto_launch', 'cdp_session_inspect', 'cdp_navigate_verify'],
        permissions: ['net:localhost_9222'],
        timeoutMs: 5000,
        maxRetries: 1,
        resourceLimits: { maxRamMB: 64, maxCpuPercent: 10 },
        verificationContract: 'Observe -> Auto-Launch/Attach -> CDP action -> Re-observe /json/list verification',
        hostRequired: 'CROSS_PLATFORM',
      },
      {
        workerId: 'adb-worker',
        name: 'Android ADB Bridge Worker',
        health: adbStatus.isConnected ? 'READY' : 'UNAVAILABLE',
        capabilities: ['adb_devices_probe', 'device_properties', 'battery_inspect', 'adb_ping'],
        permissions: ['cli:adb'],
        timeoutMs: 2500,
        maxRetries: 1,
        resourceLimits: { maxRamMB: 32, maxCpuPercent: 8 },
        verificationContract: 'Real adb devices -l output without synthetic devices',
        hostRequired: 'CROSS_PLATFORM',
      },
      {
        workerId: 'customer-worker',
        name: 'Encrypted Customer Vault Worker',
        health: 'READY',
        capabilities: ['aes_256_gcm_customer_crud', 'cnic_phone_imei_masking', 'service_history', 'encrypted_backup_restore'],
        permissions: ['vault:read_write_encrypted'],
        timeoutMs: 1000,
        maxRetries: 0,
        resourceLimits: { maxRamMB: 32, maxCpuPercent: 5 },
        verificationContract: 'AES-256-GCM encryption on disk + default sensitive masking + secret-free audit logs',
        hostRequired: 'CROSS_PLATFORM',
      },
      {
        workerId: 'model-gateway',
        name: 'Multi-Project Model Gateway',
        health: this.geminiAdapter.isConfigured() ? 'READY' : 'DEGRADED',
        capabilities: ['gemini_inference', 'multi_platform_discovery', 'error_classification', 'auto_failover'],
        permissions: ['env:GEMINI_API_KEY', 'net:generativelanguage'],
        timeoutMs: 15000,
        maxRetries: 2,
        resourceLimits: { maxRamMB: 48, maxCpuPercent: 10 },
        verificationContract: 'Real live provider verification & capability-filtered model routing',
        hostRequired: 'CROSS_PLATFORM',
      },
      {
        workerId: 'memory-engine',
        name: '7-Layer Persistent Memory Engine',
        health: 'READY',
        capabilities: ['atomic_disk_write', 'reload_verification', 'secret_redaction'],
        permissions: ['fs:read_write_data_dir'],
        timeoutMs: 1000,
        maxRetries: 1,
        resourceLimits: { maxRamMB: 24, maxCpuPercent: 5 },
        verificationContract: 'Temp write + renameSync + reload parity check',
        hostRequired: 'CROSS_PLATFORM',
      },
      {
        workerId: 'verification-engine',
        name: 'Executable Verification Harness',
        health: 'READY',
        capabilities: ['runtime_suite_execution', 'evidence_capture', 'truth_status_reporting'],
        permissions: ['read:all_workers'],
        timeoutMs: 15000,
        maxRetries: 0,
        resourceLimits: { maxRamMB: 48, maxCpuPercent: 10 },
        verificationContract: 'Zero static PASS fabrication; captures command, stdout, stderr, expected, actual',
        hostRequired: 'CROSS_PLATFORM',
      },
    ];
  }
}
