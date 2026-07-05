$dataRoot = Join-Path $PSScriptRoot '..'
$fixtures = Get-Content (Join-Path $dataRoot 'fixtures.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$manifest = Get-Content (Join-Path $dataRoot 'results/manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$fid = $manifest.matchResults[0]
$doc = Get-Content (Join-Path $dataRoot "results/$fid.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$mu = $doc.matchups[0]
Write-Output "fid=$($mu.fixtureId)"
$m = @{}
foreach ($rd in $fixtures.rounds) {
  if ([int]$rd.round -eq 1) {
    foreach ($fm in @($rd.matchups)) { $m[$fm.id] = $fm }
  }
}
Write-Output "map has: $($m.ContainsKey($mu.fixtureId))"
Write-Output "slots: $(@($mu.slots).Count)"
Write-Output "slot0 w: $($mu.slots[0].winnerTeamIndex)"
