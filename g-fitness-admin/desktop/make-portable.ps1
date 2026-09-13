# Builds a folder you can copy to another computer: the .exe, the server it
# starts, and the built dashboard, all in one place.
#
#   .\desktop\make-portable.ps1                  # onto the Desktop
#   .\desktop\make-portable.ps1 -Out D:\USB      # somewhere else
#
# The result needs Node.js and internet on the target machine, and nothing
# else: no repo, no npm install, no build. Roughly 6 MB.
#
# Layout is not arbitrary. CoreFitnessAdmin.exe looks for serve.mjs beside
# itself, then in a desktop\ folder under itself, BEFORE the absolute path
# compiled into it -- so this folder finds its own copy rather than reaching
# back into the repo. serve.mjs in turn serves ..\dist, which is why the two
# sit as siblings.
#
#     Core Fitness Admin\
#       Core Fitness Admin.exe
#       desktop\serve.mjs
#       dist\...
#
# Re-running is safe; it replaces the folder's contents.

param([string]$Out = [Environment]::GetFolderPath('Desktop'))

$ErrorActionPreference = 'Stop'

$here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$app    = Split-Path -Parent $here
$exe    = Join-Path $here 'CoreFitnessAdmin.exe'
$server = Join-Path $here 'serve.mjs'
$dist   = Join-Path $app  'dist'

if (-not (Test-Path $exe))    { & (Join-Path $here 'build-exe.ps1') -NoDesktop }
if (-not (Test-Path $server)) { throw "Missing serve.mjs: $server" }
if (-not (Test-Path (Join-Path $dist 'index.html'))) {
  throw "g-fitness-admin\dist is missing or unbuilt. Run 'npm run build' in $app first."
}

$root = Join-Path $Out 'Core Fitness Admin'
New-Item -ItemType Directory -Force -Path $root | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $root 'desktop') | Out-Null

Copy-Item $exe (Join-Path $root 'Core Fitness Admin.exe') -Force
Copy-Item $server (Join-Path $root 'desktop\serve.mjs') -Force

# -Recurse onto an existing target merges rather than replaces, which would
# leave last build's orphaned asset hashes behind. Clear it first.
$distOut = Join-Path $root 'dist'
if (Test-Path $distOut) { Remove-Item $distOut -Recurse -Force }
Copy-Item $dist $distOut -Recurse -Force

@"
Core Fitness Admin
==================

Double-click "Core Fitness Admin.exe". The dashboard opens in its own window.
Close the window and it stops -- there is nothing left running.

This folder needs two things on the computer it runs on:

  1. Node.js -- https://nodejs.org, the LTS build. The dashboard is served by
     Node. Without it the .exe says so and does nothing else.
  2. Internet. The member records live in Supabase, in the cloud. This folder
     holds the screens, not the data.

Keep the three items together. The .exe on its own is 84 KB and cannot run
anything; it starts desktop\serve.mjs, which serves dist\.

Nothing here listens to the network beyond this machine: the server binds to
127.0.0.1, so no other computer can reach it, by design.

Built $(Get-Date -Format 'yyyy-MM-dd HH:mm') from the Core Fitness repository.
Rebuild with g-fitness-admin\desktop\make-portable.ps1 after the code changes.
"@ | Set-Content -Path (Join-Path $root 'READ ME FIRST.txt') -Encoding utf8

$mb = [math]::Round((Get-ChildItem $root -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
Write-Output "built: $root  ($mb MB)"
