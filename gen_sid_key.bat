@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem Generate a 26-character random SID key without special chars.
set "chars=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
set "key="
for /L %%i in (1,1,26) do (
  set /a "idx=!random! %% 62"
  for %%c in (!idx!) do set "key=!key!!chars:~%%c,1!"
)

echo %key%
endlocal
