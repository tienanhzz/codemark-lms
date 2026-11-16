$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$backupRoot=Join-Path $taskRoot '.local/backups'
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$backupFile=Join-Path $backupRoot ("pre-test-upgrade-{0}-{1}.dump" -f (Get-Date -Format 'yyyyMMdd-HHmmss'),([guid]::NewGuid().ToString('N').Substring(0,8)))
if (Test-Path -LiteralPath $backupFile) { throw 'Backup target already exists.' }
New-Item -ItemType File -Path $backupFile | Out-Null
$privateAcl=Get-Acl -LiteralPath (Join-Path $taskRoot '.env')
Set-Acl -LiteralPath $backupFile -AclObject $privateAcl
& (Join-Path $taskRoot 'api/.venv/Scripts/python.exe') (Join-Path $PSScriptRoot 'upgrade-local.py') --target test --backup $backupFile
if ($LASTEXITCODE -ne 0) { throw 'Test database upgrade failed; inspect sanitized migration output.' }
