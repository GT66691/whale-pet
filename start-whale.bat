@echo off
set "ELECTRON_RUN_AS_NODE="
rem %~dp0 = 本脚本所在目录，整个项目可以直接搬到别处
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
