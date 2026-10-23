' Starts the backup-request poller with no visible window. Argument 0: full path to node.exe. Run from the repo folder.
Set shell = CreateObject("WScript.Shell")
shell.Run """" & WScript.Arguments(0) & """ --env-file=.env.local scripts\backup-request-poller.mjs", 0, True
