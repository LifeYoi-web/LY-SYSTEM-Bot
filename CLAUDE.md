# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

LY-SYSTEM is a Discord bot **and** its web control dashboard, running in a single Node process, deployed 24/7 on Railway. Stack: discord.js v14 + TypeScript (CommonJS) for the bot, Express + express-session for the API, Prisma v7 + PostgreSQL for storage, and a Vite + React SPA (in `web/`) for the dashboard UI. Code identifiers are English; user-facing strings (Discord embeds, dashboard labels) are Arabic.

## Commands

```bash
npm install            # backend deps (repo root)
npm run build          # prisma generate -> tsc -> install & build the web SPA (web/dist)
npm start              # prisma db push (sync schema) -> node dist/index.js
npm run dev            # ts-node src/index.ts  (see caveat below)
npm test               # vitest run (all suites)
npm run test:watch     # vitest watch
npx vitest run tests/<name>.test.ts   # run a single test file
```

Frontend-only (from `web/`): `npm --prefix web run dev` starts the Vite dev server on :5173 and proxies `/api` to the backend on :3000.

### Build-before-run is mandatory (gotcha)

The bot's loader (`src/bot/loader.ts`) matches `.js` files and `require()`s them relative to `__dirname`, which resolves to the compiled `dist/bot/` tree at runtime. So **commands and events are only discovered after `npm run build`**. `npm run dev` (ts-node over `src/`) does NOT load any command/event (the `.js` filter excludes the `.ts` sources) and would de-register global commands — use `npm run build && npm start` for anything involving the live bot.

## Architecture

Single entry point `src/index.ts` → `main()`: `loadConfig()` (validates env) → load/register/bind bot commands+events → `client.login()` → `ensureGuildSettings()` → `startApiServer()`. The bot and the Express API share ONE discord.js `Client` instance, so API routes command the live bot directly (no IPC).

- **`src/bot/`** — `client.ts` (shared Client + intents: Guilds, GuildMessages, MessageContent, GuildMembers, GuildModeration), `loader.ts` (loadCommands/registerCommands/loadEvents), `commands/{general,moderation,utility}/*.ts`, `events/*.ts` (interactionCreate, ready, messageCreate, messageDelete, guildMemberAdd/Remove). Helpers: `moderation/actions.ts` (ban/kick/mute/warn/lift — record `ModerationCase` + `LogEntry`), `automod/checker.ts` (pure content + spam checks), `stats.ts` (in-memory per-day counter flushed by the scheduler to `DailyStat`), `welcome.ts` (template rendering), `logging.ts` (`logEvent` → `LogEntry` + optional log-channel embed), `scheduler.ts` (lifts expired cases + flushes stats).
- **`src/api/`** — `server.ts` (`createApp`/`startApiServer`: helmet w/ CSP allowing Discord CDN images, session, mounts routes, serves `web/dist` + SPA fallback), `routes/{auth,overview,analytics,members,server,logs,moderation,settings,automod}.ts`, `middleware/{requireStaff,rateLimit}.ts` (mod actions are rate-limited), `auth-utils.ts` (`isStaff`), `session.d.ts`.
- **`src/db/`** — `prisma.ts` (PrismaClient singleton via the pg driver adapter), `settingsCache.ts` (in-memory cache of `GuildSettings` + welcome fields), `automod.ts` (cached `AutoModConfig`, read on every message).
- **`src/shared/`** — `config.ts` (`loadConfig`/`AppConfig`), `logger.ts`, `analytics.ts` (pure date-series helpers, unit-tested).
- **`web/`** — Vite + React SPA (its own package.json). Routing: `/` public landing site (`src/site/Landing.tsx`), `/login`, and the guarded dashboard under `/dashboard/*` (`components/Layout.tsx` shell). `lib/` = `api.ts` + typed `hooks.ts` (TanStack Query) + `types.ts` + `icons.tsx` (SVG icon set, no emoji) + `logmeta.ts`. `components/` = `charts.tsx` (dependency-free SVG area/bar/donut/sparkline), `ui.tsx` (modal/drawer/toasts/switch/skeleton), `pickers.tsx` (channel/role selects), `ActionModal.tsx`. Logo at `web/public/logo.png`. Built to `web/dist`, served same-origin by Express.
- **`prisma/schema.prisma`** + **`prisma.config.ts`** — Prisma v7. The DB URL lives in `prisma.config.ts` (driver-adapter pattern), NOT in `schema.prisma`. Models: `GuildSettings` (incl. welcome/goodbye/autorole/language), `AutoModConfig` (toggles, banned words, ignored channels/roles), `ModerationCase`, `LogEntry`, `DailyStat` (per-guild/per-day analytics, `@@unique([guildId, date])`).

### Auth & authorization

The dashboard authenticates via **Discord OAuth2** (`/api/auth/login` → `/api/auth/callback`) with a CSRF `state` check and session regeneration on login. Access is restricted to **staff of the one configured guild** (`GUILD_ID`): the callback fetches the member through the bot's Client and checks `isStaff` (Administrator / Manage Guild, or a configured staff role). Sessions are stored in PostgreSQL (connect-pg-simple); cookies are httpOnly + sameSite=lax + secure in production. All `/api/*` routes except `/api/auth/*` and `/api/health` go through `requireStaff`.

### Module contracts (CommonJS, not ES exports)

Commands and events use `module.exports = {...}` because the loader `require()`s the compiled output.
- **Command** (`src/bot/commands/<category>/<name>.ts`): `module.exports = { data: SlashCommandBuilder, async execute(interaction) {} }`.
- **Event** (`src/bot/events/<name>.ts`): `module.exports = { name, once, async execute(...args, commands) {} }`. Each handler receives the shared `commands` Collection as its last argument.

Add a command by dropping a file in `src/bot/commands/<category>/`, then `npm run build` — the loader picks it up automatically.

## Conventions

- **Tests:** Vitest. Pure logic and API routes are unit/integration tested with Prisma and the discord.js Client mocked/faked — tests need no real database or Discord connection. Follow TDD for new logic; inject dependencies (`deps = { client, prisma, config, sessionStore? }`) so code stays testable.
- **Logging:** use `logger` from `src/shared/logger.ts`, not `console`.
- **Branding:** embeds and dashboard use LY orange `#f57c00`; keep code English, UI text Arabic.

## Configuration & Deployment

Env vars (see `.env.example`, loaded via `dotenv`): `DISCORD_TOKEN`, `CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`, `GUILD_ID`, `DATABASE_URL`, `DASHBOARD_URL`, `OAUTH_REDIRECT_URI`, `PORT`. `loadConfig()` throws and the process exits if any required var is missing.

Deployed on Railway (`railway.json`, NIXPACKS): build = `npm install && npm run build`, start = `npm start`. Requires a PostgreSQL plugin (provides `DATABASE_URL`) and the OAuth `redirect_uri` registered in the Discord Developer Portal. `GuildMembers` is a privileged intent and must be enabled in the Dev Portal.
