' Ræsir ljos-bridge FALIÐ (enginn gluggi) og skrifar í bridge.log í sömu möppu.
' Tvísmella eða setja í Startup-möppuna (shell:startup). Stöðva: Task Manager → node.exe.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
sh.Run "cmd /c node --env-file=.env bridge.mjs >> bridge.log 2>&1", 0, False
