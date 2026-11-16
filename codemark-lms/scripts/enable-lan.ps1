# Run once from an Administrator PowerShell window on the server machine.
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script in PowerShell as Administrator to add Windows Firewall rules.'
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node -ErrorAction Stop).Source
$javaPath = (Get-Command java -ErrorAction Stop).Source

$rules = @(
    @{ Name = 'CodeMark-LAN-Frontend'; Port = 3000; Program = $nodePath },
    @{ Name = 'CodeMark-LAN-Backend'; Port = 5000; Program = $javaPath }
)
foreach ($rule in $rules) {
    $parameters = @{
        DisplayName = $rule.Name
        Direction = 'Inbound'
        Action = 'Allow'
        Protocol = 'TCP'
        LocalPort = $rule.Port
        Program = $rule.Program
        RemoteAddress = 'LocalSubnet'
        Profile = 'Any'
    }
    $existing = Get-NetFirewallRule -Name $rule.Name -ErrorAction SilentlyContinue
    if ($existing) {
        $existing | Set-NetFirewallRule @parameters
    } else {
        New-NetFirewallRule -Name $rule.Name @parameters | Out-Null
    }
}
Write-Host 'CodeMark: allowed TCP 3000 and 5000 from the local subnet only.'
