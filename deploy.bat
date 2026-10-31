@echo off
cd /d "%~dp0"
call npx -y wrangler@4 deploy
pause
