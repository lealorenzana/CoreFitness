' Core Fitness Admin — the thing the desktop icon actually runs.
'
' Its whole job is to start serve.mjs *without a console window*. Node is a
' console program, so a shortcut pointing straight at node.exe puts a black
' terminal on the taskbar beside the dashboard for as long as it is open, which
' rather spoils the effect. WScript.Shell.Run with window style 0 hides it.
'
' Nothing here is load-bearing beyond that — all the behaviour is in serve.mjs.

Option Explicit
Dim fso, sh, here, script, nodeExe

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

here   = fso.GetParentFolderName(WScript.ScriptFullName)
script = fso.BuildPath(here, "serve.mjs")

' Prefer the known install path over PATH: a shortcut launched from Explorer
' does not always inherit the same PATH a terminal has.
nodeExe = "node"
If fso.FileExists("C:\Program Files\nodejs\node.exe") Then
  nodeExe = "C:\Program Files\nodejs\node.exe"
ElseIf fso.FileExists("C:\Program Files (x86)\nodejs\node.exe") Then
  nodeExe = "C:\Program Files (x86)\nodejs\node.exe"
End If

If Not fso.FileExists(script) Then
  MsgBox "Cannot find serve.mjs beside this launcher." & vbCrLf & vbCrLf & _
         "Expected: " & script, vbCritical, "Core Fitness Admin"
  WScript.Quit 1
End If

sh.CurrentDirectory = here
' 0 = hidden, False = do not wait for it to finish.
sh.Run """" & nodeExe & """ """ & script & """", 0, False
