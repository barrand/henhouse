$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectId = if ($env:FIREBASE_PROJECT_ID) { $env:FIREBASE_PROJECT_ID } else { 'flock-together-game' }
$firebaseCli = Join-Path $root 'node_modules\.bin\firebase.cmd'
$viteCli = Join-Path $root 'node_modules\.bin\vite.cmd'
$logRoot = Join-Path $env:TEMP 'henhouse-dev-local'
$emulatorOut = Join-Path $logRoot 'emulators.out.log'
$emulatorErr = Join-Path $logRoot 'emulators.err.log'
$viteOut = Join-Path $logRoot 'vite.out.log'
$viteErr = Join-Path $logRoot 'vite.err.log'
$children = @()

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
  if (-not (Test-Path $firebaseCli)) { throw "Firebase CLI not found at $firebaseCli. Run npm install first." }
  if (-not (Test-Path $viteCli)) { throw "Vite not found at $viteCli. Run npm install first." }

  New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
  Write-Host 'Building functions...'
  & npm --prefix (Join-Path $root 'functions') run build
  if ($LASTEXITCODE -ne 0) { throw 'Functions build failed.' }

  Write-Host "Starting Firebase emulators for project $projectId..."
  $emulator = Start-Process -FilePath $firebaseCli `
    -ArgumentList @('emulators:start', '--project', $projectId) `
    -WorkingDirectory $root -RedirectStandardOutput $emulatorOut `
    -RedirectStandardError $emulatorErr -WindowStyle Hidden -PassThru
  $children += $emulator

  Wait-ForPort 8080 'Firebase emulators' $emulator
  Wait-ForPort 9099 'Auth emulator' $emulator
  Wait-ForPort 5001 'Functions emulator' $emulator
  Wait-ForPort 9000 'Realtime Database emulator' $emulator
  Wait-ForPort 4000 'Firebase Emulator UI' $emulator
  Start-Sleep -Seconds 3

  Write-Host 'Starting Vite dev server...'
  $vite = Start-Process -FilePath $viteCli `
    -ArgumentList @('--host', 'localhost', '--port', '5173', '--strictPort') `
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

  while ($true) {
    if ($emulator.HasExited) { throw "Firebase emulators exited. See $emulatorErr" }
    if ($vite.HasExited) { throw "Vite exited. See $viteErr" }
    Start-Sleep -Seconds 1
  }
}
finally {
  foreach ($child in $children) {
    if ($child -and -not $child.HasExited) {
      Stop-Process -Id $child.Id -Force -ErrorAction SilentlyContinue
    }
  }
}
