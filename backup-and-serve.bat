@echo off
echo ========================================
echo Simple Backup and Serve
echo ========================================
echo.

cd frontend

REM Check if dist-old exists
if exist "dist-old" (
    echo dist-old already exists!
    choice /C YN /M "Do you want to overwrite it"
    if errorlevel 2 goto :skip_backup
    rmdir /s /q dist-old
)

echo Copying dist to dist-old...
mkdir dist-old
xcopy /E /I /Y dist dist-old
echo ✓ Backup complete!

:skip_backup
echo.
echo Now you can:
echo.
echo 1. Make your changes to the code
echo 2. Run: npm run build
echo 3. Run: serve-old.bat (in another terminal)
echo 4. Run: serve-new.bat (in another terminal)
echo.
pause
