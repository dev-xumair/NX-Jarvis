# PowerShell script to verify Win32 window tracking on native Windows host
# Run on Windows: powershell -ExecutionPolicy Bypass -File scripts/test_windows_tracking.ps1

Write-Host "=== NX AI Desktop Companion - Win32 Window Tracking Test ===" -ForegroundColor Cyan

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
    Write-Host "[!] No foreground window active." -ForegroundColor Yellow
    exit 1
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

Write-Host "[+] Foreground Window Detected:" -ForegroundColor Green
Write-Host "    Process Name : $procName"
Write-Host "    Window Title : $title"
Write-Host "    Coordinates  : X=$($rect.Left), Y=$($rect.Top)"
Write-Host "    Dimensions   : Width=$width, Height=$height"
Write-Host "    State        : Minimized=$min, Maximized=$max"
Write-Host "=== Test Completed Successfully ===" -ForegroundColor Cyan
