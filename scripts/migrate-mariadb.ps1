param([Parameter(Mandatory=$true)][string]$Database, [string]$HostName='localhost', [string]$UserName='root')
$ErrorActionPreference='Stop'
if ($Database -notmatch '^[a-zA-Z0-9_]+$') { throw 'Tên database không hợp lệ' }
# Stop backend first. Clients prompt for the password; never put it on the command line.
$backupRoot=Join-Path $PSScriptRoot '../backend/instance/backups'
New-Item -ItemType Directory -Force $backupRoot | Out-Null
$backupFile=Join-Path $backupRoot ("before-identity-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sql')
& mariadb-dump --host=$HostName --user=$UserName --password --single-transaction --result-file=$backupFile $Database
if ($LASTEXITCODE -ne 0) { throw 'Sao lưu thất bại; chưa thay đổi database' }
$sql=@'
ALTER TABLE cf_user ADD COLUMN IF NOT EXISTS student_id VARCHAR(255) NULL;
ALTER TABLE cf_user ADD COLUMN IF NOT EXISTS pending_code BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE cf_user ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE;
UPDATE cf_user SET pending_code=TRUE WHERE student_id IS NULL;
ALTER TABLE cf_user DROP COLUMN IF EXISTS email;
ALTER TABLE IF EXISTS cf_assessment ADD COLUMN IF NOT EXISTS rank_weight DOUBLE DEFAULT 1 NOT NULL;
UPDATE cf_assessment SET rank_weight=1 WHERE rank_weight IS NULL;
'@
$sql | & mariadb --host=$HostName --user=$UserName --password $Database
if ($LASTEXITCODE -ne 0) { throw 'Migration thất bại; khôi phục từ bản sao lưu nếu cần' }
Write-Output "Đã migrate, bản sao lưu: $backupFile"
