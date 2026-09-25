$ErrorActionPreference = "Stop"

$openFrontPath = Join-Path $PSScriptRoot "..\OpenFront"
if (-not (Test-Path (Join-Path $openFrontPath "package.json"))) {
  throw "OpenFront introuvable dans $openFrontPath"
}

Push-Location $openFrontPath
try {
  if (-not (Test-Path "node_modules")) {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "Installation OpenFront echouee" }
  }

  $env:VITE_HOST = "lan"
  $env:SKIP_BROWSER_OPEN = "true"
  $env:GAME_ENV = "dev"
  $env:TURNSTILE_SITE_KEY = "1x00000000000000000000AA"
  $env:API_KEY = "WARNING_DEV_API_KEY_DO_NOT_USE_IN_PRODUCTION"
  $env:ADMIN_BOT_API_KEY = "WARNING_DEV_ADMIN_BOT_KEY_DO_NOT_USE_IN_PRODUCTION"
  $env:DOMAIN = "localhost"
  $env:GIT_COMMIT = "DEV"
  $env:PDE_BRIDGE_URL = if ($env:PDE_BRIDGE_URL) { $env:PDE_BRIDGE_URL } else { "http://192.168.197.13:7750/api/integrations/openfront/events" }
  $env:OPENFRONT_BRIDGE_SECRET = if ($env:OPENFRONT_BRIDGE_SECRET) { $env:OPENFRONT_BRIDGE_SECRET } else { "change-this-openfront-bridge-secret" }

  Start-Process powershell -WorkingDirectory $openFrontPath -ArgumentList "-NoExit", "-Command", "npm run start:server-dev"
  Start-Process powershell -WorkingDirectory $openFrontPath -ArgumentList "-NoExit", "-Command", "npm run start:client"
  Write-Host "OpenFront LAN: http://$env:COMPUTERNAME`:9000"
} finally {
  Pop-Location
}