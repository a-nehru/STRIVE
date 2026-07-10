@echo off
rem Star Harbor - starts a local web server and opens the game.
rem A server is needed because browsers block camera access from file:// pages.
cd /d "%~dp0"
start "" http://localhost:8321
python -m http.server 8321
