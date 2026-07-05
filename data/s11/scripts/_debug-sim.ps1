$ErrorActionPreference = 'Stop'
$dataRoot = Join-Path $PSScriptRoot '..'
$resultsDir = Join-Path $dataRoot 'results'
function Read-Json([string]$Path) { Get-Content -Path $Path -Raw -Encoding UTF8 | ConvertFrom-Json }

function Update-EloPair([double]$e1, [double]$e2, [int]$result, [int]$k) {
  $exp = 1.0 / (1.0 + [Math]::Pow(10, ($e2 - $e1) / 400.0))
  $delta = [int][Math]::Round($k * ($result - $exp))
  return @{ d1 = $delta; d2 = -$delta }
}

$fixtures = Read-Json (Join-Path $dataRoot 'fixtures.json')
$doc = Read-Json (Join-Path $resultsDir 's11-r01-m1.json')
$mu = $doc.matchups[0]
$sl = $mu.slots[0]
$state = @{}
$namesA = @($sl.teamA[0].displayName)
$namesB = @($sl.teamB[0].displayName)
$n1 = $namesA[0]; $n2 = $namesB[0]
$state[$n1] = @{ elo = 1000; games = 1 }
$state[$n2] = @{ elo = 1000; games = 1 }
$team1Won = ([int]$sl.winnerTeamIndex -eq 1)
$r = Update-EloPair 1000 1000 $(if ($team1Won) { 1 } else { 0 }) 32
$state[$n1].elo += $r.d1
$state[$n2].elo += $r.d2
Write-Output "n1=$n1 elo=$($state[$n1].elo) n2=$n2 elo=$($state[$n2].elo)"

$byId = @{}
foreach ($rd in $fixtures.rounds) {
  if ([int]$rd.round -ne 1) { continue }
  foreach ($fm in @($rd.matchups)) { $byId[$fm.id] = $true }
}
Write-Output "has m1: $($byId.ContainsKey('s11-r01-m1'))"
Write-Output "mu fid: $($mu.fixtureId)"
