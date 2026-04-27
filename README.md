# Call of Block Stats Site

Static leaderboard site for GitHub Pages.

## What It Uses

- `data/stats.json`
- Exported automatically by the mod to:
  - `config/brcontrol/match_leaderboards_web.json`

The website has no backend. The intended flow is:

1. Server updates `match_leaderboards_web.json`
2. Copy that file into this site as `data/stats.json`
3. Push the site repo to GitHub Pages

## Files

- `index.html`
- `styles.css`
- `app.js`
- `data/stats.json`
- `data/stats.sample.json`
- `sync-export.ps1`
- `sync-export.bat`
- `preview-site.bat`

## Local Preview

Run:

```powershell
.\preview-site.ps1
```

If PowerShell says scripts are disabled on this PC, run:

```bat
preview-site.bat
```

Then open:

- [http://localhost:4173](http://localhost:4173)

If `data/stats.json` is empty, the site falls back to `data/stats.sample.json` and marks itself as `Preview: Yes`.

## Sync Real Server Data

If your local server export path matches the default:

```powershell
.\sync-export.ps1
```

If PowerShell says scripts are disabled on this PC, run:

```bat
sync-export.bat
```

If not:

```powershell
.\sync-export.ps1 -Source "C:\path\to\match_leaderboards_web.json"
```

You can also point `-Source` at the whole `config\brcontrol` folder. The sync script accepts either the new `match_leaderboards_web.json` export or the older `match_leaderboards.json` file and converts it for the site.

## GitHub Pages

1. Create a GitHub repo for this folder
2. Push the contents
3. In GitHub repo settings, enable Pages from the main branch root
4. Each time you want updated stats:
   - copy the latest export into `data/stats.json`
   - commit
   - push

## Current Scope

Implemented:

- BR leaderboard
- DM leaderboard
- Sort by wins, kills, games
- Search by player name
- Pagination
- Player profile side panel
- Empty-state handling

Planned later:

- play time
- weapon stats
- kit stats
- headshot percentage
- placement buckets
- highest kill streak
- match history
