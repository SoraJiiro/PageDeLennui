@echo off
setlocal enabledelayedexpansion

set NODE_VERSION=22.20.0
set INSTALL_DIR=%USERPROFILE%\AppData\Local\
set NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-win-x64.zip

echo Téléchargement de Node.js v%NODE_VERSION%...
powershell -Command "Invoke-WebRequest '%NODE_URL%' -OutFile '%TEMP%\node.zip'"


if not exist "%TEMP%\node.zip" (
    echo Erreur : le téléchargement de Node.js a échoué.
    pause
    exit
)

echo Extraction de Node.js...

powershell -Command "Expand-Archive -Path '%TEMP%\node.zip' -DestinationPath '%INSTALL_DIR%' -Force"

for /d %%i in ("%INSTALL_DIR%\node-v%NODE_VERSION%-win-x64") do set NODE_DIR=%%i


move "%NODE_DIR%\*" "%INSTALL_DIR%" >nul 2>&1 
rd "%NODE_DIR%" >nul 2>&1  

echo.
echo Node.js a été installé localement dans :
echo   %INSTALL_DIR%
echo.

:: Fin programme 
echo.
echo >> Installation terminée !
echo (Fermez et rouvrez votre terminal pour appliquer les changements.)
pause



:: PS - MODIFIER LES VAR D'ENVIRONNEMENT APRES AVOIR FERME LE TERMINAL