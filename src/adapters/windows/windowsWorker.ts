/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync, execSync, spawn } from 'child_process';

export type AllowedWindowsApp = 'notepad' | 'calc' | 'explorer' | 'chrome' | 'msedge';

const ALLOWED_APPS: Record<AllowedWindowsApp, { executable: string; processName: string }> = {
  notepad: { executable: 'notepad.exe', processName: 'notepad' },
  calc: { executable: 'calc.exe', processName: 'CalculatorApp' },
  explorer: { executable: 'explorer.exe', processName: 'explorer' },
  chrome: { executable: 'chrome.exe', processName: 'chrome' },
  msedge: { executable: 'msedge.exe', processName: 'msedge' },
};

export interface ForegroundWindowResult {
  ok: boolean;
  code: 'VERIFIED' | 'WINDOWS_HOST_REQUIRED' | 'UNAVAILABLE' | 'COMMAND_FAILED';
  message: string;
  window?: {
    title: string;
    processName: string;
    pid: number;
  };
  capturedAt: number;
}

export interface LaunchAppResult {
  ok: boolean;
  code: 'VERIFIED' | 'WINDOWS_HOST_REQUIRED' | 'APP_NOT_ALLOWLISTED' | 'LAUNCH_FAILED';
  message: string;
  app?: string;
  verifiedPid?: number | null;
  checkedAt: number;
}

export interface WindowsSystemInspectionResult {
  ok: boolean;
  code: 'VERIFIED' | 'WINDOWS_HOST_REQUIRED' | 'COMMAND_FAILED';
  message: string;
  specs?: {
    osCaption: string;
    osVersion: string;
    buildNumber: string;
    cpuName: string;
    totalRamGB: number;
    freeRamGB: number;
    gpuNames: string[];
    manufacturer: string;
    model: string;
    batteryPercent: number | null;
    installedBrowsers: string[];
  };
  capturedAt: number;
}

export class WindowsWorker {
  isSupportedHost(): boolean {
    return process.platform === 'win32';
  }

  inspectWindowsSystem(): WindowsSystemInspectionResult {
    const capturedAt = Date.now();
    if (!this.isSupportedHost()) {
      return {
        ok: false,
        code: 'WINDOWS_HOST_REQUIRED',
        message: `Windows hardware/OS CIM inspection requires a Windows host (current host: ${process.platform}).`,
        capturedAt,
      };
    }

    try {
      const psScript = [
        '$os = Get-CimInstance Win32_OperatingSystem',
        '$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1',
        '$cs = Get-CimInstance Win32_ComputerSystem',
        '$gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name })',
        '$bat = Get-CimInstance Win32_Battery | Select-Object -First 1',
        '$browsers = @()',
        "if (Get-Command chrome.exe -ErrorAction SilentlyContinue) { $browsers += 'chrome' }",
        "if (Get-Command msedge.exe -ErrorAction SilentlyContinue) { $browsers += 'msedge' }",
        '[PSCustomObject]@{',
        '  osCaption = $os.Caption',
        '  osVersion = $os.Version',
        '  buildNumber = $os.BuildNumber',
        '  cpuName = $cpu.Name',
        '  totalRamGB = [math]::Round($cs.TotalPhysicalMemory / 1GB, 2)',
        '  freeRamGB = [math]::Round(($os.FreePhysicalMemory * 1KB) / 1GB, 2)',
        '  gpuNames = $gpus',
        '  manufacturer = $cs.Manufacturer',
        '  model = $cs.Model',
        '  batteryPercent = if ($bat) { [int]$bat.EstimatedChargeRemaining } else { $null }',
        '  installedBrowsers = $browsers',
        '} | ConvertTo-Json -Compress',
      ].join('; ');

      const out = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', psScript],
        { timeout: 6000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
      ).trim();

      const parsed = JSON.parse(out);
      return {
        ok: true,
        code: 'VERIFIED',
        message: `${parsed.osCaption} (Build ${parsed.buildNumber}) · ${parsed.cpuName} · ${parsed.totalRamGB}GB RAM`,
        specs: parsed,
        capturedAt,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        code: 'COMMAND_FAILED',
        message: err instanceof Error ? err.message : 'Windows CIM system inspection failed.',
        capturedAt,
      };
    }
  }

