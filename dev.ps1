Param(
  [switch]$NoSeed
)

# Kill anything on 8545 to avoid port conflicts
try { $p = (Get-NetTCPConnection -LocalPort 8545 -State Listen -ErrorAction SilentlyContinue).OwningProcess; if ($p) { Stop-Process -Id $p -Force } } catch {}

$root = Split-Path $MyInvocation.MyCommand.Path -Parent
$contracts = Join-Path $root 'contracts'
$frontend = Join-Path $root 'src/pages'

# Start Ganache
Start-Process powershell -ArgumentList "-NoExit -Command cd `"$contracts`"; npm run chain" | Out-Null
Start-Sleep -Seconds 2

# Deploy + verify + seed
Start-Process powershell -ArgumentList "-NoExit -Command cd `"$contracts`"; npx hardhat compile; npm run deploy:ganache; npm run verify:ganache; if (-not $NoSeed) { npm run seed:ganache }" | Out-Null

# Start frontend
Start-Process powershell -ArgumentList "-NoExit -Command cd `"$frontend`"; npm run dev" | Out-Null

Write-Host "Started Ganache, deployed contracts, and launched the frontend."