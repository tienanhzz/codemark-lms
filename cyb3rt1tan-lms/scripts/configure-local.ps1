$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$projectRoot = Split-Path -Parent $appRoot
$connection = Get-Content -Raw (Join-Path $projectRoot '.tools/postgresql-local/connection.json') | ConvertFrom-Json
$bin = Join-Path $projectRoot '.tools/postgresql-17/pgsql/bin'
$env:PGPASSWORD = $connection.adminPassword
try {
    foreach ($database in @('codemark_lms', 'codemark_lms_test')) {
        $exists = & (Join-Path $bin 'psql.exe') -X -w -h 127.0.0.1 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$database'"
        if ($LASTEXITCODE -ne 0) { throw 'Cannot connect to local PostgreSQL.' }
        if ($exists -ne '1') {
            & (Join-Path $bin 'createdb.exe') -w -h 127.0.0.1 -U postgres -O codemark $database
            if ($LASTEXITCODE -ne 0) { throw 'Database creation failed.' }
        }
    }
} finally { Remove-Item Env:\PGPASSWORD }
$envFile = Join-Path $appRoot '.env'
if (-not (Test-Path $envFile)) {
    $bytes = New-Object byte[] 48
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $key = [Convert]::ToBase64String($bytes)
    @"
DATABASE_URL=postgresql+psycopg://codemark:$($connection.password)@127.0.0.1:5432/codemark_lms
TEST_DATABASE_URL=postgresql+psycopg://codemark:$($connection.password)@127.0.0.1:5432/codemark_lms_test
LOGIN_HMAC_KEY=$key
APP_ORIGIN=http://127.0.0.1:3100
COOKIE_SECURE=false
NEXT_TELEMETRY_DISABLED=1
"@ | Set-Content -Encoding ASCII -LiteralPath $envFile
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $envFile /inheritance:r /grant:r "${identity}:F" '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not restrict local environment permissions.' }
}
if (-not (Select-String -LiteralPath $envFile -Pattern '^MFA_ENCRYPTION_KEY=' -Quiet)) {
    $taskMfaBytes = New-Object byte[] 32
    $taskMfaRng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $taskMfaRng.GetBytes($taskMfaBytes) } finally { $taskMfaRng.Dispose() }
    Add-Content -Encoding ASCII -LiteralPath $envFile -Value ("MFA_ENCRYPTION_KEY=" + [Convert]::ToBase64String($taskMfaBytes))
}
Push-Location (Join-Path $appRoot 'api')
try {
    & (Join-Path $appRoot '.venv/Scripts/python.exe') -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw 'Migration failed.' }
} finally { Pop-Location }
Write-Output 'Local application database configured and migrated. No user account was seeded.'
