@echo off
REM Agente de impresion de etiquetas -> Zebra ZD220 (ver README_impresion.md)
setlocal

if "%GATEWAY_API_KEY%"=="" (
  echo.
  echo ERROR: falta GATEWAY_API_KEY.
  echo Guardala una sola vez con:  setx GATEWAY_API_KEY "la-clave-del-backend"
  echo y vuelve a abrir esta ventana.
  echo.
  pause
  exit /b 1
)

REM 127.0.0.1 y no localhost: desde Windows, localhost resuelve a IPv6 y WSL no
REM lo expone. Si el agente corre en OTRA PC, cambia esto por la IP de Tailscale.
if "%BACKEND_URL%"=="" set BACKEND_URL=http://127.0.0.1:8000
if "%IMPRESORA%"=="" set IMPRESORA=ZDesigner ZD220-203dpi ZPL

python "%~dp0agente_impresion.py"
pause
