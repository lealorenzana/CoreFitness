# Put "Core Fitness Platform" on the Desktop and in the Start menu (the platform owner's app, localhost only).
# Run once per machine; re-running overwrites the same two shortcuts. Build first: npm run build in corefitness-platform.
# The shortcut targets wscript.exe so no console window sits beside the app (see launch.vbs).

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs  = Join-Path $here 'launch.vbs'
$icon = Join-Path $here 'core-fitness-platform.ico'
$dist = Join-Path $here '..\dist\index.html'

if (-not (Test-Path $vbs))  { throw "Missing launcher: $vbs" }
if (-not (Test-Path $dist)) { Write-Warning "corefitness-platform\dist is missing. Run 'npm run build' in corefitness-platform first." }

$shell   = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$start   = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'

foreach ($dir in @($desktop, $start)) {
  $lnk = Join-Path $dir 'Core Fitness Platform.lnk'
  $s = $shell.CreateShortcut($lnk)
  $s.TargetPath       = "$env:SystemRoot\System32\wscript.exe"
  $s.Arguments        = '"' + $vbs + '"'
  $s.WorkingDirectory = $here
  $s.IconLocation     = "$icon,0"
  $s.Description      = 'Core Fitness platform: every gym, billing and applications'
  $s.WindowStyle      = 1
  $s.Save()
  Write-Output "created: $lnk"
}
