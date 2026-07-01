$root = Split-Path -Parent $PSScriptRoot
$fixtures = Get-Content (Join-Path $root 'fixtures.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$playersDoc = Get-Content (Join-Path $root 'players.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$tierBy = @{}
foreach ($p in $playersDoc.players) {
  $n = ($p.displayName + '').Trim()
  if ($n) { $tierBy[$n] = ($p.tier + '').Trim() }
}

function Get-Plan($roundNum) {
  $rd = $fixtures.rounds | Where-Object { $_.round -eq $roundNum } | Select-Object -First 1
  $m = @{}
  foreach ($s in ($rd.slotPlan | ForEach-Object { $_ })) { $m[[int]$s.slot] = $s }
  return $m
}

$mismatches = @()
$files = Get-ChildItem (Join-Path $root 'results\s11-r*-m*.json') | Sort-Object Name
foreach ($file in $files) {
  $doc = Get-Content $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
  $rnum = [int]$doc.round
  $pmap = Get-Plan $rnum
  foreach ($mu in $doc.matchups) {
    foreach ($sl in $mu.slots) {
      $slot = [int]$sl.slot
      if (-not $pmap.ContainsKey($slot)) { continue }
      $sp = $pmap[$slot]
      if ($sp.format -ne '1v1' -or -not $sp.tierLine) { continue }
      $st = ($sp.tierLine + '').Trim()
      foreach ($side in @('teamA', 'teamB')) {
        foreach ($row in ($sl.$side | ForEach-Object { $_ })) {
          $name = $row.displayName
          if (-not $name) { $name = $row.playerName }
          if ($name) { $name = $name.ToString().Trim() } else { $name = '' }
          if (-not $name) { continue }
          $pt = if ($tierBy.ContainsKey($name)) { $tierBy[$name] } else { '' }
          if ($pt -ne $st) {
            $mismatches += [pscustomobject]@{
              Round = $rnum
              Slot = $slot
              SlotTier = $st
              Map = $sp.map
              Player = $name
              PlayerTier = if ($pt) { $pt } else { '(미등록)' }
              FixtureId = $mu.fixtureId
              File = $file.Name
            }
          }
        }
      }
    }
  }
}

$mismatches | ForEach-Object {
  Write-Output ("{0}R #{1} {2}({3}) | {4} 선수티어={5} | {6}" -f $_.Round, $_.Slot, $_.SlotTier, $_.Map, $_.Player, $_.PlayerTier, $_.FixtureId)
}
Write-Output ("--- 총 {0}건 ---" -f $mismatches.Count)
