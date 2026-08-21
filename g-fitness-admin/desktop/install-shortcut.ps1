# Put "Core Fitness Admin" on the Desktop and in the Start menu.
#
# Run once per machine. Re-running is safe — it overwrites the same two files.
#
# The shortcut targets wscript.exe rather than node.exe on purpose: node is a
# console program, so a shortcut pointing at it parks a black terminal on the
# taskbar next to the dashboard for as long as it is open. launch.vbs starts
# the same process with the window hidden.

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs  = Join-Path $here 'launch.vbs'
$icon = Join-Path $here 'core-fitness-admin.ico'
$dist = Join-Path $here '..\dist\index.html'

if (-not (Test-Path $vbs))  { throw "Missing launcher: $vbs" }
if (-not (Test-Path $icon)) { & (Join-Path $here 'make-icon.ps1') }
if (-not (Test-Path $dist)) {
  Write-Warning "g-fitness-admin\dist is missing. Run 'npm run build' in g-fitness-admin, or the icon will only show a message."
}

$shell   = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$start   = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'

foreach ($dir in @($desktop, $start)) {
  $lnk = Join-Path $dir 'Core Fitness Admin.lnk'
  $s = $shell.CreateShortcut($lnk)
  $s.TargetPath       = "$env:SystemRoot\System32\wscript.exe"
  $s.Arguments        = '"' + $vbs + '"'
  $s.WorkingDirectory = $here
  $s.IconLocation     = "$icon,0"
  $s.Description      = 'Core Fitness gym management — admin dashboard'
  $s.WindowStyle      = 1
  $s.Save()
  Write-Output "created: $lnk"
}
