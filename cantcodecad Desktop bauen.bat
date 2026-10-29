@echo off
title cantcodecad Desktop bauen
cd /d "%~dp0desktop"
echo Baue cantcodecad als Desktop-Programm. Beim ersten Mal dauert das einige Minuten ...
cargo build --release
if errorlevel 1 (
  echo.
  echo Bauen fehlgeschlagen. Bitte die Meldungen oben an Claude schicken.
  pause
  exit /b 1
)
copy /y "target\release\cantcodecad.exe" "..\cantcodecad.exe" >nul
if errorlevel 1 (
  echo.
  echo cantcodecad.exe konnte nicht ersetzt werden - ist cantcodecad noch offen? Bitte schliessen und erneut starten.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\verknuepfung.ps1"
echo.
echo Fertig: cantcodecad.exe liegt jetzt im cantcodecad-Ordner. Doppelklick startet das Programm.
pause
