@echo off
cd /d "%~dp0"
echo =====================================
echo        FP SURVIVOR 3D ONLINE
echo =====================================
where node >nul 2>nul
if errorlevel 1 (
 echo No encuentro Node.js. Instala la version LTS desde https://nodejs.org/
 pause
 exit /b 1
)
if not exist node_modules (
 echo Instalando dependencias la primera vez...
 call npm install
 if errorlevel 1 pause & exit /b 1
)
echo.
echo Abre el juego en http://localhost:3000
echo Para jugar desde otras casas, el servidor debe estar publicado en Internet.
echo.
call npm start
pause
