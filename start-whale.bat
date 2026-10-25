@echo off
set "ELECTRON_RUN_AS_NODE="
rem %~dp0 = 本脚本所在目录，整个项目可以直接搬到别处
rem 注意：%~dp0 带结尾反斜杠，直接放进引号会被当成转义，所以先去掉
set "APP_DIR=%~dp0"
set "APP_DIR=%APP_DIR:~0,-1%"
start "" "%~dp0node_modules\electron\dist\electron.exe" "%APP_DIR%"
