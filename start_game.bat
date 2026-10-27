@echo off
rem STRIVE - starts everything (see start_strive.bat) and opens the game.
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  rem no py launcher: just the site, no services or backups
  start "" http://localhost:8321
  python -m http.server 8321
) else (
  py -3.12 tools\launcher.py %*
)
