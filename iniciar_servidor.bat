@echo off
title Croquis Morelia - Servidor
echo ===================================================
echo   Iniciando Croquis Morelia...
echo   URL: http://localhost:8000
echo ===================================================
echo.
py server.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Intentando con py -3.14...
    py -3.14 server.py
)
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Intentando con py -3.11...
    py -3.11 server.py
)
pause
