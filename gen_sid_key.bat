@echo off
setlocal enabledelayedexpansion

set "L=26"

for /f "usebackq delims=" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$bytes = New-Object byte[] 64; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); $b64 = [Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]',''; $b64.Substring(0,%L%)"`) do (
  set "cle=%%A"
)

if not defined cle (
  echo Erreur: generation de la cle a echoue.
  pause
  exit /b 1
)

echo %cle%
exit /b 0
