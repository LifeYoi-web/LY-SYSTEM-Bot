# LY-SYSTEM Bot — Web Dashboard Design

Date: 2026-05-24
Status: Approved (Phase 1)

## Context

LY-SYSTEM Bot is a minimal discord.js v14 + TypeScript bot hosted 24/7 on Railway. Today it is stateless (no database) and exposes only `/ping` and `/help`. The owner wants a **browser-based control dashboard** for their single Discord server, with Discord login, to manage moderation, community, tickets, and entertainment features.

Because "all feature groups" is a multi-week scope, we build the **shared foundation once** and add feature groups in phases. This document specifies **Phase 1 = Foundation + Moderation**. Later phases are listed as a roadmap only.

## Goals (Phase 1)

- A web dashboard, served over the same Railway service as the bot, secured by **Discord OAuth2** and restricted to staff of one configured guild.
- Persist bot/dashboard data in **PostgreSQL** (the bot reads its config from the DB).
- Moderation from the browser: **ban / kick / mute (timeout) / warn**, with a per-member case history.
- **AutoMod**: anti-spam, anti-invite/link, banned words, mention-spam limits — configurable from the dashboard.
- **Event logs** (joins/leaves, message deletes/edits, role changes) written to the DB and viewable in the dashboard.
- Auto-expiry for temporary mutes/bans.

## Non-Goals (Phase 1)

- Multi-guild / public SaaS dashboard (explicitly a private, single-guild panel).
- Community/tickets/economy/music features (future phases).
- Real-time websockets (use request/polling in Phase 1; revisit later).

## Architecture

**One Node process** on Railway runs both the bot and the web layer, so the API can command the live bot directly (no IPC / message bus):

```
Single Railway service (one Node process)
├── discord.js bot      — shared Client instance (src/bot/client.ts)
├── Express API         — imports the same Client; calls guild.members.ban() etc.
├── Prisma + PostgreSQL — single source of truth for settings/cases/logs
└── React (Vite) SPA    — built to web/dist, served as static files by Express
                           (same origin → OAuth session cookies "just work")
```

The bot's gateway connection stays a long-lived standalone process (why we do NOT use Next.js server components / serverless for the bot). Express is started from the same `main()` that boots the bot.

### Why these choices
- **Single process + shared Client**: simplest correct design for a single-guild private panel; the dashboard mutates the live bot with no synchronization layer.
- **PostgreSQL (not SQLite/JSON)**: Railway's filesystem is ephemeral across redeploys; SQLite/JSON would lose data. Postgres is a one-click Railway plugin.
- **Vite SPA served by Express (not Next.js)**: single origin and single deploy; avoids a second service and serverless constraints on the gateway connection.

## Tech Stack / Dependencies to Add

- `express`, `express-session`, `connect-pg-simple` (session store), `cookie`/`helmet` (hardening)
- `@prisma/client` + `prisma` (dev) — PostgreSQL ORM and migrations
- Discord OAuth2 via direct `fetch` to Discord token/identity endpoints (no extra passport dependency needed) — keep dependency surface small
- Frontend: `vite`, `react`, `react-dom`, `react-router-dom`, a lightweight data layer (`@tanstack/react-query`), and a styling approach consistent with the LY brand (orange `#f57c00`, dark theme)
- `node-cron` (or a simple `setInterval`) for the expiry scheduler

## Repository Structure (target)

Existing bot code moves under `src/bot/` (loaders updated to new paths); web/db/shared code is added alongside.

```
src/
├── bot/
│   ├── commands/general/{ping,help}.ts   # existing, relocated
│   ├── events/{ready,interactionCreate}.ts
│   ├── events/automod.ts                 # NEW (messageCreate filter)
│   ├── events/logging.ts                 # NEW (member/message/role events)
│   ├── moderation/actions.ts             # NEW (ban/kick/mute/warn helpers, used by API + commands)
│   ├── scheduler.ts                      # NEW (lift expired mutes/bans)
│   └── client.ts                         # NEW (exports shared Client + intents)
├── api/
│   ├── server.ts                         # Express app + static serving of web/dist
│   ├── routes/{auth,overview,members,moderation,logs,settings}.ts
│   └── middleware/{session,requireStaff}.ts
├── db/
│   ├── prisma.ts                         # PrismaClient singleton
│   └── settingsCache.ts                  # in-memory cache of GuildSettings/AutoModConfig
├── shared/
│   ├── config.ts                         # env parsing/validation
│   └── types.ts                          # shared API/DTO types
└── index.ts                              # boots bot + API together
web/                                      # Vite React SPA → web/dist
prisma/schema.prisma
```

> Note: the existing dynamic loader filters `.js` and resolves against `__dirname`/`dist` (build-before-run). Relocating files under `src/bot/**` requires updating the loader paths in the boot sequence accordingly, and keeping the build-then-start workflow (documented in CLAUDE.md).

## Data Model (Prisma / PostgreSQL)

- **GuildSettings** — `guildId` (PK), `logChannelId?`, `staffRoleIds string[]`, timestamps. One row for the configured guild.
- **AutoModConfig** — `guildId` (PK/FK), `antiSpam bool`, `antiInvite bool`, `antiLink bool`, `bannedWords string[]`, `maxMentions int`, `actionOnViolation enum(delete|warn|mute)`, `muteSeconds int`.
- **ModerationCase** — `id`, `guildId`, `targetUserId`, `moderatorId`, `type enum(ban|kick|mute|warn)`, `reason?`, `createdAt`, `expiresAt?`, `active bool`. Indexed by `(guildId, targetUserId)`.
- **LogEntry** — `id`, `guildId`, `type enum(...)`, `data Json`, `createdAt`. Indexed by `(guildId, type, createdAt)`.
- **Session** — managed by `connect-pg-simple` (its own table).

