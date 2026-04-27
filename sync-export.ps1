param(
    [string]$Source = "",
    [string]$ServerRoot = ""
)

$ErrorActionPreference = "Stop"

$destination = Join-Path $PSScriptRoot "data\stats.json"
$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$defaultServerRoot = Join-Path $workspaceRoot "Minecraft Servers\servers\Call of Block"
if ([string]::IsNullOrWhiteSpace($ServerRoot)) {
    $ServerRoot = $defaultServerRoot
}
$defaultConfig = Join-Path $ServerRoot "config\brcontrol"

function Get-ExistingExportPath {
    param([string]$PathOrFile)

    if ([string]::IsNullOrWhiteSpace($PathOrFile)) {
        return $null
    }

    if (Test-Path -LiteralPath $PathOrFile -PathType Container) {
        $web = Join-Path $PathOrFile "match_leaderboards_web.json"
        $raw = Join-Path $PathOrFile "match_leaderboards.json"
        if (Test-Path -LiteralPath $web -PathType Leaf) { return $web }
        if (Test-Path -LiteralPath $raw -PathType Leaf) { return $raw }
        return $null
    }

    if (Test-Path -LiteralPath $PathOrFile -PathType Leaf) {
        return $PathOrFile
    }

    return $null
}

function Find-LatestExportPath {
    $roots = @(
        (Join-Path $PSScriptRoot ".."),
        (Join-Path $env:USERPROFILE "Desktop"),
        $env:USERPROFILE
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique

    foreach ($fileName in @("match_leaderboards_web.json", "match_leaderboards.json")) {
        $matches = @()
        foreach ($root in $roots) {
            $matches += Get-ChildItem -Path $root -Recurse -Filter $fileName -File -ErrorAction SilentlyContinue
        }
        $best = $matches | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($best) { return $best.FullName }
    }

    return $null
}

function Get-Number {
    param($Value)
    if ($null -eq $Value) { return 0 }
    return [int]$Value
}

function Get-PublicPlayerId {
    param([string]$PlayerId)

    if ([string]::IsNullOrWhiteSpace($PlayerId)) { return "" }
    if ($PlayerId -match "^p_[0-9a-f]{12}$") { return $PlayerId }

    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($PlayerId.ToLowerInvariant())
        $hash = $sha.ComputeHash($bytes)
        $hex = -join ($hash | ForEach-Object { $_.ToString("x2") })
        return "p_$($hex.Substring(0, 12))"
    } finally {
        $sha.Dispose()
    }
}

function Hide-PlayerIds {
    param($Value)

    if ($null -eq $Value -or $Value -is [string]) { return }

    if ($Value -is [System.Array]) {
        foreach ($item in $Value) {
            Hide-PlayerIds $item
        }
        return
    }

    if ($Value -is [pscustomobject]) {
        foreach ($property in $Value.PSObject.Properties) {
            if ($property.Name -eq "playerId") {
                $property.Value = Get-PublicPlayerId ([string]$property.Value)
            } else {
                Hide-PlayerIds $property.Value
            }
        }
    }
}

function New-DerivedStats {
    param($Stats)

    $wins = Get-Number $Stats.wins
    $kills = Get-Number $Stats.kills
    $deaths = Get-Number $Stats.deaths
    $games = Get-Number $Stats.matches
    if ($games -eq 0 -and $null -ne $Stats.games) {
        $games = Get-Number $Stats.games
    }

    $winRate = 0
    $avgKills = 0
    $avgDeaths = 0
    $kdRatio = 0

    if ($games -gt 0) {
        $winRate = [math]::Round($wins / $games, 2)
        $avgKills = [math]::Round($kills / $games, 2)
        $avgDeaths = [math]::Round($deaths / $games, 2)
    }

    if ($deaths -gt 0) {
        $kdRatio = [math]::Round($kills / $deaths, 2)
    } elseif ($kills -gt 0) {
        $kdRatio = $kills
    }

    [pscustomobject]@{
        winRate = $winRate
        avgKills = $avgKills
        avgDeaths = $avgDeaths
        kdRatio = $kdRatio
    }
}

function Get-SortValue {
    param($Player, [string]$Sort)
    switch ($Sort) {
        "kills" { return $Player.stats.kills }
        "games" { return $Player.stats.games }
        default { return $Player.stats.wins }
    }
}

function Get-RankedPlayers {
    param([array]$Players, [string]$Sort)

    $ordered = $Players | Sort-Object `
        @{ Expression = { Get-SortValue $_ $Sort }; Descending = $true }, `
        @{ Expression = { $_.stats.wins }; Descending = $true }, `
        @{ Expression = { $_.stats.kills }; Descending = $true }, `
        @{ Expression = { $_.stats.games }; Descending = $true }, `
        @{ Expression = { $_.stats.deaths }; Descending = $false }, `
        @{ Expression = { $_.name.ToLowerInvariant() }; Descending = $false }

    $rank = 1
    foreach ($player in $ordered) {
        [pscustomobject]@{
            rank = $rank
            player = $player
        }
        $rank++
    }
}

