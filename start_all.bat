@echo off
rem STRIVE - starts everything in its own window, then opens the game.
rem   1. the ZED bridge   (tools\zed_bridge.py, port 8322)  - skip if no ZED: the game uses the webcam
rem   2. the voice bridge (tools\tts_bridge.py, port 8325)  - Chatterbox coach voices; browser voice without it
rem   3. the web server   (port 8321)                       - browsers block the camera on file:// pages
rem Close a window to stop that part. Each prints its own log.
cd /d "%~dp0"
start "STRIVE ZED bridge"   cmd /k py -3.12 tools\zed_bridge.py
start "STRIVE voice bridge" cmd /k tools\.venv-tts\Scripts\python.exe tools\tts_bridge.py
start "STRIVE web server"   cmd /k py -3.12 -m http.server 8321
timeout /t 3 >nul
start "" http://localhost:8321
