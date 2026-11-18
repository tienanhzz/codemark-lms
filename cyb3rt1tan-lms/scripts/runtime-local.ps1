param(
    [ValidateSet('Start','Stop','Restart','Status')][string]$Action = 'Status',
    [ValidateSet('web','api','all')][string]$Service = 'all'
)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeRoot = Join-Path $taskRoot '.local/runtime'
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
$services = if ($Service -eq 'all') { @('api','web') } else { @($Service) }
foreach ($name in $services) {
    $port = if ($name -eq 'web') { 3100 } else { 8100 }
    $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Where-Object { $null -ne $_ -and $null -ne $_.OwningProcess })
    if ($Action -eq 'Status') {
        $client = New-Object System.Net.Sockets.TcpClient
        $running = $false
        try {
            $connect = $client.BeginConnect('127.0.0.1', $port, $null, $null)
            if ($connect.AsyncWaitHandle.WaitOne(750)) {
                $client.EndConnect($connect)
                $running = $true
            }
        } catch {
            $running = $false
        } finally {
            $client.Close()
        }
        Write-Output "$name port=$port running=$running"
        continue
    }
    foreach ($listener in $listeners) {
        $ownedProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
        $ownedByWorkspace = $ownedProcess.CommandLine -like "*$taskRoot\*"
        if (-not $ownedByWorkspace -and $name -eq 'api' -and $ownedProcess.CommandLine -match '-m uvicorn app\.main:socket_app .*--port 8100') {
            # Windows venv redirectors launch the base Python executable as a child.
            $launcher = Get-CimInstance Win32_Process -Filter "ProcessId=$($ownedProcess.ParentProcessId)"
            $expectedLauncher = Join-Path $taskRoot '.venv\Scripts\python.exe'
            $ownedByWorkspace = $launcher.ExecutablePath -eq $expectedLauncher -and $launcher.CommandLine -match '-m uvicorn app\.main:socket_app .*--port 8100'
        }
        if (-not $ownedByWorkspace) {
            throw "Port $port is owned by another application; refusing to change it."
        }
    }
    if ($Action -in @('Stop','Restart')) {
        foreach ($listener in $listeners) {
            if ($null -eq $listener -or [int]$listener.OwningProcess -le 0) { continue }
            Stop-Process -Id ([int]$listener.OwningProcess)
        }
        Write-Output "Stopped verified $name listener."
    }
    if ($Action -eq 'Stop') { continue }
    if ($Action -eq 'Start' -and $listeners.Count -gt 0) { Write-Output "$name is already running."; continue }
    $env:NEXT_TELEMETRY_DISABLED = '1'
    if ($name -eq 'api') {
        $executable = Join-Path $taskRoot '.venv/Scripts/python.exe'
        $arguments = @('-m','uvicorn','app.main:socket_app','--host','127.0.0.1','--port','8100','--no-access-log')
        $workingDirectory = Join-Path $taskRoot 'api'
    } else {
        $executable = (Get-Command node.exe).Source
        $nextScript = Join-Path $taskRoot 'web/node_modules/next/dist/bin/next'
        $arguments = @(('"{0}"' -f $nextScript),'start','--hostname','127.0.0.1','--port','3100')
        $workingDirectory = Join-Path $taskRoot 'web'
    }
    $started = Start-Process -FilePath $executable -ArgumentList $arguments -WorkingDirectory $workingDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeRoot "$name.out.log") -RedirectStandardError (Join-Path $runtimeRoot "$name.err.log")
    Write-Output "Started $name PID $($started.Id)."
}
