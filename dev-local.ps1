$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectId = if ($env:FIREBASE_PROJECT_ID) { $env:FIREBASE_PROJECT_ID } else { 'flock-together-game' }
$nodeExe = (Get-Command node -ErrorAction Stop).Source
$firebaseJs = Join-Path $root 'node_modules\firebase-tools\lib\bin\firebase.js'
$viteJs = Join-Path $root 'node_modules\vite\bin\vite.js'
$logRoot = Join-Path $env:TEMP 'henhouse-dev-local'
$emulatorOut = Join-Path $logRoot 'emulators.out.log'
$emulatorErr = Join-Path $logRoot 'emulators.err.log'
$viteOut = Join-Path $logRoot 'vite.out.log'
$viteErr = Join-Path $logRoot 'vite.err.log'
$children = @()
$stopRequested = $false

function Stop-ProcessTree([int]$processId) {
  $descendants = Get-CimInstance Win32_Process -Filter "ParentProcessId = $processId" -ErrorAction SilentlyContinue
  foreach ($descendant in $descendants) {
    Stop-ProcessTree ([int]$descendant.ProcessId)
  }
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

function Clear-LocalDevPorts {
  foreach ($port in @(4000, 5001, 5173, 8080, 9000, 9099)) {
    $owners = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($owner in $owners) {
      Stop-ProcessTree ([int]$owner)
    }
  }
}

function Enable-LocalJevAdmission {
  $adminPackage = Join-Path $root 'functions\node_modules\firebase-admin'
  $seed = @'
const admin = require(process.argv[1])
admin.initializeApp({ projectId: process.argv[2] })
admin.firestore().doc('aiExperimentConfig/jev').set({
  admissionEnabled: true,
  mode: 'jev',
  approvedConfigVersion: 'jev-playtest-v2',
  enabledOperations: { clue: true, guess: true, grouping: true },
}).then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) })
'@
  $previousFirestoreHost = $env:FIRESTORE_EMULATOR_HOST
  $env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  & $nodeExe -e $seed $adminPackage $projectId
  $exitCode = $LASTEXITCODE
  if ($previousFirestoreHost) { $env:FIRESTORE_EMULATOR_HOST = $previousFirestoreHost } else { Remove-Item Env:FIRESTORE_EMULATOR_HOST -ErrorAction SilentlyContinue }
  if ($exitCode -ne 0) { throw 'Could not seed local Jev admission config.' }
  Write-Host 'Local Jev admission enabled for the emulator.'
}

function Import-EnvFile([string]$path) {
  if (-not (Test-Path $path)) { return }
  foreach ($line in Get-Content $path) {
    if ($line -match '^\s*(VITE_[A-Za-z0-9_]+)\s*=\s*(.*)\s*$') {
      $name = $matches[1]
      $value = $matches[2].Trim().Trim('"').Trim("'")
      if (-not [Environment]::GetEnvironmentVariable($name)) {
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
      }
    }
  }
}

Import-EnvFile (Join-Path $root '.env')
Import-EnvFile (Join-Path $root '.env.production')
$env:VITE_USE_EMULATORS = 'true'
Clear-LocalDevPorts

$cancelHandler = [ConsoleCancelEventHandler]{
  param($sender, $eventArgs)
  $eventArgs.Cancel = $true
  $script:stopRequested = $true
}
[Console]::add_CancelKeyPress($cancelHandler)

function Wait-ForPort([int]$port, [string]$name, [System.Diagnostics.Process]$process) {
  for ($attempt = 0; $attempt -lt 90; $attempt++) {
    if ($process.HasExited) {
      throw "$name exited before port $port opened. See $emulatorErr"
    }
    $open = Test-NetConnection -ComputerName '127.0.0.1' -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue
    if ($open) { return }
    Start-Sleep -Milliseconds 500
  }
  throw "$name did not open port $port in time"
}

try {
  if (-not (Test-Path $firebaseJs)) { throw "Firebase CLI not found at $firebaseJs. Run npm install first." }
  if (-not (Test-Path $viteJs)) { throw "Vite not found at $viteJs. Run npm install first." }

  New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
  Write-Host 'Building functions...'
  & npm --prefix (Join-Path $root 'functions') run build
  if ($LASTEXITCODE -ne 0) { throw 'Functions build failed.' }

  Write-Host "Starting Firebase emulators for project $projectId..."
  $emulator = Start-Process -FilePath $nodeExe `
    -ArgumentList @($firebaseJs, 'emulators:start', '--project', $projectId) `
    -WorkingDirectory $root -RedirectStandardOutput $emulatorOut `
    -RedirectStandardError $emulatorErr -WindowStyle Hidden -PassThru
  $children += $emulator

  Wait-ForPort 8080 'Firebase emulators' $emulator
  Wait-ForPort 9099 'Auth emulator' $emulator
  Wait-ForPort 5001 'Functions emulator' $emulator
  Wait-ForPort 9000 'Realtime Database emulator' $emulator
  Wait-ForPort 4000 'Firebase Emulator UI' $emulator
  Enable-LocalJevAdmission
  Start-Sleep -Seconds 3

  Write-Host 'Starting Vite dev server...'
  $vite = Start-Process -FilePath $nodeExe `
    -ArgumentList @($viteJs, '--host', '0.0.0.0', '--port', '5173', '--strictPort') `
    -WorkingDirectory $root -RedirectStandardOutput $viteOut `
    -RedirectStandardError $viteErr -WindowStyle Hidden -PassThru
  $children += $vite
  Wait-ForPort 5173 'Vite' $vite

  Write-Host ''
  Write-Host 'Local app: http://localhost:5173/'
  Write-Host 'Jev playtest: http://localhost:5173/jev'
  Write-Host 'Firebase Emulator UI: http://localhost:4000/'
  Write-Host "Logs: $logRoot"
  Write-Host 'Press Ctrl+C to stop everything.'

  while (-not $stopRequested) {
    if ($emulator.HasExited) { throw "Firebase emulators exited. See $emulatorErr" }
    if ($vite.HasExited) { throw "Vite exited. See $viteErr" }
    Start-Sleep -Seconds 1
  }
}
finally {
  [Console]::remove_CancelKeyPress($cancelHandler)
  foreach ($child in $children) {
    if ($child) {
      Stop-ProcessTree $child.Id
    }
  }
  Clear-LocalDevPorts
}
