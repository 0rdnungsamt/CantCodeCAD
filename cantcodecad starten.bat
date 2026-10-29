@echo off
title cantcodecad
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\server.ps1"
echo.
pause
