# Call of Block 2 Stat Tracker

Call of Block 2 is a modded Minecraft 1.20.1 Forge shooter with Battle Royale and Deathmatch. This repository contains the public community hub, stat tracker, player profiles, account customization, weekly missions, playtest scheduling, and Discord-authenticated feedback system.

The site remains a vanilla JavaScript application with hash-based routes. It is built as static files and deployed to the existing GitHub Pages project URL.

## Requirements

- Node.js 22 or newer
- npm
- A Supabase project for Discord authentication and persisted website data

## Local development

```powershell
npm ci
npm run dev
```

Open `http://127.0.0.1:4173/`.

Available commands:

```text
npm run dev           Local source preview
npm run build         Build the production site into dist/
npm run preview       Preview dist/ on port 4174
npm run lint          ESLint
npm run stylelint     CSS validation
npm run format        Format modular source, tests, docs, and configuration
npm run format:check  Verify formatting
npm run test          Vitest unit tests
npm run test:e2e      Playwright desktop/mobile smoke tests
```

The legacy `app.js`, `index.html`, and `styles.css` are being modularized incrementally and are intentionally excluded from bulk Prettier rewriting to avoid unrelated behavior and layout churn.

## Browser configuration

Public browser configuration is stored in `api-config.js`:

- Supabase project URL
- Supabase publishable key
- public statistics table and row identifiers
- current public site URL

A publishable Supabase key is expected in frontend code. Never place a service-role key, Discord bot token, OAuth client secret, webhook secret, or database password in this repository or in browser JavaScript.

`site.config.json` is the canonical build-time source for the public URL and social image. The build updates canonical/Open Graph metadata, the generated sitemap, robots reference, and the built `api-config.js`.

## Feedback architecture

Focused modules live under `src/`:

- `src/api/feedback.js`: Supabase queries
- `src/auth/permissions.js`: testable role checks
- `src/config/feedback.js`: categories, statuses, severities, limits, and labels
- `src/utils/feedback-validation.js`: client validation and URL checks
- `src/views/feedback.js`: escaped user/admin ticket rendering

The public routes are `#feedback` and `#ticket=<uuid>`. Authentication and database policies remain the security boundary even when someone calls Supabase outside the website.

## Build and deployment

`npm run build` copies only public runtime files into `dist/`. Tests, development tooling, and local configuration are not deployed.

GitHub Actions provides:

- `.github/workflows/validate.yml` for pushes and pull requests
- `.github/workflows/deploy-pages.yml` for validated `main` deployments

In GitHub, open **Settings > Pages** and set **Source** to **GitHub Actions** once. No deployment secrets are required for the static site. Supabase authentication redirects must continue allowing the existing GitHub Pages URL.

## Tests

Vitest covers ticket validation, URL safety, date/percentage formatting, mappings, sanitization, and permission helpers. Playwright uses a local logged-out Supabase stub and static stats data; it never writes to production Supabase.

Smoke tests cover the homepage, video placeholder, navigation, leaderboards, player profile routing, playtests, How to Play, FAQ, feedback login requirement, and unauthorized admin-route redirects.

## Future custom domain

No custom domain is configured. When one is purchased later:

1. Change `publicSiteUrl` in `site.config.json`.
2. Build and validate the site.
3. Configure the domain in GitHub Pages settings and DNS.
4. Add the new redirect URL to Supabase Auth and Discord OAuth.

Do not add a `CNAME` file until that migration is intentionally scheduled.
