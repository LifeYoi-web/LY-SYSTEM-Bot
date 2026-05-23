# Dashboard Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Discord-OAuth-secured web dashboard to the existing bot — running in the same Node process — that shows a live server overview, backed by PostgreSQL.

**Architecture:** One Node process boots the discord.js bot and an Express API sharing the same `Client`. PostgreSQL (via Prisma) is the source of truth for settings. A Vite/React SPA is built to `web/dist` and served as static files by Express (same origin → session cookies work). This plan delivers the foundation only; moderation features are a follow-up plan that reuses this scaffolding.

**Tech Stack:** discord.js v14, TypeScript, Express, express-session + connect-pg-simple, Prisma + PostgreSQL, Vite + React + react-router + @tanstack/react-query, Vitest + supertest.

---

## Conventions for this plan

- **Build-before-run:** the dynamic loader matches `.js` and resolves against `dist/`. Always `npm run build` before `npm start`. `npm run dev` (ts-node) does NOT load commands/events — do not rely on it.
- **Test runner:** Vitest. Run a single test file with `npx vitest run tests/<file>.test.ts`.
- **Commits:** commit after each task (the steps tell you when). Keep commits small.
- **TDD applies to pure logic and API routes** (config, auth helpers, middleware, routers). UI and the OAuth redirect round-trip use explicit manual verification steps instead.

## File Structure (created/modified across the plan)

```
src/
├── bot/
│   ├── client.ts          CREATE  — shared Client + intents
│   ├── loader.ts          CREATE  — loadCommands/registerCommands/loadEvents (moved out of index.ts)
│   ├── commands/general/   MOVE    — ping.ts, help.ts (from src/commands/)
│   └── events/             MOVE    — ready.ts, interactionCreate.ts (from src/events/)
├── shared/
│   ├── logger.ts          MOVE    — from src/utils/logger.ts
│   └── config.ts          CREATE  — env parsing + validation
├── db/
│   ├── prisma.ts          CREATE  — PrismaClient singleton
│   └── settingsCache.ts   CREATE  — GuildSettings load/cache/ensure
├── api/
│   ├── server.ts          CREATE  — Express app factory + static SPA serving
│   ├── auth-utils.ts      CREATE  — isStaff() pure helper
│   ├── session.d.ts       CREATE  — express-session type augmentation
│   ├── middleware/requireStaff.ts  CREATE
│   └── routes/{auth,overview}.ts   CREATE
└── index.ts               MODIFY  — boot bot + API together
prisma/schema.prisma       CREATE
web/                       CREATE  — Vite React SPA (nested package)
tests/                     CREATE  — Vitest specs
vitest.config.ts           CREATE
package.json               MODIFY  — deps + scripts
railway.json               MODIFY  — start runs migrations
.env.example               CREATE
```

---

### Task 1: Test harness (Vitest)

**Files:**
- Create: `vitest.config.ts`, `tests/smoke.test.ts`
- Modify: `package.json` (devDeps + `test` script)

- [ ] **Step 1: Install Vitest + supertest**

