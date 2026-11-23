' Core Fitness Platform: what the platform owner's desktop icon runs (2026-11-23).
'
' The platform app stays on this computer (localhost only). This starts the same small server the admin icon uses
' (g-fitness-admin\desktop\serve.mjs), pointed at the platform's own build on port 5175, with no console window,
' and opens it in its own app window. Closing the window stops the server. If `npm run dev` is already serving
' 5175, it just opens the window on it.

Option Explicit
Dim fso, sh, here, script, nodeExe, env

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

here   = fso.GetParentFolderName(WScript.ScriptFullName)
script = fso.GetAbsolutePathName(fso.BuildPath(here, "..\..\g-fitness-admin\desktop\serve.mjs"))

nodeExe = "node"
If fso.FileExists("C:\Program Files\nodejs\node.exe") Then
  nodeExe = "C:\Program Files\nodejs\node.exe"
ElseIf fso.FileExists("C:\Program Files (x86)\nodejs\node.exe") Then
  nodeExe = "C:\Program Files (x86)\nodejs\node.exe"
End If

If Not fso.FileExists(script) Then
  MsgBox "Cannot find the launcher server." & vbCrLf & vbCrLf & "Expected: " & script, vbCritical, "Core Fitness Platform"
  WScript.Quit 1
End If

Set env = sh.Environment("Process")
env("CF_ROOT") = fso.GetAbsolutePathName(fso.BuildPath(here, "..\dist"))
env("CF_PORT") = "5175"
env("CF_NAME") = "Core Fitness Platform"

sh.CurrentDirectory = here
' 0 = hidden, False = do not wait for it to finish.
sh.Run """" & nodeExe & """ """ & script & """", 0, False
