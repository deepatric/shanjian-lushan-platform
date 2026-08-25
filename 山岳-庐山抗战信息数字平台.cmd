@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"
set "WEB_URL=http://127.0.0.1:5178/"

echo Starting local API...
start "Local API - 4000" powershell -NoExit -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%ROOT%'; npm run server:dev"

timeout /t 2 /nobreak >nul

echo Starting web page...
start "Local Web - 5178" powershell -NoExit -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%ROOT%'; npx vite --host 127.0.0.1 --port 5178 --strictPort"

timeout /t 4 /nobreak >nul

echo Opening browser: %WEB_URL%
start "" "%WEB_URL%"

echo.
echo Started. Close the API and web windows to stop the services.
echo If port 5178 is busy, close the old web window or change 5178 in this file.
pause
