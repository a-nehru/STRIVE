@echo off
rem STRIVE: one click starts the site, the services this machine can run
rem (ZED bridge, voice, coach, mail), the nightly-style backups, and the browser.
rem Logs: tools\logs\   Backups: tools\backups\   Ctrl+C stops everything.
cd /d "%~dp0"
py -3.12 tools\launcher.py %*
