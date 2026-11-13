/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';
import type {
  ActiveWindowProcess,
  LiveSystemTelemetry,
  TelemetryMetric,
  TelemetryStatus,
} from '../../types/agent.ts';
import { StorageWorker } from '../storage/storageWorker.ts';

export class TelemetryAdapter {
  private prevCpuTimes = os.cpus();
  private prevNetSample: { bytesTotal: number; capturedAt: number } | null = null;
  private cachedProcesses: { list: ActiveWindowProcess[]; status: TelemetryStatus; capturedAt: number } = {
    list: [],
    status: 'UNAVAILABLE',
    capturedAt: 0,
  };
  private readonly storageWorker: StorageWorker;

  constructor(storageWorker = new StorageWorker()) {
    this.storageWorker = storageWorker;
  }

  sampleCpuLoad(): TelemetryMetric<number> {
    const now = Date.now();
    try {
      const currentCpus = os.cpus();
      let idleDelta = 0;
      let totalDelta = 0;

      for (let i = 0; i < currentCpus.length; i++) {
        const prev = this.prevCpuTimes[i]?.times || { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 };
        const curr = currentCpus[i].times;
        const prevTotal = prev.user + prev.nice + prev.sys + prev.idle + prev.irq;
        const currTotal = curr.user + curr.nice + curr.sys + curr.idle + curr.irq;
        totalDelta += currTotal - prevTotal;
        idleDelta += curr.idle - prev.idle;
      }

      this.prevCpuTimes = currentCpus;

      if (totalDelta <= 0) {
        const load1m = os.loadavg()[0];
        const cores = Math.max(1, currentCpus.length);
        const est = Math.min(100, Math.max(0, Math.round((load1m / cores) * 100)));
        return {
          value: est,
          unit: '%',
          source: 'os.loadavg',
          capturedAt: now,
          freshnessMs: 0,
          status: 'LIVE',
        };
      }

      const usage = Math.round(((totalDelta - idleDelta) / totalDelta) * 100);
      return {
        value: Math.max(0, Math.min(100, usage)),
        unit: '%',
        source: 'os.cpus',
        capturedAt: now,
        freshnessMs: 0,
        status: 'LIVE',
      };
    } catch (err: unknown) {
      return {
        value: null,
        unit: '%',
        source: 'os.cpus',
        capturedAt: now,
        freshnessMs: 0,
        status: 'ERROR',
        detail: err instanceof Error ? err.message : 'CPU sample failed',
      };
    }
  }

  sampleMemory(): {
    ramUsedMB: TelemetryMetric<number>;
    ramTotalMB: TelemetryMetric<number>;
    nxProcessRssMB: TelemetryMetric<number>;
  } {
    const now = Date.now();
    const totalMB = Math.round(os.totalmem() / (1024 * 1024));
    const freeMB = Math.round(os.freemem() / (1024 * 1024));
    const usedMB = Math.max(0, totalMB - freeMB);
    const rssMB = Math.round(process.memoryUsage().rss / (1024 * 1024));

    return {
      ramUsedMB: {
        value: usedMB,
        unit: 'MB',
        source: 'os.freemem',
        capturedAt: now,
        freshnessMs: 0,
        status: 'LIVE',
      },
      ramTotalMB: {
        value: totalMB,
        unit: 'MB',
        source: 'os.totalmem',
        capturedAt: now,
        freshnessMs: 0,
        status: 'LIVE',
      },
      nxProcessRssMB: {
        value: rssMB,
        unit: 'MB',
        source: 'process.memoryUsage',
        capturedAt: now,
        freshnessMs: 0,
        status: 'LIVE',
      },
    };
  }

