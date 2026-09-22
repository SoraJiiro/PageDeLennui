@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

if not exist "data" mkdir "data"
if not exist "Server" (
  echo Erreur: dossier Server introuvable a la racine. >&2
  exit /b 1
)

for /f %%I in ('call "gen_sid_key.bat"') do set "CLE_SID=%%I"
if not defined CLE_SID (
  echo Erreur: generation de CLE_SID a echoue. >&2
  exit /b 1
)

(
  echo PORT=7750
  echo CLE_SID=%CLE_SID%
  echo APP_PSWD=zumvyewmcbpaiadd
  echo SECONDARY_UI_KILLSWITCH=false
) > "Server\.env"

echo ^> Dossier data/ cree
 echo ^> Fichier .env cree
endlocal
