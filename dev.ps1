<#
.SYNOPSIS
  Starts the full Fractionalisation dApp dev environment.

.DESCRIPTION
  1. Installs npm dependencies (contracts & frontend) if needed.
  2. Starts a local Ganache blockchain.
  3. Compiles, deploys, verifies, and (optionally) seeds contracts.
  4. Launches the Vite React frontend dev server.

.PARAMETER NoSeed
  Skip seeding sample data into the blockchain.

.PARAMETER SkipInstall
  Skip the npm-install step (useful after the first run).

.EXAMPLE
  .\dev.ps1                   # full start
  .\dev.ps1 -NoSeed           # start without seeding
  .\dev.ps1 -SkipInstall      # skip npm install
#>
Param(
  [switch]$NoSeed,
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$root      = Split-Path $MyInvocation.MyCommand.Path -Parent
$contracts = Join-Path $root 'contracts'
$frontend  = Join-Path $root 'src\pages'

# ── Helper: coloured log ─────────────────────────────────────────────────────
function Log($msg, $colour = 'Cyan') { Write-Host "[dev] $msg" -ForegroundColor $colour }

# ── 1. Install dependencies ──────────────────────────────────────────────────
if (-not $SkipInstall) {
  Log 'Installing contract dependencies...'
  Push-Location $contracts
  npm install --silent 2>&1 | Out-Null
  Pop-Location

  Log 'Installing frontend dependencies...'
  Push-Location $frontend
  npm install --silent 2>&1 | Out-Null
  Pop-Location
} else {
  Log 'Skipping npm install (SkipInstall flag set).' 'Yellow'
}

# ── 2. Free port 8545 ────────────────────────────────────────────────────────
try {
  $owners = (Get-NetTCPConnection -LocalPort 8545 -State Listen -ErrorAction SilentlyContinue).OwningProcess
  if ($owners) {
    Log 'Killing existing process on port 8545...' 'Yellow'
    $owners | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 1
  }
} catch {}

# ── 3. Start Ganache ─────────────────────────────────────────────────────────
Log 'Starting Ganache on port 8545...'
$ganacheCmd = "cd `"$contracts`"; npm run chain"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $ganacheCmd | Out-Null

# Wait until Ganache is actually listening
Log 'Waiting for Ganache to be ready...'
$maxWait = 30           # seconds
$elapsed = 0
while ($elapsed -lt $maxWait) {
  Start-Sleep -Seconds 1
  $elapsed++
  $listening = Get-NetTCPConnection -LocalPort 8545 -State Listen -ErrorAction SilentlyContinue
  if ($listening) { break }
}
if ($elapsed -ge $maxWait) {
  Log 'Ganache did not start within 30 s – aborting.' 'Red'
  exit 1
}
Log "Ganache ready after $elapsed s." 'Green'

# ── 4. Compile, deploy, verify, and seed contracts ───────────────────────────
Log 'Compiling and deploying contracts...'
$deployCmd = @"
cd `"$contracts`"
npx hardhat compile
npm run deploy:ganache
npm run verify:ganache
"@
if (-not $NoSeed) {
  $deployCmd += "`nnpm run seed:ganache"
}
Start-Process powershell -ArgumentList "-NoExit", "-Command", $deployCmd | Out-Null

# ── 5. Start the frontend ────────────────────────────────────────────────────
Log 'Starting Vite dev server (frontend)...'
$frontendCmd = "cd `"$frontend`"; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd | Out-Null

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ''
Log '=== All services launched ===' 'Green'
Log 'Ganache          -> http://127.0.0.1:8545'
Log 'Frontend (Vite)  -> http://localhost:5173'
Write-Host ''
Log 'Each service runs in its own PowerShell window.'
Log 'Close those windows (or press Ctrl+C in them) to stop.' 'Yellow'