  sampleNetworkKBps(): TelemetryMetric<number> {
    const now = Date.now();
    if (process.platform === 'linux' && fs.existsSync('/proc/net/dev')) {
      try {
        const content = fs.readFileSync('/proc/net/dev', 'utf-8');
        const lines = content.split('\n').slice(2);
        let bytesTotal = 0;
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('lo:')) continue;
          const parts = trimmed.split(/[:\s]+/).filter(Boolean);
          if (parts.length >= 10) {
            bytesTotal += (Number(parts[1]) || 0) + (Number(parts[9]) || 0);
          }
        }
        if (this.prevNetSample && now > this.prevNetSample.capturedAt) {
          const dtSec = (now - this.prevNetSample.capturedAt) / 1000;
          const deltaBytes = Math.max(0, bytesTotal - this.prevNetSample.bytesTotal);
          const kbps = Number((deltaBytes / 1024 / dtSec).toFixed(1));
          this.prevNetSample = { bytesTotal, capturedAt: now };
          return {
            value: kbps,
            unit: 'KB/s',
            source: '/proc/net/dev',
            capturedAt: now,
            freshnessMs: 0,
            status: 'LIVE',
          };
        }
        this.prevNetSample = { bytesTotal, capturedAt: now };
        return {
          value: 0,
          unit: 'KB/s',
          source: '/proc/net/dev',
          capturedAt: now,
          freshnessMs: 0,
          status: 'LIVE',
          detail: 'Baseline sample captured',
        };
      } catch {
        // Fallback to unavailable
      }
    }

    return {
      value: null,
      unit: 'KB/s',
      source: process.platform === 'win32' ? 'win32_perf' : '/proc/net/dev',
      capturedAt: now,
      freshnessMs: 0,
      status: 'UNAVAILABLE',
      detail: 'Network throughput counter unavailable on this host',
    };
  }

  discoverProcesses(force = false): { processes: ActiveWindowProcess[]; status: TelemetryStatus } {
    const now = Date.now();
    if (!force && now - this.cachedProcesses.capturedAt < 2500 && this.cachedProcesses.capturedAt > 0) {
      return { processes: this.cachedProcesses.list, status: this.cachedProcesses.status };
    }

    if (process.platform === 'win32') {
      try {
        const out = execSync(
          'powershell -NoProfile -Command "Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 12 Id,ProcessName,MainWindowTitle,WorkingSet64 | ConvertTo-Json -Compress"',
          { timeout: 2500, encoding: 'utf-8' }
        );
        const parsed = JSON.parse(out);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        const list: ActiveWindowProcess[] = arr
          .filter((p) => p && p.Id)
          .map((p, idx) => ({
            id: `proc-${p.Id}`,
            title: p.MainWindowTitle || p.ProcessName || 'Windows Process',
            processName: `${p.ProcessName}.exe`,
            isFocused: idx === 0,
            pid: Number(p.Id),
            cpuPercent: null,
            ramMB: Math.round((Number(p.WorkingSet64) || 0) / (1024 * 1024)),
            source: 'powershell_get_process',
          }));
        this.cachedProcesses = { list, status: 'LIVE', capturedAt: now };
        return { processes: list, status: 'LIVE' };
      } catch {
        this.cachedProcesses = { list: [], status: 'UNAVAILABLE', capturedAt: now };
        return { processes: [], status: 'UNAVAILABLE' };
      }
    }

    try {
      const totalMemMB = os.totalmem() / (1024 * 1024);
      const out = execSync('ps -eo pid,pcpu,pmem,comm --sort=-pcpu | head -n 13', {
        timeout: 1500,
        encoding: 'utf-8',
      });
      const lines = out.trim().split('\n').slice(1);
      const list: ActiveWindowProcess[] = [];
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          const pid = Number(parts[0]);
          const cpu = Number(parts[1]);
          const pmem = Number(parts[2]);
          const comm = parts.slice(3).join(' ');
          if (Number.isFinite(pid)) {
            list.push({
              id: `proc-${pid}`,
              title: `${comm} (PID ${pid})`,
              processName: comm,
              isFocused: pid === process.pid,
              pid,
              cpuPercent: Number.isFinite(cpu) ? cpu : null,
              ramMB: Number.isFinite(pmem) ? Math.round((pmem / 100) * totalMemMB) : null,
              source: 'posix_ps',
            });
          }
        }
      }
      this.cachedProcesses = { list, status: list.length > 0 ? 'LIVE' : 'UNAVAILABLE', capturedAt: now };
      return { processes: list, status: this.cachedProcesses.status };
    } catch {
      this.cachedProcesses = { list: [], status: 'UNAVAILABLE', capturedAt: now };
      return { processes: [], status: 'UNAVAILABLE' };
    }
  }

  captureSnapshot(): LiveSystemTelemetry {
    const now = Date.now();
    const cpuLoad = this.sampleCpuLoad();
    const mem = this.sampleMemory();
    const networkSpeedKBps = this.sampleNetworkKBps();
    const storageDevices = this.storageWorker.discoverVolumes();
    const { processes, status: processesStatus } = this.discoverProcesses();
    const primaryDrive = storageDevices[0]?.letter || '/';

    return {
      cpuLoad,
      ramUsedMB: mem.ramUsedMB,
      ramTotalMB: mem.ramTotalMB,
      nxProcessRssMB: mem.nxProcessRssMB,
      diskActivity: {
        readSpeedMBs: {
          value: null,
          unit: 'MB/s',
          source: process.platform === 'win32' ? 'win32_perf' : 'host_io',
          capturedAt: now,
          freshnessMs: 0,
          status: 'UNAVAILABLE',
          detail: 'Per-second block I/O throughput counter unavailable without elevated host sampler',
        },
        writeSpeedMBs: {
          value: null,
          unit: 'MB/s',
          source: process.platform === 'win32' ? 'win32_perf' : 'host_io',
          capturedAt: now,
          freshnessMs: 0,
          status: 'UNAVAILABLE',
          detail: 'Per-second block I/O throughput counter unavailable without elevated host sampler',
        },
        activeDrive: primaryDrive,
      },
      networkSpeedKBps,
      platformInfo: {
        os: os.platform(),
        release: os.release(),
        arch: os.arch(),
        hostname: os.hostname(),
        cpuCores: os.cpus().length,
        uptimeSeconds: Math.round(os.uptime()),
      },
      activeWindows: processes,
      processesStatus,
      storageDevices,
      lastUpdated: now,
    };
  }
}