Migrations via `prisma migrate`. The bot reads `GuildSettings`/`AutoModConfig` through `settingsCache` (loaded on ready, invalidated when the API updates settings).

## Authentication & Authorization

- `GET /api/auth/login` → redirect to Discord OAuth2 (`scope=identify guilds`, configured `redirect_uri`).
- `GET /api/auth/callback` → exchange `code` for token, fetch the user; **authorize** only if the user is a member of `GUILD_ID` and has `Administrator` or `Manage Guild`, **or** holds one of `GuildSettings.staffRoleIds`. Otherwise 403.
- On success, create a server-side session (Postgres-backed cookie). `GET /api/auth/me` returns the session user; `POST /api/auth/logout` destroys it.
- All `/api/*` routes except `auth/*` go through `requireStaff` middleware.

## API Design (Phase 1)

- **Auth**: `GET login`, `GET callback`, `POST logout`, `GET me`
- **Overview**: `GET /api/overview` → member count, online count, recent `LogEntry` summary, recent cases
- **Members**: `GET /api/members?search=&cursor=` → paginated guild members (from the live Client cache / fetch)
- **Moderation**:
  - `POST /api/moderation/ban` `{ userId, reason?, deleteMessageSeconds?, expiresAt? }`
  - `POST /api/moderation/kick` `{ userId, reason? }`
  - `POST /api/moderation/mute` `{ userId, reason?, seconds }` (Discord native timeout)
  - `POST /api/moderation/warn` `{ userId, reason }`
  - `GET /api/moderation/cases?userId=` ; `DELETE /api/moderation/cases/:id` (unban/unmute lift)
- **Logs**: `GET /api/logs?type=&cursor=`
- **Settings**: `GET/PUT /api/settings` (log channel, staff roles); `GET/PUT /api/settings/automod`

Every mutating moderation route: (1) performs the Discord action via `src/bot/moderation/actions.ts`, (2) writes a `ModerationCase`, (3) writes a `LogEntry`.

## Bot Integration

- **Shared actions** (`src/bot/moderation/actions.ts`): single implementation of ban/kick/mute/warn used by **both** the API and any future slash commands — avoids divergence.
- **Mute = native timeout** (`GuildMember.timeout(ms)`) rather than a muted role.
- **AutoMod** (`events/automod.ts`, on `messageCreate`): reads cached `AutoModConfig`, ignores staff/bots, applies anti-spam/invite/link/banned-words/mention checks, takes the configured action, and records a case + log entry.
- **Logging** (`events/logging.ts`): handlers for `guildMemberAdd/Remove`, `messageDelete`, `messageUpdate`, `guildMemberUpdate` write `LogEntry` rows.
- **Scheduler** (`scheduler.ts`): periodic job lifts expired active mutes/bans (`expiresAt < now`) and marks cases inactive.
- **Intents/permissions**: add `GuildModeration` intent; bot role needs Ban Members, Kick Members, Moderate Members, Manage Messages, View Audit Log.

## Frontend (React + Vite)

Pages: **Login** (Discord button) · **Overview** · **Members** (with quick ban/kick/mute/warn actions + reason modal) · **Moderation Cases** (filter by user, lift action) · **AutoMod Settings** (form) · **Logs** (filter by type) · **Settings** (log channel + staff roles). Dark theme, LY orange accent, bilingual labels (Arabic UI text). Data via React Query against `/api`.

## Configuration / Env Vars (additions)

- `DATABASE_URL` (Railway Postgres plugin)
- `DISCORD_CLIENT_SECRET` (OAuth)
- `SESSION_SECRET`
- `GUILD_ID` (the managed server)
- `DASHBOARD_URL` / `OAUTH_REDIRECT_URI`
- `PORT` (Railway-provided)

Existing: `DISCORD_TOKEN`, `CLIENT_ID`.

## Deployment (Railway)

- Add the **PostgreSQL** plugin → `DATABASE_URL`.
- Build command: `npm install && npm run build` where `build` now also builds the web SPA (`vite build`), generates the Prisma client, and compiles TS. Start runs migrations (`prisma migrate deploy`) then `node dist/index.js`.
- Expose the web port → public dashboard URL.
- Register the OAuth `redirect_uri` in the Discord Developer Portal.

## Roadmap (later phases — not in this spec)

- **Phase 2 — Community**: welcome/leave, XP/levels + leaderboard, autoroles, reaction roles, announcements.
- **Phase 3 — Tickets**: ticket panels/buttons, transcripts.
- **Phase 4 — Entertainment/Economy**: currency/shop/daily, giveaways, music (heaviest; last).

Each phase = its own spec → plan → implementation cycle, reusing this foundation.

## Testing Strategy

- **Unit**: AutoMod rule evaluation, permission/`requireStaff` logic, case creation/expiry math.
- **Integration**: API routes via `supertest` against a mocked discord.js Client and a test Postgres (or Prisma test schema).
- **Manual E2E**: Discord login → ban a test account from the dashboard → case appears + member banned in Discord → AutoMod triggers on a spam message → expiry lifts a timed mute.

## Risks / Open Items

- Discord OAuth requires the exact `redirect_uri` registered in the Developer Portal (owner action at deploy time).
- Member listing for large guilds needs `GuildMembers` intent + chunked fetch; pagination strategy may need tuning.
- Relocating existing bot files updates the loader paths — verify `build` + `start` still discovers commands/events after the move.
