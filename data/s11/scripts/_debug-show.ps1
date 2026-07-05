function Show-Stats($eloState, [string]$label) {
  $ranked = @($eloState.GetEnumerator() | ForEach-Object {
    [PSCustomObject]@{ name = $_.Key; elo = [int]$_.Value.elo; g = [int]$_.Value.games }
  } | Where-Object { $_.g -gt 0 } | Sort-Object elo -Descending)
  Write-Output "label=$label ranked=$($ranked.Count) input=$($eloState.Count)"
}

$h = @{ Kim = @{ elo = 1045; games = 3 }; Lee = @{ elo = 980; games = 2 } }
Show-Stats $h 'test'
