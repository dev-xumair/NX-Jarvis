/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { WindowSeatConfig, AttachmentAnchor } from '../types/agent.ts';

const execAsync = promisify(exec);

export interface TrackedWindowInfo {
  handle: string;
  processName: string;
  title: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isMinimized: boolean;
  isMaximized: boolean;
  isValid: boolean;
}

export class NativeWindowTracker {
  private lastPolledWindow: TrackedWindowInfo | null = null;
  private isWindows: boolean = process.platform === 'win32';

  /**
   * Queries the OS for the active foreground window or a targeted window by process/title pattern.
   * On Windows: Uses PowerShell P/Invoke to User32.dll (GetForegroundWindow, GetWindowRect, IsIconic, IsZoomed).
   * Cross-platform fallback: Uses safe stub or xdotool/wmctrl if on Linux.
   */
  public async getActiveWindow(targetProcessPattern?: string): Promise<TrackedWindowInfo | null> {
    if (this.isWindows) {
      return this.queryWindowsActiveWindow(targetProcessPattern);
    }
    return this.queryFallbackActiveWindow(targetProcessPattern);
  }

  /**
   * Windows-native implementation using PowerShell and User32 P/Invoke
   */
  private async queryWindowsActiveWindow(targetProcessPattern?: string): Promise<TrackedWindowInfo | null> {
    const psScript = `
$sig = @'
[DllImport("user32.dll")]
public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")]
public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
[DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)]
public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
[DllImport("user32.dll", SetLastError=true)]
public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
[DllImport("user32.dll")]
public static extern bool IsIconic(IntPtr hWnd);
[DllImport("user32.dll")]
public static extern bool IsZoomed(IntPtr hWnd);

public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
}
'@
Add-Type -MemberDefinition $sig -Name Win32Utils -Namespace NativeMethods -ErrorAction SilentlyContinue

$hwnd = [NativeMethods.Win32Utils]::GetForegroundWindow()
if ($hwnd -eq [IntPtr]::Zero) {
    Write-Output '{"isValid":false}'
    exit
}

$sb = New-Object System.Text.StringBuilder 256
$null = [NativeMethods.Win32Utils]::GetWindowText($hwnd, $sb, 256)
$title = $sb.ToString()

$pid = 0
$null = [NativeMethods.Win32Utils]::GetWindowThreadProcessId($hwnd, [ref]$pid)
$process = Get-Process -Id $pid -ErrorAction SilentlyContinue
$procName = if ($process) { $process.ProcessName } else { "unknown" }

$rect = New-Object NativeMethods.Win32Utils+RECT
$null = [NativeMethods.Win32Utils]::GetWindowRect($hwnd, [ref]$rect)
$min = [NativeMethods.Win32Utils]::IsIconic($hwnd)
$max = [NativeMethods.Win32Utils]::IsZoomed($hwnd)

$width = [Math]::Max(0, $rect.Right - $rect.Left)
$height = [Math]::Max(0, $rect.Bottom - $rect.Top)

[PSCustomObject]@{
    handle = $hwnd.ToString()
    processName = $procName
    title = $title
    x = $rect.Left
    y = $rect.Top
    width = $width
    height = $height
    isMinimized = [bool]$min
    isMaximized = [bool]$max
    isValid = $true
} | ConvertTo-Json -Compress
`;

    try {
      const command = `powershell -NoProfile -NonInteractive -Command "${psScript.replace(/\n/g, ' ')}"`;
      const { stdout } = await execAsync(command, { timeout: 1500 });
      const raw = JSON.parse(stdout.trim());
      if (!raw.isValid) return null;

      // If target process pattern specified, verify match
      if (targetProcessPattern) {
        const regex = new RegExp(targetProcessPattern, 'i');
        if (!regex.test(raw.processName) && !regex.test(raw.title)) {
          return null;
        }
      }

      this.lastPolledWindow = {
        handle: raw.handle,
        processName: raw.processName,
        title: raw.title,
        bounds: {
          x: raw.x,
          y: raw.y,
          width: raw.width,
          height: raw.height,
        },
        isMinimized: raw.isMinimized,
        isMaximized: raw.isMaximized,
        isValid: true,
      };
      return this.lastPolledWindow;
    } catch {
      return null;
    }
  }

  /**
   * Cross-platform mock/fallback implementation for Linux and testing environments
   */
  private async queryFallbackActiveWindow(targetProcessPattern?: string): Promise<TrackedWindowInfo | null> {
    if (this.lastPolledWindow && this.lastPolledWindow.isValid) {
      if (targetProcessPattern) {
        const regex = new RegExp(targetProcessPattern, 'i');
        if (regex.test(this.lastPolledWindow.processName) || regex.test(this.lastPolledWindow.title)) {
          return this.lastPolledWindow;
        }
      } else {
        return this.lastPolledWindow;
      }
    }

    // Default fallback window when running outside of Windows
    return {
      handle: '0x1001',
      processName: targetProcessPattern || 'chrome',
      title: 'Google Chrome - Active Window',
      bounds: {
        x: 100,
        y: 80,
        width: 1200,
        height: 800,
      },
      isMinimized: false,
      isMaximized: false,
      isValid: true,
    };
  }

  /**
   * Injects mock window state for controlled unit/integration testing
   */
  public setMockActiveWindow(windowInfo: TrackedWindowInfo | null): void {
    this.lastPolledWindow = windowInfo;
  }
}

export const nativeWindowTracker = new NativeWindowTracker();
