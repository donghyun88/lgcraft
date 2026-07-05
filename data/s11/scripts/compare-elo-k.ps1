# K값 비교 시뮬레이션 (실제 S11 결과)
$ErrorActionPreference = 'Stop'
$dataRoot = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..'
$resultsDir = Join-Path $dataRoot 'results'

function Read-Json([string]$Path) {
  Get-Content -Path $Path -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Update-EloPair([double]$e1, [double]$e2, [int]$result, [int]$k) {
  $exp = 1.0 / (1.0 + [Math]::Pow(10, ($e2 - $e1) / 400.0))
  $delta = [int][Math]::Round($k * ($result - $exp))
  return @{ d1 = $delta; d2 = -$delta }
}

function Get-KForFormat([string]$format, $K) {
  if ($format -eq '2v2') { return [int]$K.t22 }
  if ($format -eq '3v3') { return [int]$K.t33 }
  return [int]$K.solo
}

function Get-SlotPlanMap($fixtures, [int]$roundNum) {
  $m = @{}
  foreach ($rd in $fixtures.rounds) {
    if ([int]$rd.round -ne $roundNum) { continue }
    foreach ($s in $rd.slotPlan) { $m[[string]$s.slot] = $s }
  }
  return $m
}

function Get-FixtureMap($fixtures, [int]$roundNum) {
  $m = @{}
  foreach ($rd in $fixtures.rounds) {
    if ([int]$rd.round -ne $roundNum) { continue }
    foreach ($fm in $rd.matchups) { if ($fm.id) { $m[$fm.id] = $fm } }
  }
  return $m
}

function Get-SlotNames($rows) {
  $out = @()
  foreach ($row in @($rows)) {
    $n = if ($row.displayName) { $row.displayName.Trim() } else { '' }
    if ($n) { $out += $n }
  }
  return $out
}

function Ensure-Player($players, [string]$name) {
  if (-not $players.ContainsKey($name)) {
    $players[$name] = @{ elo = 1000; elo1v1 = 1000; games = 0 }
  }
}

function Bump-Game($players, [string]$name) {
  Ensure-Player $players $name
  $players[$name].games = $players[$name].games + 1
}

function Add-Elo($players, [string]$name, [int]$delta) {
  Ensure-Player $players $name
  $players[$name].elo = $players[$name].elo + $delta
}

function Add-Elo1v1($players, [string]$name, [int]$delta) {
  Ensure-Player $players $name
  $players[$name].elo1v1 = $players[$name].elo1v1 + $delta
}

function Simulate-Season($fixtures, $roundDocs, $K) {
  $players = @{}
  foreach ($doc in ($roundDocs | Sort-Object { [int]$_.round })) {
    $rnum = [int]$doc.round
    $byId = Get-FixtureMap $fixtures $rnum
    $plan = Get-SlotPlanMap $fixtures $rnum
    foreach ($mu in @($doc.matchups)) {
      if (-not $byId.ContainsKey($mu.fixtureId)) { continue }
      foreach ($sl in @($mu.slots)) {
        $w = [int]$sl.winnerTeamIndex
        if ($w -ne 1 -and $w -ne 2) { continue }
        $team1Won = ($w -eq 1)
        $slotKey = [string]$sl.slot
        $meta = if ($plan.ContainsKey($slotKey)) { $plan[$slotKey] } else { $null }
        $format = if ($meta -and $meta.format) { $meta.format } else { '1v1' }
        $k = Get-KForFormat $format $K
        $namesA = Get-SlotNames $sl.teamA
        $namesB = Get-SlotNames $sl.teamB
        foreach ($nm in ($namesA + $namesB)) { Bump-Game $players $nm }
        if ($format -eq '1v1' -and $namesA.Count -ge 1 -and $namesB.Count -ge 1) {
          $n1 = $namesA[0]; $n2 = $namesB[0]
          $e1 = $players[$n1].elo; $e2 = $players[$n2].elo
          $e1s = $players[$n1].elo1v1; $e2s = $players[$n2].elo1v1
          $r = Update-EloPair $e1 $e2 $(if ($team1Won) { 1 } else { 0 }) $k
          $rs = Update-EloPair $e1s $e2s $(if ($team1Won) { 1 } else { 0 }) $k
          Add-Elo $players $n1 $r.d1; Add-Elo $players $n2 $r.d2
          Add-Elo1v1 $players $n1 $rs.d1; Add-Elo1v1 $players $n2 $rs.d2
        }
        elseif (($format -eq '2v2' -or $format -eq '3v3') -and $namesA.Count -and $namesB.Count) {
          $avgA = ($namesA | ForEach-Object { $players[$_].elo } | Measure-Object -Average).Average
          $avgB = ($namesB | ForEach-Object { $players[$_].elo } | Measure-Object -Average).Average
          $r = Update-EloPair $avgA $avgB $(if ($team1Won) { 1 } else { 0 }) $k
          foreach ($nm in $namesA) { Add-Elo $players $nm $r.d1 }
          foreach ($nm in $namesB) { Add-Elo $players $nm $r.d2 }
        }
      }
    }
  }
  return $players
}

function Show-Stats($eloState, [string]$label) {
  $ranked = @($eloState.GetEnumerator() | ForEach-Object {
    [PSCustomObject]@{ name = $_.Key; elo = [int]$_.Value.elo; g = [int]$_.Value.games }
  } | Where-Object { $_.g -gt 0 } | Sort-Object elo -Descending)
  if (-not $ranked.Count) {
    Write-Output ""
    Write-Output "=== $label ==="
    Write-Output "  (참가 0명)"
    return @{ ranked = @(); spread = 0; std = 0 }
  }
  $elos = $ranked.elo
  $min = ($elos | Measure-Object -Minimum).Minimum
  $max = ($elos | Measure-Object -Maximum).Maximum
  $spread = $max - $min
  $mean = ($elos | Measure-Object -Average).Average
  $var = ($elos | ForEach-Object { ($_ - $mean) * ($_ - $mean) } | Measure-Object -Sum).Sum / $elos.Count
  $std = [Math]::Sqrt($var)
  Write-Output ""
  Write-Output "=== $label ==="
  Write-Output "  참가: $($ranked.Count)명 | ELO $($min)~$max (폭 $spread) | avg $([Math]::Round($mean,1)) sigma $([Math]::Round($std,1))"
  Write-Output "  Top5:"
  $ranked | Select-Object -First 5 | ForEach-Object {
    $net = $_.elo - 1000
    $sign = if ($net -ge 0) { '+' } else { '' }
    Write-Output ("    {0,-8} {1} ({2}세트, {3}{4})" -f $_.name, $_.elo, $_.g, $sign, $net)
  }
  return @{ ranked = $ranked; spread = $spread; std = $std }
}

Write-Output "=== 단일 세트 delta (이론) ==="
$pairs = @(
  @(1000, 1000, '동점'),
  @(1000, 1100, '100점 열세'),
  @(1000, 1200, '200점 열세'),
  @(1000, 1300, '300점 열세')
)
foreach ($p in $pairs) {
  $w32 = (Update-EloPair $p[0] $p[1] 1 32).d1
  $w100 = (Update-EloPair $p[0] $p[1] 1 100).d1
  $l32 = (Update-EloPair $p[0] $p[1] 0 32).d1
  $l100 = (Update-EloPair $p[0] $p[1] 0 100).d1
  Write-Output ("  {0}: 승 +{1}/+{2}, 패 {3}/{4}" -f $p[2], $w32, $w100, $l32, $l100)
}

$fixtures = Read-Json (Join-Path $dataRoot 'fixtures.json')
$manifest = Read-Json (Join-Path $resultsDir 'manifest.json')
$roundDocs = @()
$byRound = @{}
foreach ($fid in $manifest.matchResults) {
  $doc = Read-Json (Join-Path $resultsDir "$fid.json")
  $mu = $null
  foreach ($m in @($doc.matchups)) { if ($m.fixtureId -eq $fid) { $mu = $m; break } }
  if (-not $mu) { continue }
  foreach ($rd in $fixtures.rounds) {
    foreach ($fm in @($rd.matchups)) {
      if ($fm.id -ne $fid) { continue }
      $rn = [int]$rd.round
      if (-not $byRound.ContainsKey($rn)) { $byRound[$rn] = @() }
      $byRound[$rn] += $mu
    }
  }
}
foreach ($rn in ($byRound.Keys | Sort-Object)) {
  $roundDocs += [PSCustomObject]@{ round = $rn; matchups = $byRound[$rn] }
}

$setCount = 0
foreach ($doc in $roundDocs) {
  foreach ($mu in @($doc.matchups)) {
    foreach ($sl in @($mu.slots)) {
      if ([int]$sl.winnerTeamIndex -in 1, 2) { $setCount++ }
    }
  }
}
Write-Output ""
Write-Output "데이터: $($roundDocs.Count)라운드, $setCount 세트"

$Kcur = @{ solo = 32; t22 = 24; t33 = 16 }
$Ksolo100 = @{ solo = 100; t22 = 24; t33 = 16 }
$Kall100 = @{ solo = 100; t22 = 75; t33 = 50 }
$Kmod = @{ solo = 48; t22 = 36; t33 = 24 }

$s32state = Simulate-Season $fixtures $roundDocs $Kcur
Write-Output "players=$($s32state.Count)"
$r32 = Show-Stats $s32state 'K32 current'
Write-Output "r32ranked=$($r32.ranked.Count) spread=$($r32.spread)"
$s100sstate = Simulate-Season $fixtures $roundDocs $Ksolo100
$s100astate = Simulate-Season $fixtures $roundDocs $Kall100
$sModstate = Simulate-Season $fixtures $roundDocs $Kmod

$r32 = Show-Stats $s32state 'K32 current'
$r100s = Show-Stats $s100sstate 'K100 solo only'
$r100a = Show-Stats $s100astate 'K100 all formats'
$rMod = Show-Stats $sModstate 'K48 moderate'

Write-Output ""
Write-Output "=== spread / sigma 요약 ==="
Write-Output ("  현재 {0} / {1:n1} -> 개인100 {2} / {3:n1} -> 전부100 {4} / {5:n1} -> 1.5배 {6} / {7:n1}" -f `
  $r32.spread, $r32.std, $r100s.spread, $r100s.std, $r100a.spread, $r100a.std, $rMod.spread, $rMod.std)

Write-Output ""
Write-Output "=== K=32 vs K=100(개인) 순위 변동 ==="
$map32 = @{}; $i = 1; foreach ($x in $r32.ranked) { $map32[$x.name] = $i++ }
$map100 = @{}; $i = 1; foreach ($x in $r100s.ranked) { $map100[$x.name] = $i++ }
foreach ($name in $map32.Keys) {
  if (-not $map100.ContainsKey($name)) { continue }
  $d = $map32[$name] - $map100[$name]
  if ($d -eq 0) { continue }
  $e32 = ($r32.ranked | Where-Object name -eq $name).elo
  $e100 = ($r100s.ranked | Where-Object name -eq $name).elo
  Write-Output ("  {0}: {1}->{2} ELO, 순위 {3}{4}" -f $name, $e32, $e100, $(if ($d -gt 0) { '+' } else { '' }), $d)
}
