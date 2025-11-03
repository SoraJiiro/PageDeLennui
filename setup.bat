@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

if not exist "data" mkdir "data"

set "CLE_SID="
for /f "usebackq delims=" %%A in (`"%~dp0gen_sid_key.bat"`) do (
  set "CLE_SID=%%A"
  goto :gotkey
)
:gotkey

if not defined CLE_SID (
  echo Erreur: generation CLE_SID echouee.
  exit /b 1
)


(echo PORT=7750) > Server/.env
(echo CLE_SID=%CLE_SID%) >> Server/.env

echo > Dossier data\ cree 
echo > Fichier .env cree 

pause