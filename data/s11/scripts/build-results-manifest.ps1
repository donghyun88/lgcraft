# data/s11/results/manifest.json 생성 (Node 없이)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$resultsDir = Join-Path (Split-Path -Parent $here) 'results'
$ids = @(Get-ChildItem -Path $resultsDir -Filter 's11-r*-m*.json' | ForEach-Object { $_.BaseName } | Sort-Object)
$manifest = [ordered]@{
  schemaVersion  = 1
  season         = 11
  generatedAt    = (Get-Date).ToUniversalTime().ToString('o')
  matchResults   = $ids
}
$out = Join-Path $resultsDir 'manifest.json'
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $out -Encoding utf8
Write-Host "Wrote $out ($($ids.Count) results)"
