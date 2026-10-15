@echo off
rem Double-click to start the seeding app and open it in your browser. See README.md.
rem Leave this window open while you use the app; close it (or Ctrl+C) to stop.
cd /d "%~dp0"
node app\server.js --open
echo.
pause
