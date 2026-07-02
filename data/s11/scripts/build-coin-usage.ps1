# manifest + results + fixtures + players → data/s11/coin-usage.json (Node 없이)
$ErrorActionPreference = 'Stop'
$COIN_LOGIC_VERSION = 1

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataRoot = Split-Path -Parent $here
$resultsDir = Join-Path $dataRoot 'results'
$outPath = Join-Path $dataRoot 'coin-usage.json'

function Read-JsonFile([string]$Path) {
  Get-Content -Path $Path -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Half-KeyForRound([int]$RoundNum) {
  if ($RoundNum -ge 1 -and $RoundNum -le 10) { return 'first_half' }
  if ($RoundNum -ge 11 -and $RoundNum -le 20) { return 'second_half' }
  return $null
}

function Slot-LineName($row) {
  if (-not $row) { return '' }
  $n = if ($row.displayName) { $row.displayName } elseif ($row.playerName) { $row.playerName } else { '' }
  return $n.Trim()
}

function Format-FromPlan($metaSlot, $sl) {
  if ($metaSlot -and $metaSlot.format) { return $metaSlot.format }
  $a = @($sl.teamA).Count
  $b = @($sl.teamB).Count
  $n = [Math]::Max($a, $b)
  if ($n -ge 3) { return '3v3' }
  if ($n -ge 2) { return '2v2' }
  return '1v1'
}

function Get-TierMap($players) {
  $m = @{}
  foreach ($p in $players) {
    $n = ($p.displayName -as [string]).Trim()
    if ($n) { $m[$n] = ($p.tier -as [string]).Trim() }
  }
  return $m
}

function Test-CountsSoloCoin($metaSlot, [string]$playerName, $tierMap) {
  if (-not $metaSlot -or $metaSlot.format -ne '1v1') { return $false }
  $tierLine = ($metaSlot.tierLine -as [string]).Trim()
  if (-not $tierLine) { return $true }
  $playerTier = if ($tierMap.ContainsKey($playerName)) { $tierMap[$playerName] } else { '' }
  return [bool]($playerTier -and $playerTier -eq $tierLine)
}

function Get-FixtureRoundMap($fixtures, [int]$roundNum) {
  $m = @{}
  foreach ($rd in $fixtures.rounds) {
    if ($rd.round -ne $roundNum) { continue }
    foreach ($mu in $rd.matchups) {
      if ($mu.id) { $m[$mu.id] = $mu }
    }
  }
  return $m
}

function Get-SlotPlanBySlot($fixtures, [int]$roundNum) {
  $m = @{}
  foreach ($rd in $fixtures.rounds) {
    if ($rd.round -ne $roundNum) { continue }
    foreach ($s in $rd.slotPlan) {
      $m[[string]$s.slot] = $s
    }
  }
  return $m
}

function Get-MatchupFromDoc($doc, [string]$fixtureId) {
  if (-not $doc.matchups) { return $null }
  foreach ($mu in $doc.matchups) {
    if ($mu.fixtureId -eq $fixtureId) { return $mu }
  }
  return $null
}

function Build-RoundDocs($fixtures, $manifest) {
  $matchupsById = @{}
  foreach ($fid in $manifest.matchResults) {
    $filePath = Join-Path $resultsDir "$fid.json"
    if (-not (Test-Path $filePath)) { continue }
    $doc = Read-JsonFile $filePath
    $mu = Get-MatchupFromDoc $doc $fid
    if ($mu) { $matchupsById[$fid] = $mu }
  }

  $docs = @()
  foreach ($rd in $fixtures.rounds) {
    $roundNum = [int]$rd.round
    $ordered = @()
    foreach ($fm in $rd.matchups) {
      if ($matchupsById.ContainsKey($fm.id)) {
        $ordered += $matchupsById[$fm.id]
      }
    }
    if ($ordered.Count -eq 0) { continue }
    $docs += [pscustomobject]@{
      round    = $roundNum
      matchups = $ordered
    }
  }
  return $docs | Sort-Object round
}

function Ensure-PlayerCoin($halfMap, [string]$name) {
  if (-not $halfMap.ContainsKey($name)) {
    $halfMap[$name] = @{ solo = 0; team = 0; log = [System.Collections.Generic.List[object]]::new() }
  }
  return $halfMap[$name]
}

$manifestPath = Join-Path $resultsDir 'manifest.json'
if (-not (Test-Path $manifestPath)) {
  Write-Error 'manifest.json 없음. build-results-manifest.ps1 먼저 실행하세요.'
}

$manifest = Read-JsonFile $manifestPath
$fixtures = Read-JsonFile (Join-Path $dataRoot 'fixtures.json')
$playersData = Read-JsonFile (Join-Path $dataRoot 'players.json')
$tierMap = Get-TierMap @($playersData.players)
$roundDocs = Build-RoundDocs $fixtures $manifest

$byHalf = @{
  first_half  = @{}
  second_half = @{}
}
$maxRoundByHalf = @{ first_half = 0; second_half = 0 }

$docsByRound = @{}
foreach ($doc in $roundDocs) { $docsByRound[$doc.round] = $doc }
$sortedRounds = $docsByRound.Keys | Sort-Object

foreach ($rnum in $sortedRounds) {
  $doc = $docsByRound[$rnum]
  $half = Half-KeyForRound $rnum
  if (-not $half) { continue }

  $hasAppearance = $false
  foreach ($mu in $doc.matchups) {
    foreach ($sl in $mu.slots) {
      foreach ($row in @($sl.teamA) + @($sl.teamB)) {
        if (Slot-LineName $row) { $hasAppearance = $true; break }
      }
      if ($hasAppearance) { break }
    }
    if ($hasAppearance) { break }
  }
  if ($hasAppearance -and $rnum -gt $maxRoundByHalf[$half]) {
    $maxRoundByHalf[$half] = $rnum
  }

  $byId = Get-FixtureRoundMap $fixtures $rnum
  $planBySlot = Get-SlotPlanBySlot $fixtures $rnum
  $seenFid = @{}

  foreach ($mu in $doc.matchups) {
    $fid = $mu.fixtureId
    if (-not $fid -or $seenFid.ContainsKey($fid)) { continue }
    $seenFid[$fid] = $true
    if (-not $byId.ContainsKey($fid)) { continue }

    foreach ($sl in $mu.slots) {
      $slotKey = [string]$sl.slot
      $metaSlot = if ($planBySlot.ContainsKey($slotKey)) { $planBySlot[$slotKey] } else { $null }
      $format = Format-FromPlan $metaSlot $sl
      $isSolo = ($format -eq '1v1')

      $names = [System.Collections.Generic.HashSet[string]]::new()
      foreach ($row in @($sl.teamA) + @($sl.teamB)) {
        $nm = Slot-LineName $row
        if ($nm) { [void]$names.Add($nm) }
      }
      if ($names.Count -eq 0) { continue }

      foreach ($nm in $names) {
        $rec = Ensure-PlayerCoin $byHalf[$half] $nm
        $entry = [ordered]@{
          round     = $rnum
          slot      = $sl.slot
          format    = $format
          fixtureId = $fid
        }
        if ($isSolo) {
          if (Test-CountsSoloCoin $metaSlot $nm $tierMap) {
            $rec.solo++
            $entry.countsSolo = $true
          } else {
            $entry.countsSolo = $false
            $entry.crossTier = $true
          }
        } else {
          $rec.team++
          $entry.countsTeam = $true
        }
        $rec.log.Add($entry)
      }
    }
  }
}

$out = [ordered]@{
  schemaVersion     = 1
  coinLogicVersion  = $COIN_LOGIC_VERSION
  generatedAt       = (Get-Date).ToUniversalTime().ToString('o')
  byHalf            = [ordered]@{}
}

foreach ($half in @('first_half', 'second_half')) {
  $playersOut = [ordered]@{}
  foreach ($kv in $byHalf[$half].GetEnumerator() | Sort-Object Name) {
    $playersOut[$kv.Key] = [ordered]@{
      solo = $kv.Value.solo
      team = $kv.Value.team
      log  = @($kv.Value.log)
    }
  }
  $out.byHalf[$half] = [ordered]@{
    maxRound = $maxRoundByHalf[$half]
    players  = $playersOut
  }
}

$json = $out | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($outPath, "$json`n", [System.Text.UTF8Encoding]::new($false))

$firstCount = @($out.byHalf['first_half'].players.PSObject.Properties).Count
$secondCount = @($out.byHalf['second_half'].players.PSObject.Properties).Count
Write-Host "Wrote $outPath (first_half $firstCount players maxR $($maxRoundByHalf.first_half), second_half $secondCount players maxR $($maxRoundByHalf.second_half))"
