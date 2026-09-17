@echo off
chcp 65001 >nul
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Run this installer from the environment used to start SillyTavern.
  pause
  exit /b 1
)
node "%~dp0install-server.mjs" %*
set "fish_install_result=%errorlevel%"
pause
exit /b %fish_install_result%
