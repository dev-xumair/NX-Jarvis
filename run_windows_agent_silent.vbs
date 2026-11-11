' NX AI Windows Autonomous Agent - Silent Desktop Launcher
' Runs NX AI in the background without persistent Command Prompt window
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c run_windows_agent.bat", 0, False
Set WshShell = Nothing