function New-ModeExport {
    param([string]$Id, [string]$Label, $RawPlayers)

    $players = @()
    if ($null -ne $RawPlayers) {
        foreach ($entry in $RawPlayers.PSObject.Properties) {
            $stats = $entry.Value
            $publicPlayerId = Get-PublicPlayerId $entry.Name
            $name = [string]$stats.name
            if ([string]::IsNullOrWhiteSpace($name)) {
                $name = $entry.Name
            }

            $games = Get-Number $stats.matches
            if ($games -eq 0 -and $null -ne $stats.games) {
                $games = Get-Number $stats.games
            }

            $players += [pscustomobject]@{
                playerId = $publicPlayerId
                name = $name
                stats = [pscustomobject]@{
                    wins = Get-Number $stats.wins
                    kills = Get-Number $stats.kills
                    deaths = Get-Number $stats.deaths
                    games = $games
                }
                ranks = [pscustomobject]@{
                    wins = 0
                    kills = 0
                    games = 0
                }
                derived = New-DerivedStats $stats
            }
        }
    }

    $leaderboards = [ordered]@{}
    foreach ($sort in @("wins", "kills", "games")) {
        $leaderboard = @()
        foreach ($ranked in (Get-RankedPlayers $players $sort)) {
            $player = $ranked.player
            $player.ranks.$sort = $ranked.rank
            $leaderboard += [pscustomobject]@{
                rank = $ranked.rank
                playerId = $player.playerId
                name = $player.name
                wins = $player.stats.wins
                kills = $player.stats.kills
                deaths = $player.stats.deaths
                games = $player.stats.games
                derived = $player.derived
            }
        }
        $leaderboards[$sort] = $leaderboard
    }

    [pscustomobject]@{
        id = $Id
        label = $Label
        totalPlayers = $players.Count
        leaderboards = $leaderboards
        players = $players
    }
}

function New-Profiles {
    param($BattleRoyale, $Deathmatch)

    $profilesById = @{}
    foreach ($modeName in @("battleRoyale", "deathmatch")) {
        $mode = if ($modeName -eq "battleRoyale") { $BattleRoyale } else { $Deathmatch }
        foreach ($player in @($mode.players)) {
            if (!$profilesById.ContainsKey($player.playerId)) {
                $profilesById[$player.playerId] = [pscustomobject]@{
                    playerId = $player.playerId
                    name = $player.name
                    battleRoyale = $null
                    deathmatch = $null
                }
            }
            $profilesById[$player.playerId].$modeName = $player
            if (![string]::IsNullOrWhiteSpace($player.name)) {
                $profilesById[$player.playerId].name = $player.name
            }
        }
    }

    @($profilesById.Values | Sort-Object { $_.name.ToLowerInvariant() })
}

function Convert-RawLeaderboardExport {
    param($Raw, [string]$SourceFileName)

    $battleRoyale = New-ModeExport "battleRoyale" "Battle Royale" $Raw.br
    $deathmatch = New-ModeExport "deathmatch" "Deathmatch" $Raw.dm

    [pscustomobject]@{
        schemaVersion = 1
        generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        sourceFile = $SourceFileName
        supportedSorts = @("wins", "kills", "games")
        modes = [ordered]@{
            battleRoyale = $battleRoyale
            deathmatch = $deathmatch
        }
        profiles = New-Profiles $battleRoyale $deathmatch
    }
}

$sourcePath = Get-ExistingExportPath $Source
if (!$sourcePath) { $sourcePath = Get-ExistingExportPath $defaultConfig }
if (!$sourcePath) { $sourcePath = Find-LatestExportPath }

if (!$sourcePath) {
    Write-Error "Could not find match_leaderboards_web.json or match_leaderboards.json. Pass -Source with the file path or config\brcontrol folder."
    exit 1
}

$json = Get-Content -Raw -LiteralPath $sourcePath | ConvertFrom-Json
if ($json.modes -and $json.profiles) {
    Hide-PlayerIds $json
    $json | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $destination -Encoding UTF8
    Write-Host "Copied sanitized web leaderboard export:"
    Write-Host "  $sourcePath"
} else {
    $converted = Convert-RawLeaderboardExport $json ([System.IO.Path]::GetFileName($sourcePath))
    $converted | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $destination -Encoding UTF8
    Write-Host "Converted raw mod leaderboard export:"
    Write-Host "  $sourcePath"
}

Write-Host "Updated site data:"
Write-Host "  $destination"
