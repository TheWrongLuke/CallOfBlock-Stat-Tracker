# [callofblock.com](https://callofblock.com/)

Official website and statistics platform for **Call of Block**, a competitive Minecraft multiplayer shooter.

The website provides player statistics, leaderboards, match history, tactical replays, playtest scheduling, profiles, progression and community tools connected to the Call of Block server.

> **Status:** Actively developed and playtested. Some features may still change or be temporarily unavailable.

## Features

### Player Statistics

- Player profiles
- Overall and mode-specific statistics
- K/D, wins, kills, win rate and other performance data
- Player rankings
- Qualified-player percentile/rank information
- Match history
- Weapon and map statistics

### Leaderboards

- Battle Royale
- Team Deathmatch
- Free For All
- Duels
- Zombie Survival
- Multiple sortable statistics
- Player profile integration

### Tactical Match Replay

- 2D tactical map playback
- Player movement
- Vehicle movement
- Battle Royale zone visualization
- Combat and elimination events
- Shot/engagement lines
- Timeline seeking
- Playback speed controls
- Player marker customization
- Replay Mod file support where available

Zombie Survival replay support is being expanded to include live horde positions and zombie combat events.

### Player Profiles

- Minecraft-linked profiles
- Discord account integration
- Profile customization
- Badges
- Titles
- Cosmetics
- Missions
- XP and progression
- Recent matches and statistics

### Playtests

- Upcoming playtest scheduling
- Player availability voting
- Date and time preferences
- Participation confirmation
- Playtest notifications

### Feedback & Support

- Feedback and bug-report tickets
- Ticket history
- Attachments
- Status tracking
- Administrator ticket management

### Live Server Information

- Server online status
- Current player count
- Current mode
- Current map/match information where available

The live status system is intentionally separated from the heavier statistics exporter so the website does not need to continuously reload full match data.

### Administration

- Admin documentation
- Player management
- Progression management
- Cosmetic and badge management
- Playtest administration
- Feedback/ticket management
- Server and telemetry diagnostics

### Public Pages

- Home
- Stats
- Playtests
- Feedback
- Help
- About

The site uses real crawlable URLs rather than relying entirely on hash-based navigation.

## Call of Block Game Modes

The website currently supports data and information for:

- **Battle Royale**
- **Team Deathmatch**
- **Free For All**
- **Duels**
- **Zombie Survival**
- **Training**

The game itself is still actively being balanced and expanded, so availability and features may change between playtests.

## Working On

### Mobile UI Rework

The mobile version is being redesigned to be significantly more compact.

Current work includes:

- Smaller mobile header
- Smaller page titles and typography
- Reduced hero height
- Denser cards and statistics
- Less unnecessary vertical scrolling
- More compact profile and notification drawers
- Improved Stats layouts
- Improved Playtests layouts
- Improved replay controls
- Better mobile Admin Documentation

### Tactical Replay Improvements

- Zombie Survival horde visualization
- Zombie position tracking
- Zombie hit/shot lines
- Multiple simultaneous hit lines
- Improved marker scaling
- Replay performance improvements

### Match & Telemetry Reliability

- Improving match telemetry publishing
- Better publisher diagnostics
- More reliable replay availability
- Reduced unnecessary server-to-database traffic
- Better offline/retry handling

### Performance

- Continued browser performance profiling
- Device-specific rendering investigation
- API request reduction
- Better caching and request deduplication
- Reduced page initialization work

### Website & Search

- Improving `Call of Block` brand search visibility
- Better structured metadata
- Search Console indexing
- Improved CurseForge/Modrinth to website linking
- Continued SEO improvements

### Administration

- More administration tools
- Improved documentation
- Better diagnostics
- Cleaner player/progression management

## Planned / Future

These are longer-term ideas and are **not currently guaranteed features**.

### 3D Tactical Replay

A future version of the tactical replay system may use a simplified 3D representation of the game map.

The goal would be to support:

- Free 3D camera movement
- Zoom and orbit controls
- Visible terrain/building elevation
- Player and zombie positions represented by lightweight 2D tactical icons
- Vehicles
- Shot trajectories
- Combat events
- Vertical fights across buildings and different floors
- Battle Royale zone visualization in 3D

This would require significant performance and rendering work and is not currently a development priority.

## Known Issues

### Mobile Layout

Some mobile pages currently use typography, headers and spacing that are much larger than necessary, resulting in excessive scrolling.

A full compact mobile UI pass is in progress.

### Replay Telemetry

Some matches may temporarily show that tactical replay telemetry is unavailable while telemetry publishing and server integration are being tested.

### Device-Specific Performance

The website performs smoothly on tested phones and other computers, but one test machine has shown lower UI/frame performance while the game server is running.

This currently appears to be device/browser-specific rather than a confirmed general website or API performance issue and is still being investigated.

### Active Development

Because Call of Block and the website are developed together, new server-side systems may temporarily require corresponding website or telemetry updates.

## Technology

The website currently uses:

- HTML
- CSS
- JavaScript
- Supabase
- GitHub Pages
- Playwright for browser/E2E testing

Match and player data is exported from the Call of Block Minecraft server.

## Development Status

Call of Block and its website are actively developed and tested.

The project is not considered fully finished, and parts of the UI, game modes, statistics, telemetry schema and progression systems may change as testing continues.

## Website

**[https://callofblock.com/](https://callofblock.com/)**

## Modpack

Call of Block uses an official Minecraft modpack distributed separately through CurseForge and Modrinth.

The website itself is not required just to browse information about the project.
