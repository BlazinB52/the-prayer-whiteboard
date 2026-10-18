# Sets up (or replaces) the Windows Task Scheduler task that runs scripts/scheduled-backup.mjs every day.
# Run it once from the PrayerWhiteboard folder:  powershell -ExecutionPolicy Bypass -File scripts\install-backup-task.ps1
# Pass -At "6:00PM" to change the time of day. Remove the task with:  Unregister-ScheduledTask -TaskName PrayerWhiteboardBackup -Confirm:$false
param([string]$At = "12:30PM")

$taskName = "PrayerWhiteboardBackup"
$repo = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source

$action = New-ScheduledTaskAction -Execute $node -Argument "scripts\scheduled-backup.mjs" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -At $At
# StartWhenAvailable: if the computer was off at that time, the backup runs as soon as it is back on.
# It runs only while you are signed in, because the Supabase login it uses belongs to your Windows account.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Backs up the Prayer Whiteboard Supabase project to this computer, and to the flash drive when it is plugged in." -Force | Out-Null
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName, State
