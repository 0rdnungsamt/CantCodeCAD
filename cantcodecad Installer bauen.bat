@echo off
title cantcodecad Installer bauen
cd /d "%~dp0desktop"
echo Baue den cantcodecad-Installer (NSIS). Beim ersten Mal laedt Tauri NSIS herunter ...
cargo tauri build
if errorlevel 1 (
  echo.
  echo Bauen fehlgeschlagen. Bitte die Meldungen oben an Claude schicken.
  pause
  exit /b 1
)
copy /y "target\release\bundle\nsis\cantcodecad_*_x64-setup.exe" ".." >nul
echo.
echo Fertig: der Installer liegt jetzt im cantcodecad-Ordner (cantcodecad_..._x64-setup.exe).
pause
