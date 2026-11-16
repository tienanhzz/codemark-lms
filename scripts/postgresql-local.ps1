param(
    [ValidateSet('Start', 'Stop', 'Status', 'Connect', 'Check')]
    [string]$Action = 'Status',
    [switch]$Admin
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pgBin = Join-Path $projectRoot '.tools/postgresql-17/pgsql/bin'
$runtimeRoot = Join-Path $projectRoot '.tools/postgresql-local'
$dataDir = Join-Path $runtimeRoot 'data'
$logFile = Join-Path $runtimeRoot 'server.log'
$pgCtl = Join-Path $pgBin 'pg_ctl.exe'
if (-not (Test-Path (Join-Path $dataDir 'PG_VERSION'))) {
    throw 'Local PostgreSQL has not been initialized.'
}

switch ($Action) {
    'Start' {
        & $pgCtl -D $dataDir status *> $null
        if ($LASTEXITCODE -eq 0) { Write-Output 'PostgreSQL is already running.'; return }
        & $pgCtl -D $dataDir -l $logFile -w -t 60 start
        if ($LASTEXITCODE -ne 0) { throw "PostgreSQL startup failed. See $logFile" }
    }
    'Stop' {
        & $pgCtl -D $dataDir -m fast -w -t 60 stop
        if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL shutdown failed.' }
    }
    'Status' {
        & $pgCtl -D $dataDir status
        if ($LASTEXITCODE -ne 0) { throw 'Local PostgreSQL is not running.' }
    }
    default {
        $connection = Get-Content -Raw (Join-Path $runtimeRoot 'connection.json') | ConvertFrom-Json
        $previousPassword = $env:PGPASSWORD
        try {
            $login = $connection.username
            $env:PGPASSWORD = $connection.password
            if ($Admin) {
                $login = $connection.adminUsername
                $env:PGPASSWORD = $connection.adminPassword
            }
            $psqlArgs = @('-X', '-w', '-h', $connection.host, '-p', [string]$connection.port,
                '-U', $login, '-d', $connection.database, '-v', 'ON_ERROR_STOP=1')
            if ($Action -eq 'Check') {
                $sql = 'BEGIN; CREATE TEMP TABLE codemark_connection_check (value integer); INSERT INTO codemark_connection_check VALUES (1); SELECT current_database(), current_user, version(), value FROM codemark_connection_check; SELECT current_setting(''listen_addresses'') AS listen_addresses, current_setting(''port'') AS port, current_setting(''password_encryption'') AS password_encryption; SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user; ROLLBACK;'
                $sql | & (Join-Path $pgBin 'psql.exe') @psqlArgs
            } else {
                & (Join-Path $pgBin 'psql.exe') @psqlArgs
            }
            if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL connection/check failed.' }
        } finally {
            $env:PGPASSWORD = $previousPassword
        }
    }
}
