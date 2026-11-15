' Keyrir Bíó-samstillinguna FALIÐ (enginn gluggi) og skrifar í sync.log í sömu möppu.
' Ætlað fyrir Task Scheduler (t.d. á 3 klst. fresti) eða tvísmell.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
sh.Run "cmd /c node sync.mjs >> sync.log 2>&1", 0, False
