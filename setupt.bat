@echo off
setlocal enabledelayedexpansion

rem 1) Se placer à la racine du dépôt (dossier de ce script)
cd /d "%~dp0"

rem 2) Créer le dossier data s'il n'existe pas
if not exist "data" mkdir "data"

rem 3) Générer CLE_SID avec le script fourni (note: gen_sid_key.bat demande d'appuyer sur une touche)
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

rem 4) Ecrire le fichier .env
(echo PORT=7750) > .env
(echo CLE_SID=%CLE_SID%) >> .env

echo ✔ Dossier data\ cree (ou deja present)
echo ✔ Fichier .env cree avec PORT=7750 et CLE_SID generee
