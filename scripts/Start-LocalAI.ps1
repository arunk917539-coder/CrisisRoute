[CmdletBinding()]
param([switch]$PullModel, [string]$Model = 'embeddinggemma:300m-qat-q4_0')

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$installed = Get-Command ollama -ErrorAction SilentlyContinue
$portable = Join-Path $projectRoot '.demo\tools\ollama\ollama.exe'
if ($installed) { $ollamaPath = $installed.Source }
elseif (Test-Path -LiteralPath $portable) {
    $ollamaPath = $portable
    $env:OLLAMA_MODELS = Join-Path $projectRoot '.demo\ollama-models'
} else { throw 'Install Ollama from https://ollama.com/download/windows, then rerun this command.' }
$env:OLLAMA_HOST = '127.0.0.1:11434'
$env:OLLAMA_NO_CLOUD = 'true'
if ($PullModel) {
    Write-Host "Downloading local embedding model: $Model. Ollama must already be running."
    & $ollamaPath pull $Model
} else {
    Write-Host 'Starting local AI at http://127.0.0.1:11434. If Ollama is already running, use that instance.'
    & $ollamaPath serve
}
exit $LASTEXITCODE
