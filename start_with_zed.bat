@echo off
rem STRIVE - starts the ZED bridge, then the local web server, then the game.
rem A server is needed because browsers block camera access from file:// pages.
rem Any arguments are passed through to the bridge, e.g.
rem     start_with_zed.bat --bodies 2
rem
rem Only ONE process can hold the camera: close ZED Explorer / ZED Depth Viewer
rem and any zed_test.py / zed_view.py window before running this.
cd /d "%~dp0"

echo Starting ZED bridge...
start "STRIVE ZED bridge" cmd /k python tools\zed_bridge.py %*

rem Wait for the bridge to answer /status before opening the page - tracker.js
rem probes it once at boot, so a page opened too early falls back to the webcam.
rem First run can take minutes while the SDK optimises the body-tracking model.
echo Waiting for the bridge (up to 5 min on the first run)...
set /a tries=0
:wait
curl -s -f -m 2 http://localhost:8322/status >nul 2>&1
if not errorlevel 1 goto ready
set /a tries+=1
if %tries% GEQ 150 goto nozed
timeout /t 2 /nobreak >nul
goto wait

:ready
echo ZED bridge is up - the game will use depth tracking.
goto serve

:nozed
echo.
echo The ZED bridge did not come up. Check its window for the error.
echo Starting anyway - the game will fall back to the webcam.
echo.

:serve
start "" http://localhost:8321
python -m http.server 8321
