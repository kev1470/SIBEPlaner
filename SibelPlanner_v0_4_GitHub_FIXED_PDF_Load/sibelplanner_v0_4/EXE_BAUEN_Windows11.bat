\
@echo off
chcp 65001 >nul
title SibelPlanner EXE bauen (Windows 11)
echo.
echo ========================================
echo   SibelPlanner als EXE erstellen
echo ========================================
echo.
echo Voraussetzung:
echo - Node.js LTS ist installiert (https://nodejs.org)
echo - Internet ist an (damit npm Pakete laden kann)
echo.
echo Druecke eine Taste, um fortzufahren...
pause >nul

echo.
echo [1/3] Abhaengigkeiten installieren...
call npm install
if errorlevel 1 (
  echo.
  echo FEHLER: npm install hat nicht funktioniert.
  pause
  exit /b 1
)

echo.
echo [2/3] EXE/Installer erstellen (electron-builder)...
call npm run dist
if errorlevel 1 (
  echo.
  echo FEHLER: Build hat nicht funktioniert.
  echo Tipp: Windows Defender/AV kann manchmal blockieren.
  pause
  exit /b 1
)

echo.
echo [3/3] Fertig!
echo Deine Dateien liegen in:
echo   .\dist\
echo - Installer (.exe) und/oder Portable (.exe)
echo.
pause
