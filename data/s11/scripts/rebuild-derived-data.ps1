# results/manifest.json + coin-usage.json 재생성
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

& (Join-Path $here 'build-results-manifest.ps1')

if (Get-Command node -ErrorAction SilentlyContinue) {
  node (Join-Path $here 'build-coin-usage.mjs')
} else {
  & (Join-Path $here 'build-coin-usage.ps1')
}
Write-Host 'Done: manifest.json + coin-usage.json'

