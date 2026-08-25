@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"

echo Initializing PostgreSQL schema and seed data...
echo Database: postgresql://postgres:******@localhost:5432/postgres?schema=shanjian
echo.

powershell -NoExit -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%ROOT%'; npm run server:seed"