  inspectForegroundWindow(): ForegroundWindowResult {
    const capturedAt = Date.now();
    if (!this.isSupportedHost()) {
      return {
        ok: false,
        code: 'WINDOWS_HOST_REQUIRED',
        message: `Win32 foreground window inspection requires Windows host (current: ${process.platform}).`,
        capturedAt,
      };
    }

    try {
      const psScript =
        "Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 1 Id,ProcessName,MainWindowTitle | ConvertTo-Json -Compress";
      const out = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', psScript],
        { timeout: 2500, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
      ).trim();

      if (!out) {
        return {
          ok: false,
          code: 'UNAVAILABLE',
          message: 'No GUI foreground window currently exposed by Win32 Get-Process.',
          capturedAt,
        };
      }

      const parsed = JSON.parse(out) as { Id?: number; ProcessName?: string; MainWindowTitle?: string };
      return {
        ok: true,
        code: 'VERIFIED',
        message: `Foreground window "${parsed.MainWindowTitle || 'Untitled'}" (${parsed.ProcessName || 'unknown'} #${parsed.Id ?? 0})`,
        window: {
          title: parsed.MainWindowTitle || 'Untitled',
          processName: parsed.ProcessName || 'unknown',
          pid: Number(parsed.Id) || 0,
        },
        capturedAt,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        code: 'COMMAND_FAILED',
        message: err instanceof Error ? err.message : 'PowerShell Win32 inspection failed.',
        capturedAt,
      };
    }
  }

  launchAllowedApp(appKey: string): LaunchAppResult {
    const checkedAt = Date.now();
    const normalized = appKey.trim().toLowerCase() as AllowedWindowsApp;
    const spec = ALLOWED_APPS[normalized];

    if (!spec) {
      return {
        ok: false,
        code: 'APP_NOT_ALLOWLISTED',
        message: `Application "${appKey}" is not in the safe Windows launch allowlist (${Object.keys(ALLOWED_APPS).join(', ')}).`,
        app: appKey,
        checkedAt,
      };
    }

    if (!this.isSupportedHost()) {
      return {
        ok: false,
        code: 'WINDOWS_HOST_REQUIRED',
        message: `Launching "${spec.executable}" requires a Windows desktop host (current: ${process.platform}).`,
        app: spec.executable,
        checkedAt,
      };
    }

    try {
      const child = spawn(spec.executable, [], { detached: true, stdio: 'ignore' });
      child.unref();
      const pid = child.pid ?? null;

      return {
        ok: pid !== null,
        code: pid !== null ? 'VERIFIED' : 'LAUNCH_FAILED',
        message:
          pid !== null
            ? `Launched ${spec.executable} (PID ${pid}) cleanly.`
            : `Process spawned for ${spec.executable} without an OS PID handle.`,
        app: spec.executable,
        verifiedPid: pid,
        checkedAt,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        code: 'LAUNCH_FAILED',
        message: err instanceof Error ? err.message : `Failed to start ${spec.executable}.`,
        app: spec.executable,
        checkedAt,
      };
    }
  }

  launchBrowserForAutomation(
    browser: 'chrome' | 'msedge' = 'chrome',
    port = 9222
  ): LaunchAppResult {
    const checkedAt = Date.now();
    const spec = ALLOWED_APPS[browser] || ALLOWED_APPS.chrome;

    if (!this.isSupportedHost()) {
      // On Linux only attempt if binary actually exists
      try {
        const bin = execSync(
          `which ${browser === 'msedge' ? 'microsoft-edge' : 'google-chrome'} || which chromium || which chromium-browser`,
          { timeout: 1000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
        )
          .trim()
          .split('\n')[0];
        if (!bin) {
          return {
            ok: false,
            code: 'WINDOWS_HOST_REQUIRED',
            message: `No desktop Chrome/Edge binary installed on ${process.platform}; desktop browser auto-launch requires Windows host or installed Chromium.`,
            app: spec.executable,
            checkedAt,
          };
        }
        const child = spawn(bin, [`--remote-debugging-port=${port}`, '--no-first-run'], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        return {
          ok: Boolean(child.pid),
          code: child.pid ? 'VERIFIED' : 'LAUNCH_FAILED',
          message: child.pid
            ? `Started ${bin} on CDP port ${port} (PID ${child.pid}).`
            : `Failed to obtain PID for ${bin}.`,
          app: bin,
          verifiedPid: child.pid ?? null,
          checkedAt,
        };
      } catch {
        return {
          ok: false,
          code: 'WINDOWS_HOST_REQUIRED',
          message: `Desktop browser launch requires Windows host or installed Chrome/Chromium binary (current: ${process.platform}).`,
          app: spec.executable,
          checkedAt,
        };
      }
    }

    try {
      const child = spawn(
        spec.executable,
        [`--remote-debugging-port=${port}`, '--no-first-run'],
        { detached: true, stdio: 'ignore' }
      );
      child.unref();
      return {
        ok: Boolean(child.pid),
        code: child.pid ? 'VERIFIED' : 'LAUNCH_FAILED',
        message: child.pid
          ? `Launched ${spec.executable} with CDP debugging on port ${port} (PID ${child.pid}).`
          : `Failed to obtain PID for ${spec.executable}.`,
        app: spec.executable,
        verifiedPid: child.pid ?? null,
        checkedAt,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        code: 'LAUNCH_FAILED',
        message: err instanceof Error ? err.message : `Failed to launch ${spec.executable}.`,
        app: spec.executable,
        checkedAt,
      };
    }
  }
}
