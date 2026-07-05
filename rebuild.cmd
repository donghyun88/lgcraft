@echo off
REM 결과 JSON 추가/수정 후: manifest + coin-usage 재생성
cd /d "%~dp0"
echo [rebuild] manifest.json + coin-usage.json ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0data\s11\scripts\rebuild-derived-data.ps1"
exit /b %ERRORLEVEL%
