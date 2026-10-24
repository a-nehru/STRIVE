@echo off
rem STRIVE tracking lab: pick tracking models and watch them live, side by side.
rem   start_lab.bat              the ZED (stop the ZED bridge first: one process holds the camera)
rem   start_lab.bat cam:0        a webcam
rem   start_lab.bat file:x.mp4   a video file, looped
rem   start_lab.bat rec:tools\recordings\<dir>   a recording, replayed
rem WiLoR / YOLO / ViTPose need tools\setup_hands_env.cmd run once (CUDA venv).
cd /d "%~dp0"
set SRC=%~1
if "%SRC%"=="" set SRC=zed
rem the site server, if it is not already up (the page is served from it)
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://localhost:8321/ -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 start "STRIVE site" /min cmd /c "python -m http.server 8321"
start "" http://localhost:8321/tools/tracking-lab.html
py -3.12 tools\model_lab.py --source %SRC% %2 %3 %4 %5 %6 %7 %8 %9
