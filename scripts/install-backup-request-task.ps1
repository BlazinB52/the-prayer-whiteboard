# Sets up (or replaces) the Windows Task Scheduler task that answers the "Back up now" button on /admin/cm: every minute it
# runs scripts/backup-request-poller.mjs, which does nothing unless a backup was requested.
# Run it once from the PrayerWhiteboard folder:  powershell -ExecutionPolicy Bypass -File scripts\install-backup-request-task.ps1
# Remove it with:  Unregister-ScheduledTask -TaskName PrayerWhiteboardBackupRequests -Confirm:$false
$taskName = "PrayerWhiteboardBackupRequests"
$repo = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source
$launcher = Join-Path $PSScriptRoot "backup-request-poller.vbs"

# wscript with //B runs the launcher with no window, so a console does not flash on screen every minute.
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "//B //Nologo `"$launcher`" `"$node`"" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Runs the Prayer Whiteboard backup when the Back up now button on /admin/cm is pressed." -Force | Out-Null
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName, State
