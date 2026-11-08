' Opnar Cloudflare quick tunnel FALIÐ a port 8787 og skrifar i tunnel.log (slodin birtist thar).
' ATH: quick tunnel faer NYJA slod i hvert skipti - uppfaera LJOS_BRIDGE_URL i Vercel eftir endurraesingu.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
sh.Run "cmd /c bin\cloudflared.exe tunnel --url http://localhost:8787 >> tunnel.log 2>&1", 0, False
