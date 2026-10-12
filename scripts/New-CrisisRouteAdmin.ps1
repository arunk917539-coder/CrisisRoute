[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Username,
    [string]$DisplayName = 'Administrator',
    [string]$DatabasePath
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Install the backend dependencies using README.md first.' }
if ($DatabasePath) {
    $dbFile = if ([IO.Path]::IsPathRooted($DatabasePath)) { $DatabasePath } else { Join-Path $projectRoot $DatabasePath }
    $dbFile = [IO.Path]::GetFullPath($dbFile)
    $dbParent = Split-Path -Parent $dbFile
    if (-not (Test-Path -LiteralPath $dbParent)) { New-Item -ItemType Directory -Path $dbParent -Force | Out-Null }
    $env:CRISISROUTE_DATABASE_URL = 'sqlite:///' + $dbFile.Replace('\', '/')
}
Push-Location (Join-Path $projectRoot 'backend')
try { & $pythonPath -m app.bootstrap_admin --username $Username --display-name $DisplayName; exit $LASTEXITCODE }
finally { Pop-Location }
