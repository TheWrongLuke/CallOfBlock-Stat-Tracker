@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync-export.ps1" %*
