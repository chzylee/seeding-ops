@echo off
rem Double-click to pull results for one or more start.gg events. See README.md.
cd /d "%~dp0"
node seed.js %*
echo.
pause
