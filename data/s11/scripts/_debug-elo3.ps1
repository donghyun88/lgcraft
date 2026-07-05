$state = @{ 'Kim' = @{ elo = 1045; games = 5 } }
$state.GetEnumerator() | ForEach-Object {
  Write-Output "dot elo=$($_.Value.elo) bracket=$($_.Value['elo'])"
}
