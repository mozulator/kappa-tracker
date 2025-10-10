@echo off
echo ============================================================
echo EFT OBS KAPPA TRACKER - INSTALLATION
echo ============================================================
echo.
echo This script will install all required dependencies.
echo.
echo Requirements:
echo - Node.js (v14 or higher)
echo.
pause

echo.
echo [1/4] Checking Node.js installation...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo Node.js detected: 
node --version

echo.
echo [2/4] Installing dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install dependencies!
    pause
    exit /b 1
)

echo.
echo [3/4] Generating Prisma client...
call npx prisma generate
if errorlevel 1 (
    echo ERROR: Failed to generate Prisma client!
    pause
    exit /b 1
)

echo.
echo [4/4] Initializing database...
call npx prisma db push
if errorlevel 1 (
    echo ERROR: Failed to initialize database!
    pause
    exit /b 1
)

echo.
echo ============================================================
echo INSTALLATION COMPLETED SUCCESSFULLY!
echo ============================================================
echo.
echo To start the tracker, run: start.bat
echo.
echo Optional: To update quest data from Tarkov.dev, run:
echo           npm run update-quests
echo.
pause

