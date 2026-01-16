\
@echo off
chcp 65001 >nul
title SibelPlanner Start (Windows 11)
echo.
echo ========================================
echo   SibelPlanner starten (Windows 11)
echo ========================================
echo.
echo 1) Falls Node.js noch NICHT installiert ist:
echo    https://nodejs.org  (LTS installieren)
echo.
echo Druecke eine Taste, um fortzufahren...
pause >nul

echo.
echo [1/2] Abhaengigkeiten installieren (nur beim ersten Mal etwas laenger)...
call npm install
if errorlevel 1 (
  echo.
  echo FEHLER: npm install hat nicht funktioniert.
  echo Bitte pruefen: Node.js installiert? Internet vorhanden?
  pause
  exit /b 1
)

echo.
echo [2/2] App startet jetzt...
call npm start
pause