```bash
npm install -D vitest supertest @types/supertest
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Add the `test` script to `package.json`**

In `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a smoke test**

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('test harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

Run: `npx vitest run tests/smoke.test.ts`
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/smoke.test.ts
git commit -m "chore: add vitest test harness"
```

---

### Task 2: Relocate bot code into `src/bot/` + extract loader

This refactors the existing working bot. The loader keeps its `.js` filter + `__dirname` behavior, so it now resolves against `dist/bot/`.

**Files:**
- Move: `src/utils/logger.ts` → `src/shared/logger.ts`
- Move: `src/commands/general/*.ts` → `src/bot/commands/general/*.ts`
- Move: `src/events/*.ts` → `src/bot/events/*.ts`
- Create: `src/bot/client.ts`, `src/bot/loader.ts`
- Modify: moved events' logger import paths; `src/index.ts`

- [ ] **Step 1: Move files**

```bash
mkdir src\shared src\bot
git mv src/utils/logger.ts src/shared/logger.ts
git mv src/commands src/bot/commands
git mv src/events src/bot/events
```
(`src/utils` is now empty — leave it or remove with `rmdir src\utils`.)

- [ ] **Step 2: Fix logger imports in moved events**

In `src/bot/events/ready.ts` and `src/bot/events/interactionCreate.ts`, change:
```ts
import { logger } from '../utils/logger';
```
to:
```ts
import { logger } from '../../shared/logger';
```

- [ ] **Step 3: Create `src/bot/client.ts`**

```ts
import { Client, GatewayIntentBits } from 'discord.js';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
  ],
});
```

- [ ] **Step 4: Create `src/bot/loader.ts`** (extracted from the old `index.ts`)

```ts
import { Client, Collection, REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import { logger } from '../shared/logger';

export interface Command {
  data: { name: string; toJSON: () => object };
  execute: (interaction: any) => Promise<void>;
}

export function loadCommands(): Collection<string, Command> {
  const commands = new Collection<string, Command>();
  const commandsPath = join(__dirname, 'commands');
  for (const folder of readdirSync(commandsPath)) {
    const folderPath = join(commandsPath, folder);
    for (const file of readdirSync(folderPath).filter((f) => f.endsWith('.js'))) {
      const command: Command = require(join(folderPath, file));
      commands.set(command.data.name, command);
      logger.success(`Command loaded: ${command.data.name}`);
    }
  }
  return commands;
}

export async function registerCommands(
  commands: Collection<string, Command>,
  token: string,
  clientId: string,
): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token);
  const body = Array.from(commands.values()).map((c) => c.data.toJSON());
  logger.info('Registering commands with Discord...');
  await rest.put(Routes.applicationCommands(clientId), { body });
  logger.success('All commands registered successfully!');
}

export function loadEvents(client: Client, commands: Collection<string, Command>): void {
  const eventsPath = join(__dirname, 'events');
  for (const file of readdirSync(eventsPath).filter((f) => f.endsWith('.js'))) {
    const event = require(join(eventsPath, file));
    const handler = (...args: any[]) => event.execute(...args, commands);
    if (event.once) client.once(event.name, handler);
    else client.on(event.name, handler);
    logger.success(`Event loaded: ${event.name}`);
  }
}
```

- [ ] **Step 5: Replace `src/index.ts` with a slim bootstrap (bot only for now)**

```ts
import 'dotenv/config';
import { logger } from './shared/logger';
import { client } from './bot/client';
import { loadCommands, registerCommands, loadEvents } from './bot/loader';

async function main() {
  const token = process.env.DISCORD_TOKEN!;
  const clientId = process.env.CLIENT_ID!;

  const commands = loadCommands();
  await registerCommands(commands, token, clientId);
  loadEvents(client, commands);

  await client.login(token);
}

main().catch((err) => {
  logger.error(`Fatal: ${err}`);
  process.exit(1);
});
```

- [ ] **Step 6: Build and verify the bot still loads everything**

Run: `npm run build && npm start`
Expected logs: `Command loaded: ping`, `Command loaded: help`, `Event loaded: ready`, `Event loaded: interactionCreate`, `Bot is online as: ...`. Stop with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: relocate bot code into src/bot and extract loader"
```

---

### Task 3: Config module with env validation

**Files:**
- Create: `src/shared/config.ts`, `tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/config.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/shared/config';

const base = {
  DISCORD_TOKEN: 't', CLIENT_ID: 'c', DISCORD_CLIENT_SECRET: 's',
  SESSION_SECRET: 'x', GUILD_ID: 'g', DATABASE_URL: 'd',
  DASHBOARD_URL: 'http://localhost:5173', OAUTH_REDIRECT_URI: 'http://localhost:3000/api/auth/callback',
};

describe('loadConfig', () => {
  it('parses a complete env and defaults the port to 3000', () => {
    const cfg = loadConfig(base as any);
    expect(cfg.guildId).toBe('g');
    expect(cfg.port).toBe(3000);
  });

  it('reads PORT when provided', () => {
    expect(loadConfig({ ...base, PORT: '8080' } as any).port).toBe(8080);
  });

  it('throws naming the missing variable', () => {
    const { GUILD_ID, ...partial } = base as any;
    expect(() => loadConfig(partial)).toThrow(/GUILD_ID/);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL (cannot find module `../src/shared/config`).

- [ ] **Step 3: Implement `src/shared/config.ts`**

```ts
export interface AppConfig {
  discordToken: string;
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  guildId: string;
  databaseUrl: string;
  dashboardUrl: string;
  oauthRedirectUri: string;
  port: number;
  isProd: boolean;
}

const REQUIRED = [
  'DISCORD_TOKEN', 'CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'SESSION_SECRET',
  'GUILD_ID', 'DATABASE_URL', 'DASHBOARD_URL', 'OAUTH_REDIRECT_URI',
] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
  return {
    discordToken: env.DISCORD_TOKEN!,
    clientId: env.CLIENT_ID!,
    clientSecret: env.DISCORD_CLIENT_SECRET!,
    sessionSecret: env.SESSION_SECRET!,
    guildId: env.GUILD_ID!,
    databaseUrl: env.DATABASE_URL!,
    dashboardUrl: env.DASHBOARD_URL!,
    oauthRedirectUri: env.OAUTH_REDIRECT_URI!,
    port: Number(env.PORT ?? 3000),
    isProd: env.NODE_ENV === 'production',
  };
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run tests/config.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/shared/config.ts tests/config.test.ts
git commit -m "feat: add validated app config loader"
```

---

### Task 4: Prisma + PostgreSQL schema

**Files:**
- Create: `prisma/schema.prisma`, `src/db/prisma.ts`
- Modify: `package.json` (deps)

- [ ] **Step 1: Install Prisma**

```bash
npm install @prisma/client
npm install -D prisma
```

- [ ] **Step 2: Create `prisma/schema.prisma`** (all Phase-1 models, so moderation reuses them)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model GuildSettings {
  guildId      String         @id
  logChannelId String?
  staffRoleIds String[]       @default([])
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  autoMod      AutoModConfig?
}

model AutoModConfig {
  guildId           String        @id
  antiSpam          Boolean       @default(false)
  antiInvite        Boolean       @default(false)
  antiLink          Boolean       @default(false)
  bannedWords       String[]      @default([])
  maxMentions       Int           @default(5)
  actionOnViolation String        @default("delete") // delete | warn | mute
  muteSeconds       Int           @default(300)
  settings          GuildSettings @relation(fields: [guildId], references: [guildId], onDelete: Cascade)
}

model ModerationCase {
  id           String    @id @default(cuid())
  guildId      String
  targetUserId String
  moderatorId  String
  type         String // ban | kick | mute | warn
  reason       String?
  createdAt    DateTime  @default(now())
  expiresAt    DateTime?
  active       Boolean   @default(true)

  @@index([guildId, targetUserId])
  @@index([guildId, active, expiresAt])
}

model LogEntry {
  id        String   @id @default(cuid())
  guildId   String
  type      String
  data      Json
  createdAt DateTime @default(now())

  @@index([guildId, type, createdAt])
}
```

- [ ] **Step 3: Provide a local `DATABASE_URL`**

Add to `.env` (local Postgres or a Railway dev DB), e.g.:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lysystem
```

- [ ] **Step 4: Create the migration**

Run: `npx prisma migrate dev --name init`
Expected: migration created under `prisma/migrations/`, client generated, "Your database is now in sync".

- [ ] **Step 5: Create `src/db/prisma.ts`**

```ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

- [ ] **Step 6: Commit**

```bash
git add prisma package.json package-lock.json src/db/prisma.ts
git commit -m "feat: add prisma schema and postgres models"
```

---

### Task 5: Settings cache (ensure/get/invalidate)

**Files:**
- Create: `src/db/settingsCache.ts`, `tests/settingsCache.test.ts`

- [ ] **Step 1: Write the failing test** (Prisma is mocked)

`tests/settingsCache.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsert = vi.fn();
vi.mock('../src/db/prisma', () => ({
  prisma: { guildSettings: { upsert } },
}));

import { ensureGuildSettings, getSettings, invalidateSettings } from '../src/db/settingsCache';

const row = { guildId: 'g1', logChannelId: null, staffRoleIds: [], createdAt: new Date(), updatedAt: new Date() };

beforeEach(() => {
  upsert.mockReset().mockResolvedValue(row);
  invalidateSettings('g1');
});

describe('settingsCache', () => {
  it('ensures (upserts) and caches a row', async () => {
    const result = await ensureGuildSettings('g1');
    expect(result.guildId).toBe('g1');
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('getSettings serves from cache without a second db call', async () => {
    await ensureGuildSettings('g1');
    await getSettings('g1');
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('invalidate forces a reload', async () => {
    await ensureGuildSettings('g1');
    invalidateSettings('g1');
    await getSettings('g1');
    expect(upsert).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/settingsCache.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/db/settingsCache.ts`**

```ts
import { prisma } from './prisma';
import type { GuildSettings } from '@prisma/client';

const cache = new Map<string, GuildSettings>();

export async function ensureGuildSettings(guildId: string): Promise<GuildSettings> {
  const settings = await prisma.guildSettings.upsert({
    where: { guildId },
    update: {},
    create: { guildId },
  });
  cache.set(guildId, settings);
  return settings;
}

export async function getSettings(guildId: string): Promise<GuildSettings> {
  const cached = cache.get(guildId);
  if (cached) return cached;
  return ensureGuildSettings(guildId);
}

export function invalidateSettings(guildId: string): void {
  cache.delete(guildId);
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run tests/settingsCache.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/db/settingsCache.ts tests/settingsCache.test.ts
git commit -m "feat: add guild settings cache"
```

---

### Task 6: `isStaff` authorization helper

**Files:**
- Create: `src/api/auth-utils.ts`, `tests/auth-utils.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/auth-utils.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { isStaff } from '../src/api/auth-utils';

function member(opts: { admin?: boolean; manage?: boolean; roleIds?: string[] }) {
  return {
    permissions: {
      has: (flag: bigint) =>
        (flag === PermissionFlagsBits.Administrator && !!opts.admin) ||
        (flag === PermissionFlagsBits.ManageGuild && !!opts.manage),
    },
    roles: { cache: { some: (fn: (r: any) => boolean) => (opts.roleIds ?? []).map((id) => ({ id })).some(fn) } },
  } as any;
}

describe('isStaff', () => {
  it('allows administrators', () => {
    expect(isStaff(member({ admin: true }), [])).toBe(true);
  });
  it('allows Manage Guild', () => {
    expect(isStaff(member({ manage: true }), [])).toBe(true);
  });
  it('allows a configured staff role', () => {
    expect(isStaff(member({ roleIds: ['r1'] }), ['r1'])).toBe(true);
  });
  it('rejects a plain member', () => {
    expect(isStaff(member({ roleIds: ['r9'] }), ['r1'])).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/auth-utils.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/api/auth-utils.ts`**

```ts
import { PermissionFlagsBits } from 'discord.js';

export interface StaffCheckMember {
  permissions: { has: (flag: bigint) => boolean };
  roles: { cache: { some: (fn: (r: { id: string }) => boolean) => boolean } };
}

export function isStaff(member: StaffCheckMember, staffRoleIds: string[]): boolean {
  if (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  ) {
    return true;
  }
  return member.roles.cache.some((r) => staffRoleIds.includes(r.id));
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run tests/auth-utils.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/api/auth-utils.ts tests/auth-utils.test.ts
git commit -m "feat: add isStaff authorization helper"
```

---

### Task 7: Session typing + `requireStaff` middleware

**Files:**
- Create: `src/api/session.d.ts`, `src/api/middleware/requireStaff.ts`, `tests/requireStaff.test.ts`
- Modify: `package.json` (express + session deps)

- [ ] **Step 1: Install Express + session deps**

```bash
npm install express express-session connect-pg-simple helmet
npm install -D @types/express @types/express-session
```

- [ ] **Step 2: Create `src/api/session.d.ts`** (augment session shape)

```ts
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    user?: {
      id: string;
      username: string;
      avatar: string | null;
      authorized: boolean;
    };
  }
}
```

- [ ] **Step 3: Write the failing test**

`tests/requireStaff.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requireStaff } from '../src/api/middleware/requireStaff';

function appWithSession(user: any) {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).session = user ? { user } : {};
    next();
  });
  app.get('/protected', requireStaff(), (_req, res) => res.json({ ok: true }));
  return app;
}

describe('requireStaff', () => {
  it('401s without an authorized session', async () => {
    await request(appWithSession(null)).get('/protected').expect(401);
  });
  it('passes through for an authorized user', async () => {
    await request(appWithSession({ authorized: true })).get('/protected').expect(200, { ok: true });
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `npx vitest run tests/requireStaff.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 5: Implement `src/api/middleware/requireStaff.ts`**

```ts
import type { RequestHandler } from 'express';

export function requireStaff(): RequestHandler {
  return (req, res, next) => {
    if (req.session?.user?.authorized) {
      next();
      return;
    }
    res.status(401).json({ error: 'unauthorized' });
  };
}
```

- [ ] **Step 6: Run it to confirm it passes**

Run: `npx vitest run tests/requireStaff.test.ts`
Expected: 2 passed.

- [ ] **Step 7: Commit**

```bash
git add src/api/session.d.ts src/api/middleware/requireStaff.ts tests/requireStaff.test.ts package.json package-lock.json
git commit -m "feat: add session typing and requireStaff middleware"
```

---

### Task 8: Overview route

**Files:**
- Create: `src/api/routes/overview.ts`, `tests/overview.test.ts`

- [ ] **Step 1: Write the failing test** (fake client, route mounted without auth)

`tests/overview.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createOverviewRouter } from '../src/api/routes/overview';

function fakeDeps() {
  const guild = {
    name: 'My Server',
    memberCount: 42,
    members: { cache: { filter: () => ({ size: 7 }) } },
  };
  return {
    config: { guildId: 'g1' },
    client: { guilds: { cache: { get: (id: string) => (id === 'g1' ? guild : undefined) } } },
  } as any;
}

describe('overview route', () => {
  it('returns server stats', async () => {
    const app = express();
    app.use('/api/overview', createOverviewRouter(fakeDeps()));
    const res = await request(app).get('/api/overview').expect(200);
    expect(res.body).toMatchObject({ name: 'My Server', memberCount: 42, onlineCount: 7, recentLogs: [] });
  });

  it('503s when the guild is unavailable', async () => {
    const deps = fakeDeps();
    deps.config.guildId = 'missing';
    const app = express();
    app.use('/api/overview', createOverviewRouter(deps));
    await request(app).get('/api/overview').expect(503);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/overview.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/api/routes/overview.ts`**

```ts
import { Router } from 'express';
import type { Client } from 'discord.js';
import type { AppConfig } from '../../shared/config';

export interface OverviewDeps {
  client: Client;
  config: Pick<AppConfig, 'guildId'>;
}

export function createOverviewRouter(deps: OverviewDeps): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    const guild = deps.client.guilds.cache.get(deps.config.guildId);
    if (!guild) {
      res.status(503).json({ error: 'guild not available' });
      return;
    }
    const onlineCount = guild.members.cache.filter(
      (m) => m.presence != null && m.presence.status !== 'offline',
    ).size;
    res.json({ name: guild.name, memberCount: guild.memberCount, onlineCount, recentLogs: [] });
  });
  return router;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run tests/overview.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/api/routes/overview.ts tests/overview.test.ts
git commit -m "feat: add overview API route"
```

---

### Task 9: Auth router (Discord OAuth2)

The token/identity round-trip is verified manually (Task 13); here we wire the routes and confirm the app mounts and `/api/auth/me` 401s when logged out.

**Files:**
- Create: `src/api/routes/auth.ts`, `tests/authRoute.test.ts`

- [ ] **Step 1: Implement `src/api/routes/auth.ts`**

```ts
import { Router } from 'express';
import type { Client } from 'discord.js';
import type { AppConfig } from '../../shared/config';
import { isStaff } from '../auth-utils';
import { getSettings } from '../../db/settingsCache';
import { logger } from '../../shared/logger';

const DISCORD_API = 'https://discord.com/api';

export interface AuthDeps {
  client: Client;
  config: AppConfig;
}

export function createAuthRouter(deps: AuthDeps): Router {
  const { config, client } = deps;
  const router = Router();

  router.get('/login', (_req, res) => {
    const url = new URL(`${DISCORD_API}/oauth2/authorize`);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.oauthRedirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'identify');
    res.redirect(url.toString());
  });

  router.get('/callback', async (req, res) => {
    const code = String(req.query.code ?? '');
    if (!code) return res.redirect(`${config.dashboardUrl}/login?error=nocode`);
    try {
      const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.oauthRedirectUri,
        }),
      });
      if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status}`);
      const token = (await tokenRes.json()) as { access_token: string };

      const userRes = await fetch(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      const user = (await userRes.json()) as { id: string; username: string; avatar: string | null };

      const guild = client.guilds.cache.get(config.guildId);
      const member = await guild?.members.fetch(user.id).catch(() => null);
      if (!member) return res.redirect(`${config.dashboardUrl}/login?error=notmember`);

      const settings = await getSettings(config.guildId);
      if (!isStaff(member, settings.staffRoleIds)) {
        return res.redirect(`${config.dashboardUrl}/login?error=forbidden`);
      }

      req.session.user = { id: user.id, username: user.username, avatar: user.avatar, authorized: true };
      res.redirect(config.dashboardUrl);
    } catch (err) {
      logger.error(`OAuth callback error: ${err}`);
      res.redirect(`${config.dashboardUrl}/login?error=oauth`);
    }
  });

  router.get('/me', (req, res) => {
    if (!req.session.user?.authorized) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    res.json(req.session.user);
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  return router;
}
```

- [ ] **Step 2: Write a test for the logged-out `/me`**

`tests/authRoute.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAuthRouter } from '../src/api/routes/auth';

const config = {
  clientId: 'c', clientSecret: 's', guildId: 'g1', sessionSecret: 'x',
  dashboardUrl: 'http://localhost:5173', oauthRedirectUri: 'http://localhost:3000/api/auth/callback',
  discordToken: 't', databaseUrl: 'd', port: 3000, isProd: false,
} as any;

function app() {
  const a = express();
  a.use((req, _res, next) => { (req as any).session = {}; next(); });
  a.use('/api/auth', createAuthRouter({ client: {} as any, config }));
  return a;
}

describe('auth route', () => {
  it('redirects /login to Discord', async () => {
    const res = await request(app()).get('/api/auth/login').expect(302);
    expect(res.headers.location).toContain('discord.com/api/oauth2/authorize');
    expect(res.headers.location).toContain('client_id=c');
  });
  it('401s /me when logged out', async () => {
    await request(app()).get('/api/auth/me').expect(401);
  });
});
```

- [ ] **Step 3: Run it**

Run: `npx vitest run tests/authRoute.test.ts`
Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add src/api/routes/auth.ts tests/authRoute.test.ts
git commit -m "feat: add discord oauth auth router"
```

---

### Task 10: Express app factory + boot integration

**Files:**
- Create: `src/api/server.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create `src/api/server.ts`** (session store injectable for tests)

```ts
import express, { type Express } from 'express';
import session, { type Store } from 'express-session';
import helmet from 'helmet';
import connectPgSimple from 'connect-pg-simple';
import { join } from 'path';
import type { Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../shared/config';
import { logger } from '../shared/logger';
import { createAuthRouter } from './routes/auth';
import { createOverviewRouter } from './routes/overview';
import { requireStaff } from './middleware/requireStaff';

export interface ApiDeps {
  client: Client;
  prisma: PrismaClient;
  config: AppConfig;
  sessionStore?: Store;
}

export function createApp(deps: ApiDeps): Express {
  const app = express();
  app.use(helmet());
  app.use(express.json());

  const PgStore = connectPgSimple(session);
  app.use(
    session({
      store: deps.sessionStore ?? new PgStore({ conString: deps.config.databaseUrl, createTableIfMissing: true }),
      secret: deps.config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: deps.config.isProd,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', createAuthRouter(deps));
  app.use('/api/overview', requireStaff(), createOverviewRouter(deps));

  const webDist = join(__dirname, '..', '..', 'web', 'dist');
  app.use(express.static(webDist));
  app.get('*', (_req, res) => res.sendFile(join(webDist, 'index.html')));

  return app;
}

export function startApiServer(deps: ApiDeps): void {
  const app = createApp(deps);
  app.listen(deps.config.port, () => logger.success(`Dashboard API listening on :${deps.config.port}`));
}
```

- [ ] **Step 2: Update `src/index.ts` to boot bot + API**

```ts
import 'dotenv/config';
import { loadConfig } from './shared/config';
import { logger } from './shared/logger';
import { client } from './bot/client';
import { loadCommands, registerCommands, loadEvents } from './bot/loader';
import { prisma } from './db/prisma';
import { ensureGuildSettings } from './db/settingsCache';
import { startApiServer } from './api/server';

async function main() {
  const config = loadConfig();

  const commands = loadCommands();
  await registerCommands(commands, config.discordToken, config.clientId);
  loadEvents(client, commands);

  await client.login(config.discordToken);
  await ensureGuildSettings(config.guildId);

  startApiServer({ client, prisma, config });
}

main().catch((err) => {
  logger.error(`Fatal: ${err}`);
  process.exit(1);
});
```

- [ ] **Step 3: Add a health-route test using an in-memory session store**

`tests/server.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import session from 'express-session';
import request from 'supertest';
import { createApp } from '../src/api/server';

const config = {
  clientId: 'c', clientSecret: 's', guildId: 'g1', sessionSecret: 'x',
  dashboardUrl: 'http://localhost:5173', oauthRedirectUri: 'http://localhost:3000/api/auth/callback',
  discordToken: 't', databaseUrl: 'd', port: 3000, isProd: false,
} as any;

describe('createApp', () => {
  it('serves /api/health', async () => {
    const app = createApp({
      client: { guilds: { cache: { get: () => undefined } } } as any,
      prisma: {} as any,
      config,
      sessionStore: new session.MemoryStore(),
    });
    await request(app).get('/api/health').expect(200, { ok: true });
  });
});
```

- [ ] **Step 4: Run the full test suite + typecheck/build**

Run: `npx vitest run`
Expected: all tests pass.
Run: `npm run build`
Expected: compiles with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/api/server.ts src/index.ts tests/server.test.ts
git commit -m "feat: wire express app and boot bot + api together"
```

---

### Task 11: Frontend SPA (Vite + React)

**Files:**
- Create: `web/` (Vite app) with `web/src/{main.tsx,App.tsx,lib/api.ts,auth.tsx,pages/Login.tsx,pages/Overview.tsx}`
- Modify: `web/vite.config.ts`

- [ ] **Step 1: Scaffold the SPA**

```bash
npm create vite@latest web -- --template react-ts
cd web && npm install && npm install react-router-dom @tanstack/react-query && cd ..
```

- [ ] **Step 2: Configure dev proxy + build output in `web/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
});
```

- [ ] **Step 3: API helper `web/src/lib/api.ts`**

```ts
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: 'include', ...init });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(`request failed: ${res.status}`);
  return res.json() as Promise<T>;
}
```

- [ ] **Step 4: Auth hook `web/src/auth.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { api } from './lib/api';

export interface Me {
  id: string;
  username: string;
  avatar: string | null;
  authorized: boolean;
}

export function useMe() {
  return useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => api<Me>('/auth/me'),
    retry: false,
  });
}
```

- [ ] **Step 5: Login page `web/src/pages/Login.tsx`**

```tsx
export function Login() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', background: '#1a1a1a', color: '#fff' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ color: '#f57c00' }}>LY-SYSTEM Dashboard</h1>
        <a
          href="/api/auth/login"
          style={{ display: 'inline-block', marginTop: 16, padding: '12px 24px', background: '#f57c00', color: '#fff', borderRadius: 8, textDecoration: 'none' }}
        >
          تسجيل الدخول عبر Discord
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Overview page `web/src/pages/Overview.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Overview {
  name: string;
  memberCount: number;
  onlineCount: number;
}

export function Overview() {
  const { data, isLoading, error } = useQuery<Overview>({ queryKey: ['overview'], queryFn: () => api('/overview') });
  if (isLoading) return <p>جاري التحميل...</p>;
  if (error) return <p>تعذّر تحميل البيانات</p>;
  return (
    <div style={{ padding: 24, color: '#fff' }}>
      <h2 style={{ color: '#f57c00' }}>{data!.name}</h2>
      <p>الأعضاء: {data!.memberCount}</p>
      <p>المتصلون: {data!.onlineCount}</p>
    </div>
  );
}
```

- [ ] **Step 7: Router + guard in `web/src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useMe } from './auth';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';

function Guarded({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError } = useMe();
  if (isLoading) return <p>...</p>;
  if (isError || !data?.authorized) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Guarded><Overview /></Guarded>} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 8: Wrap with React Query in `web/src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 9: Verify the SPA builds**

Run: `cd web && npm run build && cd ..`
Expected: `web/dist/index.html` and assets produced, no errors.

- [ ] **Step 10: Commit**

```bash
git add web
git commit -m "feat: add react dashboard spa (login + overview)"
```

---

### Task 12: Build/deploy wiring (Railway) + env docs

**Files:**
- Modify: `package.json` (scripts), `railway.json`, `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Update root `package.json` scripts**

```json
"scripts": {
  "build": "prisma generate && tsc && npm --prefix web install && npm --prefix web run build",
  "start": "prisma migrate deploy && node dist/index.js",
  "dev": "ts-node src/index.ts",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 2: Ensure build artifacts are ignored** — confirm `.gitignore` contains `dist/`, `node_modules/`, `web/dist/`, `web/node_modules/`, `.env`. Add any that are missing.

- [ ] **Step 3: Create `.env.example`**

```
DISCORD_TOKEN=
CLIENT_ID=
DISCORD_CLIENT_SECRET=
SESSION_SECRET=
GUILD_ID=
DATABASE_URL=
DASHBOARD_URL=http://localhost:5173
OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/callback
PORT=3000
```

- [ ] **Step 4: Update `railway.json`** (build already runs `npm run build`; `start` now migrates first)

```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && npm run build"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5
  }
}
```

- [ ] **Step 5: Full local verification**

Run: `npm run build`
Expected: prisma client generated, TS compiled to `dist/`, `web/dist` built — no errors.
Run: `npx vitest run`
Expected: all suites pass.

- [ ] **Step 6: Commit**

```bash
git add package.json railway.json .gitignore .env.example
git commit -m "chore: wire build/deploy scripts and env template"
```

---

### Task 13: Manual end-to-end verification

No code — this proves the foundation works against real Discord + Postgres. Prerequisites the owner supplies: `GUILD_ID`, `DISCORD_CLIENT_SECRET`, a Postgres `DATABASE_URL`, and an OAuth redirect URI registered in the Discord Developer Portal (`{DASHBOARD_URL or host}/api/auth/callback`).

- [ ] **Step 1:** Fill `.env` from `.env.example` with real values. In the Discord Developer Portal → OAuth2 → add the redirect URI matching `OAUTH_REDIRECT_URI`.
- [ ] **Step 2:** `npm run build && npm start`. Confirm logs: commands/events loaded, bot online, `Dashboard API listening on :3000`.
- [ ] **Step 3:** In a second terminal, `cd web && npm run dev`. Open the Vite URL (http://localhost:5173).
- [ ] **Step 4:** You should be redirected to `/login`. Click "تسجيل الدخول عبر Discord", authorize, and confirm you land on the overview showing your server name, member count, and online count.
- [ ] **Step 5:** Test authorization: with an account that is NOT staff in the guild, confirm the callback redirects to `/login?error=forbidden`.
- [ ] **Step 6:** Confirm `GET /api/overview` returns 401 when logged out (e.g., `curl -i http://localhost:3000/api/overview`).

---

## Self-Review

**Spec coverage:** Single-process bot+API (Tasks 2,10) ✓ · PostgreSQL/Prisma source of truth (Tasks 4,5) ✓ · Discord OAuth2 + RBAC restricted to one guild (Tasks 6,9) ✓ · Session in Postgres via connect-pg-simple (Task 10) ✓ · Overview page (Tasks 8,11) ✓ · Vite SPA served same-origin by Express (Tasks 10,11) ✓ · Railway build/migrate wiring + new env vars (Task 12) ✓. Moderation/AutoMod/logs/scheduler are intentionally deferred to the Phase-2 plan; the schema already includes their models so no migration rework is needed.

**Placeholder scan:** No TBD/TODO; every code step contains real code; every test step has runnable assertions and an expected result.

**Type consistency:** `AppConfig` fields are used identically across config, server, auth, overview. `ApiDeps` (server) supplies `client/prisma/config/sessionStore`; routers consume narrowed deps (`OverviewDeps`, `AuthDeps`). `SessionData.user` shape (id/username/avatar/authorized) matches what the auth callback sets, what `requireStaff` reads, and what the frontend `Me` interface expects. `isStaff(member, staffRoleIds)` signature matches its call site in the auth router.

## Notes / Risks

- **Build-before-run** remains mandatory; the relocated loader still filters `.js` against `dist/bot/`.
- **Node 18+** required for global `fetch` (Railway NIXPACKS provides this; pin `"engines": { "node": ">=18" }` if needed).
- **Member presence** counts depend on the `GuildPresences` intent if exact online counts matter later; Phase 1 tolerates approximate counts from cache.
- The OAuth `redirect_uri` must match the Developer Portal entry exactly (owner action at deploy).
