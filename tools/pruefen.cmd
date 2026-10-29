@echo off
rem cantcodecad: alle Pruefstaende ohne Browserfenster (Kern, Oberflaeche, Befehlsrundgang). Optional: kern ui rundgang --nur=Text
cd /d "%~dp0.."
node tools\pruefen.mjs %*
echo.
pause
