@echo off
cd /d "%~dp0"
node infra\windows-local.mjs reset-admin
pause
