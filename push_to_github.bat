@echo off
title Push to GitHub - DR Bus Body
echo ==============================================
echo   Pushing code to GitHub: thong0120-Dr/dr-busbody
echo ==============================================
echo.
cd /d "%~dp0"
git push -u origin main
echo.
if %errorlevel% equ 0 (
    echo ==============================================
    echo   SUCCESS! โค้ดทั้งหมดขึ้น GitHub เรียบร้อยแล้ว!
    echo ==============================================
) else (
    echo เกิดข้อผิดพลาด กรุณาตรวจสอบการเข้าสู่ระบบ GitHub
)
echo.
pause
