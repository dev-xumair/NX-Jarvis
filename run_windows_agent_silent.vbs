' NX AI — Autonomous Windows Agent Silent Launcher
' Launches the local workstation server in background without persistent terminal window
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c run_windows_agent.bat", 0, False
Set WshShell = Nothing
