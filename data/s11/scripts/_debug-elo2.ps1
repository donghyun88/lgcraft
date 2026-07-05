$state = @{}
$name = 'test'
$state[$name] = @{ elo = 1000; games = 0 }
$state[$name].games = $state[$name].games + 1
Write-Output "games=$($state[$name].games)"
$p = $state[$name]
$p.elo = 1016
Write-Output "elo=$($state[$name].elo)"
