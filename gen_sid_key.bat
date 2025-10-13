@echo off
setlocal enabledelayedexpansion

set "L=26"

rem Générer des octets aléatoires et les encoder en base64
for /f "delims=" %%A in ('powershell -NoProfile -Command "[Convert]::ToBase64String((1..%L% | ForEach-Object {Get-Random -Maximum 256} ))"') do set "key=%%A"

rem Supprimer les caractères + / =
set "key=%key:+=%"
set "key=%key:/=%"
set "key=%key:=%%"

rem Couper à 26 caractères
set "key=%key:~0,%L%"

echo %key%
endlocal
pause