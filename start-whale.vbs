' 无窗口启动：用脚本自身所在目录定位 start-whale.bat
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run """" & dir & "\start-whale.bat""", 0, False
