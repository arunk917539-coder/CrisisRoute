[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('backend', 'citizen', 'admin')]
    [string]$Service,
    [string]$BackendUrl = 'http://127.0.0.1:8000',
    [string]$DatabasePath,
    [int]$BackendPort = 8000
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

if ($Service -eq 'backend') {
    $pythonPath = Join-Path $projectRoot '.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $pythonPath)) {
        throw 'Missing .venv. Run: py -m venv .venv; then .\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt'
    }
    if ($DatabasePath) {
        $dbFile = if ([IO.Path]::IsPathRooted($DatabasePath)) { $DatabasePath } else { Join-Path $projectRoot $DatabasePath }
        $dbFile = [IO.Path]::GetFullPath($dbFile)
        $dbParent = Split-Path -Parent $dbFile
        if (-not (Test-Path -LiteralPath $dbParent)) { New-Item -ItemType Directory -Path $dbParent -Force | Out-Null }
        $env:CRISISROUTE_DATABASE_URL = 'sqlite:///' + $dbFile.Replace('\', '/')
    }
    Write-Host "Backend: http://0.0.0.0:$BackendPort (share this PC's LAN IPv4 address with the other PC)"
    if ($env:CRISISROUTE_DATABASE_URL) { Write-Host "Database: $env:CRISISROUTE_DATABASE_URL" }
    else { Write-Host "Database: $(Join-Path $projectRoot 'backend\crisisroute.db')" }
    Push-Location (Join-Path $projectRoot 'backend')
    try { & $pythonPath -m uvicorn app.main:app --host 0.0.0.0 --port $BackendPort; exit $LASTEXITCODE }
    finally { Pop-Location }
}

$backendUri = $null
if (-not [Uri]::TryCreate($BackendUrl, [UriKind]::Absolute, [ref]$backendUri) -or $backendUri.Scheme -notin @('http', 'https')) {
    throw 'BackendUrl must be an absolute http:// or https:// URL.'
}

# Process environment takes precedence over a stale local .env file.
$env:VITE_API_BASE_URL = '/api'
$env:CRISISROUTE_API_TARGET = $BackendUrl.TrimEnd('/')
$frontendDir = if ($Service -eq 'citizen') { 'frontend' } else { 'admin-frontend' }
$frontendPort = if ($Service -eq 'citizen') { 5173 } else { 5174 }
Write-Host "Open http://localhost:$frontendPort — API proxy: $env:CRISISROUTE_API_TARGET"
Push-Location (Join-Path $projectRoot $frontendDir)
try { & npm.cmd run dev; exit $LASTEXITCODE }
finally { Pop-Location }
