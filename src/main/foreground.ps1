param(
  [ValidateSet("capture", "restore")]
  [string]$Mode = "capture",
  [long]$Hwnd = 0
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class TranscribeBroWin32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
}
"@

if ($Mode -eq "capture") {
  $handle = [TranscribeBroWin32]::GetForegroundWindow()
  if ($handle -eq [IntPtr]::Zero) {
    Write-Output "{}"
    exit 1
  }

  $classBuilder = New-Object System.Text.StringBuilder 256
  [void][TranscribeBroWin32]::GetClassName($handle, $classBuilder, $classBuilder.Capacity)
  $titleBuilder = New-Object System.Text.StringBuilder 512
  [void][TranscribeBroWin32]::GetWindowText($handle, $titleBuilder, $titleBuilder.Capacity)

  $processId = [uint32]0
  [void][TranscribeBroWin32]::GetWindowThreadProcessId($handle, [ref]$processId)
  $processName = ""
  try {
    $processName = (Get-Process -Id $processId -ErrorAction Stop).ProcessName
  } catch {
    $processName = ""
  }

  $exeName = if ($processName) { "$processName.exe" } else { "" }
  $className = $classBuilder.ToString()
  $terminalClasses = @("ConsoleWindowClass", "CASCADIA_HOSTING_WINDOW_CLASS")
  $terminalExes = @(
    "windowsterminal.exe", "wt.exe", "termius.exe", "tabby.exe", "wave.exe",
    "rio.exe", "mintty.exe", "conemu.exe", "conemu64.exe"
  )
  $isTerminal = ($terminalClasses -contains $className) -or ($terminalExes -contains $exeName.ToLowerInvariant())

  [pscustomobject]@{
    hwnd = $handle.ToInt64().ToString()
    title = $titleBuilder.ToString()
    className = $className
    exeName = $exeName
    isTerminal = $isTerminal
  } | ConvertTo-Json -Compress
  exit 0
}

if ($Mode -eq "restore") {
  if ($Hwnd -le 0) { exit 2 }
  $handle = [IntPtr]$Hwnd
  if (-not [TranscribeBroWin32]::IsWindow($handle)) { exit 3 }
  if ([TranscribeBroWin32]::IsIconic($handle)) {
    [void][TranscribeBroWin32]::ShowWindow($handle, 9)
  }
  [void][TranscribeBroWin32]::SetForegroundWindow($handle)
  Start-Sleep -Milliseconds 90
  exit 0
}

exit 1
