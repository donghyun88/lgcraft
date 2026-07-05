$dataRoot = Join-Path $PSScriptRoot '..'
$fixtures = Get-Content (Join-Path $dataRoot 'fixtures.json') -Raw -Encoding UTF8 | ConvertFrom-Json
. (Join-Path $PSScriptRoot 'compare-elo-k.ps1')
