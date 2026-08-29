@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "FFMPEG=%SCRIPT_DIR%bin\ffmpeg.exe"
set "FFPROBE=%SCRIPT_DIR%bin\ffprobe.exe"

if exist "%FFMPEG%" set "FFMPEG_PATH=%FFMPEG%"
if exist "%FFPROBE%" set "FFPROBE_PATH=%FFPROBE%"

echo Starting Masterbay...
echo.
echo If the browser doesn't open automatically, go to:
echo   http://127.0.0.1:4173
echo.

cd /d "%SCRIPT_DIR%"

start "" cmd /c "set FFMPEG_PATH=%FFMPEG_PATH%&& set FFPROBE_PATH=%FFPROBE_PATH%&& node server.js"

timeout /t 3 /nobreak >nul

start http://127.0.0.1:4173

endlocal
