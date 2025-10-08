@echo off
setlocal enabledelayedexpansion

:: Définit la version de Node.js à installer
set NODE_VERSION=22.20.0

:: Définit le répertoire d'installation
set INSTALL_DIR=%USERPROFILE%\nodejs

:: Définit l'URL du paquet Node.js à télécharger
set NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-win-x64.zip

:: Crée le dossier d'installation s'il n'existe pas
if not exist "%INSTALL_DIR%" (
    mkdir "%INSTALL_DIR%"  :: crée le dossier si absent
)

echo Téléchargement de Node.js v%NODE_VERSION%...
:: Télécharge l'archive Node.js depuis l’URL vers le dossier temporaire
powershell -Command "Invoke-WebRequest '%NODE_URL%' -OutFile '%TEMP%\node.zip'"

:: Vérifie si le téléchargement a échoué
if not exist "%TEMP%\node.zip" (
    echo Erreur : le téléchargement de Node.js a échoué.
    pause
    exit /b 1  :: quitte le script en cas d’erreur
)

echo Extraction de Node.js...
:: Décompresse l'archive téléchargée dans le dossier d'installation
powershell -Command "Expand-Archive -Path '%TEMP%\node.zip' -DestinationPath '%INSTALL_DIR%' -Force"

:: Trouve le dossier "node-vX.X.X-win-x64" créé après extraction
for /d %%i in ("%INSTALL_DIR%\node-v%NODE_VERSION%-win-x64") do set NODE_DIR=%%i

:: Déplace tous les fichiers extraits à la racine du dossier d’installation
move "%NODE_DIR%\*" "%INSTALL_DIR%" >nul 2>&1  :: déplace fichiers sans afficher les messages
:: Supprime le sous-dossier devenu vide
rd "%NODE_DIR%" >nul 2>&1  :: supprime le dossier vide

:: Ajoute Node.js et npm au PATH utilisateur
setx PATH "%INSTALL_DIR%;%INSTALL_DIR%\node_modules\.bin;%PATH%"  :: met à jour PATH de Windows

:: Met à jour le PATH courant pour cette session
set PATH=%INSTALL_DIR%;%INSTALL_DIR%\node_modules\.bin;%PATH%

echo.
echo Node.js a été installé localement dans :
echo   %INSTALL_DIR%
echo.

:: Affiche la version de Node.js installée
echo Version de Node :
node -v

:: Affiche la version de npm installée
echo Version de npm :
npm -v

:: Fin programme 
echo.
echo ✅ Installation terminée !
echo (Fermez et rouvrez votre terminal pour appliquer les changements.)
pause
