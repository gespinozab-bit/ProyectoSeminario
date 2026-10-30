@echo off
cd /d "%~dp0"
node infra\windows-local.mjs start
if errorlevel 1 pause
