@echo off
cd /d "%~dp0"
node infra\windows-local.mjs backup
pause
