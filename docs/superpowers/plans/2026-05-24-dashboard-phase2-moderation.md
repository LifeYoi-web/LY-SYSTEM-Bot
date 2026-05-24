# Dashboard Phase 2 — Moderation (Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff ban / kick / mute (timeout) / warn members from the dashboard, with a persisted per-member case history, a settings page (log channel + staff roles), and a background scheduler that auto-lifts expired temporary mutes/bans.

**Architecture:** A single shared `actions` module (`src/bot/moderation/actions.ts`) performs every Discord action AND writes a `ModerationCase` + `LogEntry`, so the API (and any future slash command) never diverges. API routers follow the existing injectable-deps factory pattern (`createXRouter(deps)`), are mounted behind `requireStaff`, and command the live shared `Client`. The React SPA gains a nav `Layout` plus Members / Cases / Settings pages built on the existing `api()` + React Query helpers. A `setInterval` scheduler lifts expired cases.

**Tech Stack:** discord.js v14, TypeScript (CommonJS), Express, Prisma v7 + PostgreSQL, Vite + React + react-router-dom + @tanstack/react-query, Vitest + supertest.

**Scope note:** This plan is the **manual-moderation core**. AutoMod (anti-spam/invite/link/banned-words/mentions) and event logging (joins/leaves, message edit/delete, role changes) reuse `actions.recordCase` + the `LogEntry` model and are a **follow-up plan** (`...-phase2-automod-logging.md`). The `ModerationCase` / `AutoModConfig` / `LogEntry` Prisma models already exist (created in Phase 1) — no migration changes here.

---

## Conventions for this plan

- **Build-before-run:** the loader matches `.js` against `dist/`. Always `npm run build` before `npm start`. `npm run dev` does NOT load commands/events.
- **Test runner:** Vitest. Single file: `npx vitest run tests/<file>.test.ts`. Whole suite: `npm test`.
- **TDD** applies to pure logic, the actions module, the scheduler, and all API routes. **Frontend pages use explicit manual verification** (no DOM test harness in this project).
- **Dependency injection:** routers/actions take a narrowed `deps` object so tests pass fakes (no real DB/Discord). Follow the structural-interface pattern already used in `src/api/auth-utils.ts` (`StaffCheckMember`).
- **Branding:** embeds/UI use LY orange `#f57c00`, dark theme; code identifiers English, user-facing labels Arabic.
- **Commits:** commit after each task; keep them small.

## File Structure (created/modified across the plan)

```
src/
├── bot/
│   ├── moderation/actions.ts   CREATE — ban/kick/mute/warn/liftCase + recordCase (shared)
│   └── scheduler.ts            CREATE — liftExpiredCases + startScheduler
├── db/
│   └── settingsCache.ts        MODIFY — add updateSettings(guildId, data)
├── api/
│   ├── routes/moderation.ts    CREATE — POST ban/kick/mute/warn, GET /cases, DELETE /cases/:id
│   ├── routes/members.ts       CREATE — GET / (search + limit)
│   ├── routes/settings.ts      CREATE — GET/PUT (logChannelId, staffRoleIds)
│   └── server.ts               MODIFY — mount the three routers behind requireStaff
└── index.ts                    MODIFY — startScheduler after boot
web/src/
├── lib/api.ts                  MODIFY — add apiPost/apiPut/apiDelete helpers
├── components/Layout.tsx       CREATE — nav shell + logout (react-router <Outlet/>)
├── pages/Members.tsx           CREATE — member search + action modal
├── pages/Cases.tsx             CREATE — case list + lift
├── pages/Settings.tsx          CREATE — log channel + staff roles form
└── App.tsx                     MODIFY — nested routes under Layout
tests/
├── actions.test.ts             CREATE
├── scheduler.test.ts           CREATE
├── moderation.test.ts          CREATE
├── members.test.ts             CREATE
├── settings.test.ts            CREATE
└── settingsCache.test.ts       MODIFY — cover updateSettings
```

---

### Task 1: `updateSettings` in the settings cache

The Settings route needs to persist `logChannelId` / `staffRoleIds` and keep the in-memory cache coherent.

**Files:**
- Modify: `src/db/settingsCache.ts`
- Modify: `tests/settingsCache.test.ts`

- [ ] **Step 1: Extend the failing test** — add `update` to the mocked prisma and a new case.

In `tests/settingsCache.test.ts`, change the mock and imports:
```ts
const upsert = vi.fn();
const update = vi.fn();
vi.mock('../src/db/prisma', () => ({
  prisma: { guildSettings: { upsert, update } },
}));

import {
  ensureGuildSettings, getSettings, invalidateSettings, updateSettings,
} from '../src/db/settingsCache';
```
In `beforeEach`, add `update.mockReset().mockResolvedValue({ ...row, logChannelId: 'c9' });`

Add this test inside the `describe`:
```ts
it('updateSettings writes through and refreshes the cache', async () => {
  await ensureGuildSettings('g1');           // seeds cache (upsert #1)
  const updated = await updateSettings('g1', { logChannelId: 'c9' });
  expect(updated.logChannelId).toBe('c9');
  expect(update).toHaveBeenCalledWith({ where: { guildId: 'g1' }, data: { logChannelId: 'c9' } });
  const cached = await getSettings('g1');     // served from cache, no upsert #2
  expect(cached.logChannelId).toBe('c9');
  expect(upsert).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/settingsCache.test.ts`
Expected: FAIL — `updateSettings is not a function`.

- [ ] **Step 3: Implement `updateSettings`**

Append to `src/db/settingsCache.ts`:
```ts
export async function updateSettings(
  guildId: string,
  data: Partial<Pick<GuildSettings, 'logChannelId' | 'staffRoleIds'>>,
): Promise<GuildSettings> {
  const settings = await prisma.guildSettings.update({ where: { guildId }, data });
  cache.set(guildId, settings);
  return settings;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run tests/settingsCache.test.ts`
Expected: all pass (3 original + 1 new).

- [ ] **Step 5: Commit**

```bash
git add src/db/settingsCache.ts tests/settingsCache.test.ts
git commit -m "feat: add updateSettings write-through to settings cache"
```

---

### Task 2: Shared moderation actions

One module performs each Discord action and records a `ModerationCase` + `LogEntry`. Uses structural interfaces so tests inject fakes.

**Files:**
- Create: `src/bot/moderation/actions.ts`
- Create: `tests/actions.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/actions.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { banUser, kickUser, muteUser, warnUser, liftCase } from '../src/bot/moderation/actions';

function fakeDeps() {
  const member = { timeout: vi.fn().mockResolvedValue(undefined) };
  const guild = {
    members: {
      ban: vi.fn().mockResolvedValue(undefined),
      kick: vi.fn().mockResolvedValue(undefined),
      unban: vi.fn().mockResolvedValue(undefined),
      fetch: vi.fn().mockResolvedValue(member),
    },
  };
  let seq = 0;
  const prisma = {
    moderationCase: {
      create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: `c${++seq}`, active: true, ...data })),
      update: vi.fn().mockImplementation(({ where, data }: any) => Promise.resolve({ id: where.id, ...data })),
      findUnique: vi.fn(),
    },
    logEntry: { create: vi.fn().mockResolvedValue(undefined) },
  };
  return { deps: { guild, prisma } as any, guild, member, prisma };
}

const base = { guildId: 'g1', targetUserId: 'u1', moderatorId: 'm1', reason: 'spam' };

describe('moderation actions', () => {
  let f: ReturnType<typeof fakeDeps>;
  beforeEach(() => { f = fakeDeps(); });

  it('banUser bans, records a case and a log entry', async () => {
    const c = await banUser(f.deps, { ...base, deleteMessageSeconds: 3600 });
    expect(f.guild.members.ban).toHaveBeenCalledWith('u1', { reason: 'spam', deleteMessageSeconds: 3600 });
    expect(c.type).toBe('ban');
    expect(f.prisma.moderationCase.create).toHaveBeenCalledTimes(1);
    expect(f.prisma.logEntry.create).toHaveBeenCalledTimes(1);
  });

  it('kickUser kicks and records', async () => {
    const c = await kickUser(f.deps, base);
    expect(f.guild.members.kick).toHaveBeenCalledWith('u1', 'spam');
    expect(c.type).toBe('kick');
  });

  it('muteUser times out for the given seconds and sets expiresAt', async () => {
    const c = await muteUser(f.deps, { ...base, seconds: 300 });
    expect(f.guild.members.fetch).toHaveBeenCalledWith('u1');
    expect(f.member.timeout).toHaveBeenCalledWith(300_000, 'spam');
    expect(c.type).toBe('mute');
    expect(c.expiresAt).toBeInstanceOf(Date);
  });

  it('warnUser only records (no Discord action)', async () => {
    const c = await warnUser(f.deps, base);
    expect(f.guild.members.ban).not.toHaveBeenCalled();
    expect(f.guild.members.kick).not.toHaveBeenCalled();
    expect(c.type).toBe('warn');
  });

  it('liftCase unbans, marks the ban case inactive and logs', async () => {
    f.prisma.moderationCase.findUnique.mockResolvedValue({ id: 'c1', guildId: 'g1', targetUserId: 'u1', type: 'ban', active: true });
    const c = await liftCase(f.deps, 'c1');
    expect(f.guild.members.unban).toHaveBeenCalledWith('u1', expect.any(String));
    expect(f.prisma.moderationCase.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { active: false } });
    expect(c?.active).toBe(false);
  });

  it('liftCase returns null for an unknown case', async () => {
    f.prisma.moderationCase.findUnique.mockResolvedValue(null);
    expect(await liftCase(f.deps, 'nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/actions.test.ts`
Expected: FAIL — cannot find module `../src/bot/moderation/actions`.

- [ ] **Step 3: Implement `src/bot/moderation/actions.ts`**

```ts
import type { PrismaClient, ModerationCase } from '@prisma/client';

export interface MemberLike {
  timeout(ms: number | null, reason?: string): Promise<unknown>;
}

export interface GuildLike {
  members: {
    ban(userId: string, options?: { reason?: string; deleteMessageSeconds?: number }): Promise<unknown>;
    kick(userId: string, reason?: string): Promise<unknown>;
    unban(userId: string, reason?: string): Promise<unknown>;
    fetch(userId: string): Promise<MemberLike>;
  };
}

export interface ActionDeps {
  guild: GuildLike;
  prisma: PrismaClient;
}

export type CaseType = 'ban' | 'kick' | 'mute' | 'warn';

interface BaseParams {
  guildId: string;
  targetUserId: string;
  moderatorId: string;
  reason?: string;
}
export interface BanParams extends BaseParams { deleteMessageSeconds?: number; expiresAt?: Date; }
export type KickParams = BaseParams;
export interface MuteParams extends BaseParams { seconds: number; }
export type WarnParams = BaseParams;

async function recordCase(
  deps: ActionDeps,
  type: CaseType,
  p: BaseParams,
  expiresAt: Date | null = null,
): Promise<ModerationCase> {
  const created = await deps.prisma.moderationCase.create({
    data: {
      guildId: p.guildId,
      targetUserId: p.targetUserId,
      moderatorId: p.moderatorId,
      type,
      reason: p.reason ?? null,
      expiresAt,
      active: true,
    },
  });
  await deps.prisma.logEntry.create({
    data: {
      guildId: p.guildId,
      type: `mod_${type}`,
      data: { caseId: created.id, targetUserId: p.targetUserId, moderatorId: p.moderatorId, reason: p.reason ?? null },
    },
  });
  return created;
}

export async function banUser(deps: ActionDeps, p: BanParams): Promise<ModerationCase> {
  await deps.guild.members.ban(p.targetUserId, { reason: p.reason, deleteMessageSeconds: p.deleteMessageSeconds });
  return recordCase(deps, 'ban', p, p.expiresAt ?? null);
}

export async function kickUser(deps: ActionDeps, p: KickParams): Promise<ModerationCase> {
  await deps.guild.members.kick(p.targetUserId, p.reason);
  return recordCase(deps, 'kick', p);
}

export async function muteUser(deps: ActionDeps, p: MuteParams): Promise<ModerationCase> {
  const member = await deps.guild.members.fetch(p.targetUserId);
  await member.timeout(p.seconds * 1000, p.reason);
  return recordCase(deps, 'mute', p, new Date(Date.now() + p.seconds * 1000));
}

export async function warnUser(deps: ActionDeps, p: WarnParams): Promise<ModerationCase> {
  return recordCase(deps, 'warn', p);
}

export async function liftCase(deps: ActionDeps, caseId: string): Promise<ModerationCase | null> {
  const found = await deps.prisma.moderationCase.findUnique({ where: { id: caseId } });
  if (!found) return null;
  if (found.active) {
    if (found.type === 'ban') {
      await deps.guild.members.unban(found.targetUserId, 'case lifted').catch(() => undefined);
    } else if (found.type === 'mute') {
      const member = await deps.guild.members.fetch(found.targetUserId).catch(() => null);
      await member?.timeout(null, 'case lifted');
    }
  }
  const updated = await deps.prisma.moderationCase.update({ where: { id: caseId }, data: { active: false } });
  await deps.prisma.logEntry.create({
    data: { guildId: found.guildId, type: `mod_lift_${found.type}`, data: { caseId } },
  });
  return updated;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run tests/actions.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/bot/moderation/actions.ts tests/actions.test.ts
git commit -m "feat: add shared moderation actions (ban/kick/mute/warn/lift)"
```

---

### Task 3: Expiry scheduler

Periodically lift active cases whose `expiresAt` has passed (timed mutes/bans), reusing `liftCase`.

**Files:**
- Create: `src/bot/scheduler.ts`
- Create: `tests/scheduler.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/scheduler.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { liftExpiredCases } from '../src/bot/scheduler';

describe('liftExpiredCases', () => {
  it('lifts each expired active case and returns the count', async () => {
    const member = { timeout: vi.fn().mockResolvedValue(undefined) };
    const guild = {
      members: {
        ban: vi.fn(), kick: vi.fn(),
        unban: vi.fn().mockResolvedValue(undefined),
        fetch: vi.fn().mockResolvedValue(member),
      },
    };
    const expired = [
      { id: 'c1', guildId: 'g1', targetUserId: 'u1', type: 'ban', active: true },
      { id: 'c2', guildId: 'g1', targetUserId: 'u2', type: 'mute', active: true },
    ];
    const prisma = {
      moderationCase: {
        findMany: vi.fn().mockResolvedValue(expired),
        findUnique: vi.fn().mockImplementation(({ where }: any) => Promise.resolve(expired.find((c) => c.id === where.id) ?? null)),
        update: vi.fn().mockImplementation(({ where, data }: any) => Promise.resolve({ id: where.id, ...data })),
      },
      logEntry: { create: vi.fn().mockResolvedValue(undefined) },
    };
    const n = await liftExpiredCases({ guild, prisma } as any);
    expect(n).toBe(2);
    expect(prisma.moderationCase.findMany).toHaveBeenCalledWith({
      where: { active: true, expiresAt: { not: null, lte: expect.any(Date) } },
    });
    expect(guild.members.unban).toHaveBeenCalledWith('u1', expect.any(String));
    expect(member.timeout).toHaveBeenCalledWith(null, expect.any(String));
  });

  it('returns 0 when nothing is expired', async () => {
    const prisma = { moderationCase: { findMany: vi.fn().mockResolvedValue([]) }, logEntry: { create: vi.fn() } };
    const guild = { members: {} };
    expect(await liftExpiredCases({ guild, prisma } as any)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/scheduler.test.ts`
Expected: FAIL — cannot find module `../src/bot/scheduler`.

- [ ] **Step 3: Implement `src/bot/scheduler.ts`**

```ts
import type { Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import { liftCase, type ActionDeps, type GuildLike } from './moderation/actions';
import { logger } from '../shared/logger';

export async function liftExpiredCases(deps: ActionDeps): Promise<number> {
  const expired = await deps.prisma.moderationCase.findMany({
    where: { active: true, expiresAt: { not: null, lte: new Date() } },
  });
  for (const c of expired) {
    await liftCase(deps, c.id);
  }
  return expired.length;
}

export interface SchedulerDeps {
  client: Client;
  prisma: PrismaClient;
  guildId: string;
}

export function startScheduler(deps: SchedulerDeps, intervalMs = 60_000): NodeJS.Timeout {
  const tick = async () => {
    const guild = deps.client.guilds.cache.get(deps.guildId);
    if (!guild) return;
    try {
      const n = await liftExpiredCases({ guild: guild as unknown as GuildLike, prisma: deps.prisma });
      if (n > 0) logger.info(`Scheduler lifted ${n} expired case(s)`);
    } catch (err) {
      logger.error(`Scheduler error: ${err}`);
    }
  };
  const handle = setInterval(tick, intervalMs);
  handle.unref?.();
  return handle;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run tests/scheduler.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/bot/scheduler.ts tests/scheduler.test.ts
git commit -m "feat: add expiry scheduler for temporary mutes/bans"
```

---

### Task 4: Moderation API router

**Files:**
- Create: `src/api/routes/moderation.ts`
- Create: `tests/moderation.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/moderation.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createModerationRouter } from '../src/api/routes/moderation';

function fakeDeps(withGuild = true) {
  const member = { timeout: vi.fn().mockResolvedValue(undefined) };
  const guild = {
    members: {
      ban: vi.fn().mockResolvedValue(undefined),
      kick: vi.fn().mockResolvedValue(undefined),
      unban: vi.fn().mockResolvedValue(undefined),
      fetch: vi.fn().mockResolvedValue(member),
    },
  };
  const prisma = {
    moderationCase: {
      create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'c1', ...data })),
      update: vi.fn().mockImplementation(({ where, data }: any) => Promise.resolve({ id: where.id, ...data })),
      findUnique: vi.fn().mockResolvedValue({ id: 'c1', guildId: 'g1', targetUserId: 'u1', type: 'ban', active: true }),
      findMany: vi.fn().mockResolvedValue([{ id: 'c1', type: 'warn' }]),
    },
    logEntry: { create: vi.fn().mockResolvedValue(undefined) },
  };
  return {
    client: { guilds: { cache: { get: (id: string) => (withGuild && id === 'g1' ? guild : undefined) } } },
    prisma,
    config: { guildId: 'g1' },
  } as any;
}

function app(deps: any) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { (req as any).session = { user: { id: 'mod1', authorized: true } }; next(); });
  a.use('/api/moderation', createModerationRouter(deps));
  return a;
}

describe('moderation router', () => {
  it('POST /ban performs the ban and returns 201 with a case', async () => {
    const deps = fakeDeps();
    const res = await request(app(deps)).post('/api/moderation/ban').send({ userId: 'u1', reason: 'spam' }).expect(201);
    expect(res.body.type).toBe('ban');
    expect(deps.client.guilds.cache.get('g1').members.ban).toHaveBeenCalled();
  });

  it('POST /ban 400s without userId', async () => {
    await request(app(fakeDeps())).post('/api/moderation/ban').send({ reason: 'x' }).expect(400);
  });

  it('POST /mute 400s on a non-positive duration', async () => {
    await request(app(fakeDeps())).post('/api/moderation/mute').send({ userId: 'u1', seconds: 0 }).expect(400);
  });

  it('POST /mute 201s with a valid duration', async () => {
    await request(app(fakeDeps())).post('/api/moderation/mute').send({ userId: 'u1', seconds: 600 }).expect(201);
  });

  it('GET /cases returns the list', async () => {
    const res = await request(app(fakeDeps())).get('/api/moderation/cases?userId=u1').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('DELETE /cases/:id lifts the case', async () => {
    const res = await request(app(fakeDeps())).delete('/api/moderation/cases/c1').expect(200);
    expect(res.body.active).toBe(false);
  });

  it('503s when the guild is unavailable', async () => {
    await request(app(fakeDeps(false))).post('/api/moderation/ban').send({ userId: 'u1' }).expect(503);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/moderation.test.ts`
Expected: FAIL — cannot find module `../src/api/routes/moderation`.

- [ ] **Step 3: Implement `src/api/routes/moderation.ts`**

```ts
import { Router, type Response, type Request } from 'express';
import type { Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { banUser, kickUser, muteUser, warnUser, liftCase, type ActionDeps, type GuildLike } from '../../bot/moderation/actions';
import { logger } from '../../shared/logger';

export interface ModerationDeps {
  client: Client;
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

const MAX_MUTE_SECONDS = 2_419_200; // Discord timeout cap = 28 days

export function createModerationRouter(deps: ModerationDeps): Router {
  const router = Router();

  function resolveAction(res: Response): ActionDeps | null {
    const guild = deps.client.guilds.cache.get(deps.config.guildId);
    if (!guild) {
      res.status(503).json({ error: 'guild not available' });
      return null;
    }
    return { guild: guild as unknown as GuildLike, prisma: deps.prisma };
  }

  const moderatorId = (req: Request): string => req.session?.user?.id ?? 'unknown';

  router.post('/ban', async (req, res) => {
    const { userId, reason, deleteMessageSeconds, expiresAt } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const action = resolveAction(res);
    if (!action) return;
    try {
      const created = await banUser(action, {
        guildId: deps.config.guildId, targetUserId: String(userId), moderatorId: moderatorId(req),
        reason, deleteMessageSeconds: deleteMessageSeconds != null ? Number(deleteMessageSeconds) : undefined,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      });
      res.status(201).json(created);
    } catch (err) {
      logger.error(`ban failed: ${err}`);
      res.status(502).json({ error: 'discord action failed' });
    }
  });

  router.post('/kick', async (req, res) => {
    const { userId, reason } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const action = resolveAction(res);
    if (!action) return;
    try {
      const created = await kickUser(action, { guildId: deps.config.guildId, targetUserId: String(userId), moderatorId: moderatorId(req), reason });
      res.status(201).json(created);
    } catch (err) {
      logger.error(`kick failed: ${err}`);
      res.status(502).json({ error: 'discord action failed' });
    }
  });

  router.post('/mute', async (req, res) => {
    const { userId, reason, seconds } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const secs = Number(seconds);
    if (!Number.isFinite(secs) || secs <= 0 || secs > MAX_MUTE_SECONDS) {
      return res.status(400).json({ error: `seconds must be 1..${MAX_MUTE_SECONDS}` });
    }
    const action = resolveAction(res);
    if (!action) return;
    try {
      const created = await muteUser(action, { guildId: deps.config.guildId, targetUserId: String(userId), moderatorId: moderatorId(req), reason, seconds: secs });
      res.status(201).json(created);
    } catch (err) {
      logger.error(`mute failed: ${err}`);
      res.status(502).json({ error: 'discord action failed' });
    }
  });

  router.post('/warn', async (req, res) => {
    const { userId, reason } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const action = resolveAction(res);
    if (!action) return;
    const created = await warnUser(action, { guildId: deps.config.guildId, targetUserId: String(userId), moderatorId: moderatorId(req), reason });
    res.status(201).json(created);
  });

  router.get('/cases', async (req, res) => {
    const userId = req.query.userId ? String(req.query.userId) : undefined;
    const cases = await deps.prisma.moderationCase.findMany({
      where: { guildId: deps.config.guildId, ...(userId ? { targetUserId: userId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(cases);
  });

  router.delete('/cases/:id', async (req, res) => {
    const action = resolveAction(res);
    if (!action) return;
    const lifted = await liftCase(action, req.params.id);
    if (!lifted) return res.status(404).json({ error: 'case not found' });
    res.json(lifted);
  });

  return router;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run tests/moderation.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/api/routes/moderation.ts tests/moderation.test.ts
git commit -m "feat: add moderation API router"
```

---

### Task 5: Members API router

**Files:**
- Create: `src/api/routes/members.ts`
- Create: `tests/members.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/members.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createMembersRouter } from '../src/api/routes/members';

function member(id: string, username: string, bot = false) {
  return { id, displayName: username, user: { username, bot, displayAvatarURL: () => `https://cdn/${id}.png` } };
}

function fakeDeps(withGuild = true) {
  const cache = new Map([
    ['1', member('1', 'Ahmed')],
    ['2', member('2', 'Sara')],
    ['3', member('3', 'TestBot', true)],
  ]);
  const guild = { members: { cache } };
  return { client: { guilds: { cache: { get: (id: string) => (withGuild && id === 'g1' ? guild : undefined) } } }, config: { guildId: 'g1' } } as any;
}

function app(deps: any) {
  const a = express();
  a.use('/api/members', createMembersRouter(deps));
  return a;
}

describe('members router', () => {
  it('returns mapped members with a total', async () => {
    const res = await request(app(fakeDeps())).get('/api/members').expect(200);
    expect(res.body.total).toBe(3);
    expect(res.body.members[0]).toHaveProperty('avatarUrl');
    expect(res.body.members[0]).toHaveProperty('isBot');
  });

  it('filters by case-insensitive search', async () => {
    const res = await request(app(fakeDeps())).get('/api/members?search=sar').expect(200);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].username).toBe('Sara');
  });

  it('503s when the guild is unavailable', async () => {
    await request(app(fakeDeps(false))).get('/api/members').expect(503);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/members.test.ts`
Expected: FAIL — cannot find module `../src/api/routes/members`.

- [ ] **Step 3: Implement `src/api/routes/members.ts`**

```ts
import { Router } from 'express';
import type { Client } from 'discord.js';
import type { AppConfig } from '../../shared/config';

export interface MembersDeps {
  client: Client;
  config: Pick<AppConfig, 'guildId'>;
}

export function createMembersRouter(deps: MembersDeps): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const guild = deps.client.guilds.cache.get(deps.config.guildId);
    if (!guild) {
      res.status(503).json({ error: 'guild not available' });
      return;
    }
    const search = String(req.query.search ?? '').toLowerCase().trim();
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 100);

    let list = [...guild.members.cache.values()];
    if (search) {
      list = list.filter(
        (m) =>
          m.user.username.toLowerCase().includes(search) ||
          (m.displayName ?? '').toLowerCase().includes(search) ||
          m.id.includes(search),
      );
    }
    const members = list.slice(0, limit).map((m) => ({
      id: m.id,
      username: m.user.username,
      displayName: m.displayName,
      avatarUrl: m.user.displayAvatarURL?.() ?? null,
      isBot: m.user.bot,
    }));
    res.json({ members, total: list.length });
  });

  return router;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run tests/members.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/api/routes/members.ts tests/members.test.ts
git commit -m "feat: add members API router"
```

---

### Task 6: Settings API router

**Files:**
- Create: `src/api/routes/settings.ts`
- Create: `tests/settings.test.ts`

- [ ] **Step 1: Write the failing test** (mock the settings cache module)

`tests/settings.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const getSettings = vi.fn();
const updateSettings = vi.fn();
vi.mock('../src/db/settingsCache', () => ({ getSettings, updateSettings }));

import { createSettingsRouter } from '../src/api/routes/settings';

const row = { guildId: 'g1', logChannelId: null, staffRoleIds: [] as string[] };

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/settings', createSettingsRouter({ config: { guildId: 'g1' } } as any));
  return a;
}

beforeEach(() => {
  getSettings.mockReset().mockResolvedValue(row);
  updateSettings.mockReset().mockImplementation((_g: string, data: any) => Promise.resolve({ ...row, ...data }));
});

describe('settings router', () => {
  it('GET / returns the settings', async () => {
    const res = await request(app()).get('/api/settings').expect(200);
    expect(res.body.guildId).toBe('g1');
  });

  it('PUT / updates log channel and staff roles', async () => {
    const res = await request(app()).put('/api/settings').send({ logChannelId: 'c9', staffRoleIds: ['r1', 'r2'] }).expect(200);
    expect(updateSettings).toHaveBeenCalledWith('g1', { logChannelId: 'c9', staffRoleIds: ['r1', 'r2'] });
    expect(res.body.staffRoleIds).toEqual(['r1', 'r2']);
  });

  it('PUT / 400s when staffRoleIds is not an array', async () => {
    await request(app()).put('/api/settings').send({ staffRoleIds: 'r1' }).expect(400);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/settings.test.ts`
Expected: FAIL — cannot find module `../src/api/routes/settings`.

- [ ] **Step 3: Implement `src/api/routes/settings.ts`**

```ts
import { Router } from 'express';
import type { AppConfig } from '../../shared/config';
import { getSettings, updateSettings } from '../../db/settingsCache';

export interface SettingsDeps {
  config: Pick<AppConfig, 'guildId'>;
}

export function createSettingsRouter(deps: SettingsDeps): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json(await getSettings(deps.config.guildId));
  });

  router.put('/', async (req, res) => {
    const { logChannelId, staffRoleIds } = req.body ?? {};
    const data: { logChannelId?: string | null; staffRoleIds?: string[] } = {};
    if (logChannelId !== undefined) data.logChannelId = logChannelId ? String(logChannelId) : null;
    if (staffRoleIds !== undefined) {
      if (!Array.isArray(staffRoleIds)) {
        res.status(400).json({ error: 'staffRoleIds must be an array' });
        return;
      }
      data.staffRoleIds = staffRoleIds.map(String);
    }
    const updated = await updateSettings(deps.config.guildId, data);
    res.json(updated);
  });

  return router;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run tests/settings.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/api/routes/settings.ts tests/settings.test.ts
git commit -m "feat: add settings API router"
```

---

### Task 7: Mount routers + start the scheduler

**Files:**
- Modify: `src/api/server.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Mount the three routers in `src/api/server.ts`**

Add imports near the existing route imports:
```ts
import { createModerationRouter } from './routes/moderation';
import { createMembersRouter } from './routes/members';
import { createSettingsRouter } from './routes/settings';
```
Add these mounts immediately after the existing `app.use('/api/overview', ...)` line (all behind `requireStaff`):
```ts
  app.use('/api/members', requireStaff(), createMembersRouter(deps));
  app.use('/api/moderation', requireStaff(), createModerationRouter(deps));
  app.use('/api/settings', requireStaff(), createSettingsRouter({ config: deps.config }));
```

- [ ] **Step 2: Start the scheduler in `src/index.ts`**

Add the import:
```ts
import { startScheduler } from './bot/scheduler';
```
After `startApiServer({ client, prisma, config });`, add:
```ts
  startScheduler({ client, prisma, guildId: config.guildId });
```

- [ ] **Step 3: Verify the whole suite still passes and it compiles**

Run: `npm test`
Expected: all suites pass (existing + the 5 new files).
Run: `npm run build`
Expected: TypeScript compiles to `dist/` with no errors; web SPA builds.

- [ ] **Step 4: Commit**

```bash
git add src/api/server.ts src/index.ts
git commit -m "feat: mount moderation/members/settings routes and start scheduler"
```

---

### Task 8: Frontend — API helpers + nav Layout + routing

**Files:**
- Modify: `web/src/lib/api.ts`
- Create: `web/src/components/Layout.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Add write helpers to `web/src/lib/api.ts`**

Append (keep the existing `api<T>` function):
```ts
function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
}

export const apiPost = <T>(path: string, body?: unknown): Promise<T> => api<T>(path, jsonInit('POST', body));
export const apiPut = <T>(path: string, body?: unknown): Promise<T> => api<T>(path, jsonInit('PUT', body));
export const apiDelete = <T>(path: string): Promise<T> => api<T>(path, { method: 'DELETE' });
```

- [ ] **Step 2: Create `web/src/components/Layout.tsx`**

```tsx
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { apiPost } from '../lib/api';

const links = [
  { to: '/', label: 'نظرة عامة', end: true },
  { to: '/members', label: 'الأعضاء', end: false },
  { to: '/cases', label: 'سجل العقوبات', end: false },
  { to: '/settings', label: 'الإعدادات', end: false },
];

export function Layout() {
  const navigate = useNavigate();
  async function logout() {
    await apiPost('/auth/logout').catch(() => undefined);
    navigate('/login', { replace: true });
  }
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#1a1a1a', color: '#fff' }}>
      <nav style={{ width: 220, background: '#111', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h1 style={{ color: '#f57c00', fontSize: 20, marginBottom: 16 }}>LY-SYSTEM</h1>
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            style={({ isActive }) => ({
              padding: '10px 12px', borderRadius: 8, textDecoration: 'none',
              color: isActive ? '#fff' : '#bbb', background: isActive ? '#f57c00' : 'transparent',
            })}
          >
            {l.label}
          </NavLink>
        ))}
        <button
          onClick={logout}
          style={{ marginTop: 'auto', padding: '10px 12px', borderRadius: 8, border: '1px solid #333', background: 'transparent', color: '#bbb', cursor: 'pointer' }}
        >
          تسجيل الخروج
        </button>
      </nav>
      <main style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `web/src/App.tsx`** to nest pages under the guarded Layout

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useMe } from './auth';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { Members } from './pages/Members';
import { Cases } from './pages/Cases';
import { Settings } from './pages/Settings';

function Guarded({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError } = useMe();
  if (isLoading) return <p style={{ color: '#fff', padding: 24 }}>...</p>;
  if (isError || !data?.authorized) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Guarded><Layout /></Guarded>}>
          <Route path="/" element={<Overview />} />
          <Route path="/members" element={<Members />} />
          <Route path="/cases" element={<Cases />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 4: Commit** (build verification happens in Task 12 after pages exist; Members/Cases/Settings imports resolve there)

```bash
git add web/src/lib/api.ts web/src/components/Layout.tsx web/src/App.tsx
git commit -m "feat: add dashboard nav layout, write helpers and nested routing"
```

---

### Task 9: Frontend — Members page (search + action modal)

**Files:**
- Create: `web/src/pages/Members.tsx`

- [ ] **Step 1: Create `web/src/pages/Members.tsx`**

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiPost } from '../lib/api';

interface Member { id: string; username: string; displayName: string; avatarUrl: string | null; isBot: boolean; }
interface MembersResponse { members: Member[]; total: number; }
type ActionKind = 'ban' | 'kick' | 'mute' | 'warn';
const labels: Record<ActionKind, string> = { ban: 'حظر', kick: 'طرد', mute: 'كتم', warn: 'تحذير' };

export function Members() {
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<Member | null>(null);
  const [kind, setKind] = useState<ActionKind>('warn');
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState(10);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<MembersResponse>({
    queryKey: ['members', search],
    queryFn: () => api(`/members?search=${encodeURIComponent(search)}`),
  });

  const mutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { userId: target!.id, reason };
      if (kind === 'mute') body.seconds = Math.max(1, Math.round(minutes * 60));
      return apiPost(`/moderation/${kind}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases'] });
      setTarget(null);
      setReason('');
    },
  });

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ color: '#f57c00' }}>الأعضاء</h2>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="ابحث بالاسم أو ID..."
        style={{ padding: 10, borderRadius: 8, border: '1px solid #333', background: '#111', color: '#fff', width: 320, marginBottom: 16 }}
      />
      {isLoading ? <p>جاري التحميل...</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {data?.members.map((m) => (
              <tr key={m.id} style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: 8 }}>
                  {m.avatarUrl && <img src={m.avatarUrl} alt="" width={28} height={28} style={{ borderRadius: '50%', verticalAlign: 'middle', marginInlineEnd: 8 }} />}
                  {m.displayName} {m.isBot && <span style={{ color: '#888', fontSize: 12 }}>(bot)</span>}
                </td>
                <td style={{ padding: 8, textAlign: 'end' }}>
                  {(['warn', 'mute', 'kick', 'ban'] as ActionKind[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => { setTarget(m); setKind(k); }}
                      style={{ marginInlineStart: 6, padding: '4px 10px', borderRadius: 6, border: '1px solid #444', background: 'transparent', color: '#ddd', cursor: 'pointer' }}
                    >
                      {labels[k]}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {target && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center' }}>
          <div style={{ background: '#1f1f1f', padding: 24, borderRadius: 12, width: 360 }}>
            <h3 style={{ color: '#f57c00' }}>{labels[kind]} — {target.displayName}</h3>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="السبب..."
              style={{ width: '100%', minHeight: 70, padding: 8, borderRadius: 8, border: '1px solid #333', background: '#111', color: '#fff', marginTop: 8 }}
            />
            {kind === 'mute' && (
              <label style={{ display: 'block', marginTop: 8 }}>
                المدة (دقائق):
                <input type="number" min={1} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}
                  style={{ marginInlineStart: 8, width: 80, padding: 6, borderRadius: 6, border: '1px solid #333', background: '#111', color: '#fff' }} />
              </label>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setTarget(null)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #444', background: 'transparent', color: '#ddd', cursor: 'pointer' }}>إلغاء</button>
              <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#f57c00', color: '#fff', cursor: 'pointer' }}>
                {mutation.isPending ? '...' : 'تأكيد'}
              </button>
            </div>
            {mutation.isError && <p style={{ color: '#e57373', marginTop: 8 }}>فشل تنفيذ الإجراء</p>}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/Members.tsx
git commit -m "feat: add members dashboard page with moderation actions"
```

---

### Task 10: Frontend — Cases page (history + lift)

**Files:**
- Create: `web/src/pages/Cases.tsx`

- [ ] **Step 1: Create `web/src/pages/Cases.tsx`**

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiDelete } from '../lib/api';

interface ModerationCase {
  id: string; targetUserId: string; moderatorId: string; type: string;
  reason: string | null; createdAt: string; expiresAt: string | null; active: boolean;
}
const typeLabels: Record<string, string> = { ban: 'حظر', kick: 'طرد', mute: 'كتم', warn: 'تحذير' };

export function Cases() {
  const [userId, setUserId] = useState('');
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<ModerationCase[]>({
    queryKey: ['cases', userId],
    queryFn: () => api(`/moderation/cases${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`),
  });
  const lift = useMutation({
    mutationFn: (id: string) => apiDelete(`/moderation/cases/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cases'] }),
  });

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ color: '#f57c00' }}>سجل العقوبات</h2>
      <input
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        placeholder="فلترة بـ User ID (اختياري)"
        style={{ padding: 10, borderRadius: 8, border: '1px solid #333', background: '#111', color: '#fff', width: 320, marginBottom: 16 }}
      />
      {isLoading ? <p>جاري التحميل...</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#888', textAlign: 'start' }}>
              <th style={{ padding: 8 }}>النوع</th><th style={{ padding: 8 }}>العضو</th>
              <th style={{ padding: 8 }}>السبب</th><th style={{ padding: 8 }}>التاريخ</th>
              <th style={{ padding: 8 }}>الحالة</th><th style={{ padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {data?.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: 8 }}>{typeLabels[c.type] ?? c.type}</td>
                <td style={{ padding: 8, fontFamily: 'monospace' }}>{c.targetUserId}</td>
                <td style={{ padding: 8 }}>{c.reason ?? '—'}</td>
                <td style={{ padding: 8 }}>{new Date(c.createdAt).toLocaleString('ar')}</td>
                <td style={{ padding: 8, color: c.active ? '#81c784' : '#888' }}>{c.active ? 'فعّالة' : 'مرفوعة'}</td>
                <td style={{ padding: 8 }}>
                  {c.active && (c.type === 'ban' || c.type === 'mute') && (
                    <button onClick={() => lift.mutate(c.id)} disabled={lift.isPending}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #444', background: 'transparent', color: '#ddd', cursor: 'pointer' }}>
                      رفع
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/Cases.tsx
git commit -m "feat: add moderation cases dashboard page"
```

---

### Task 11: Frontend — Settings page

**Files:**
- Create: `web/src/pages/Settings.tsx`

- [ ] **Step 1: Create `web/src/pages/Settings.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, apiPut } from '../lib/api';

interface GuildSettings { guildId: string; logChannelId: string | null; staffRoleIds: string[]; }

export function Settings() {
  const { data } = useQuery<GuildSettings>({ queryKey: ['settings'], queryFn: () => api('/settings') });
  const [logChannelId, setLogChannelId] = useState('');
  const [staffRoles, setStaffRoles] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setLogChannelId(data.logChannelId ?? '');
      setStaffRoles(data.staffRoleIds.join(', '));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      apiPut('/settings', {
        logChannelId: logChannelId.trim() || null,
        staffRoleIds: staffRoles.split(',').map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); },
  });

  return (
    <div style={{ padding: 24, maxWidth: 480 }}>
      <h2 style={{ color: '#f57c00' }}>الإعدادات</h2>
      <label style={{ display: 'block', marginTop: 16 }}>
        قناة السجلّات (Channel ID)
        <input value={logChannelId} onChange={(e) => setLogChannelId(e.target.value)}
          style={{ display: 'block', width: '100%', padding: 10, borderRadius: 8, border: '1px solid #333', background: '#111', color: '#fff', marginTop: 6 }} />
      </label>
      <label style={{ display: 'block', marginTop: 16 }}>
        رتب الإدارة (Role IDs مفصولة بفاصلة)
        <input value={staffRoles} onChange={(e) => setStaffRoles(e.target.value)}
          style={{ display: 'block', width: '100%', padding: 10, borderRadius: 8, border: '1px solid #333', background: '#111', color: '#fff', marginTop: 6 }} />
      </label>
      <button onClick={() => save.mutate()} disabled={save.isPending}
        style={{ marginTop: 20, padding: '10px 20px', borderRadius: 8, border: 'none', background: '#f57c00', color: '#fff', cursor: 'pointer' }}>
        {save.isPending ? '...' : 'حفظ'}
      </button>
      {saved && <span style={{ color: '#81c784', marginInlineStart: 12 }}>تم الحفظ ✓</span>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/Settings.tsx
git commit -m "feat: add settings dashboard page"
```

---

### Task 12: Full verification + manual E2E

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all suites pass (Phase 1 suites + `actions`, `scheduler`, `moderation`, `members`, `settings`, updated `settingsCache`).

- [ ] **Step 2: Full build (includes the SPA with the new pages)**

Run: `npm run build`
Expected: Prisma client generated, `tsc` clean, `web/dist` built with no TypeScript/Vite errors (this is where the new page imports in `App.tsx` are validated).

- [ ] **Step 3: Manual E2E** (needs a real `.env` + the bot in a guild where it has Ban/Kick/Moderate Members permissions)

  - `npm run build && npm start`, then `cd web && npm run dev` and open the Vite URL; log in.
  - **Members:** search a member → click كتم → set 1 minute + reason → تأكيد. Confirm the member is timed out in Discord and a `mute` case appears under سجل العقوبات.
  - **Cases:** confirm the new case is `فعّالة`; click رفع → confirm the timeout is removed in Discord and the case flips to `مرفوعة`.
  - **Expiry:** mute for 1 minute and do NOT lift it; after ≤2 minutes confirm the scheduler removed the timeout and the case is now `مرفوعة`.
  - **Settings:** set a staff Role ID, save, reload → value persists.
  - **Authz:** `curl -i <host>/api/moderation/cases` while logged out → 401.

- [ ] **Step 4: Update the project memory**

Note in memory that Phase 2 (Moderation core) is built: shared actions module, moderation/members/settings routes, expiry scheduler, and Members/Cases/Settings dashboard pages; AutoMod + event-logging remain (follow-up plan).

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-05-24-discord-dashboard-design.md`):
- Ban / kick / mute(timeout) / warn from the browser → Tasks 2, 4, 9 ✓
- Per-member case history + lift (unban/unmute) → Tasks 2 (`liftCase`), 4 (`GET /cases`, `DELETE /cases/:id`), 10 ✓
- Auto-expiry for temporary mutes/bans → Task 3 + Task 7 (started in `index.ts`) ✓
- Shared actions module used by API (and future commands) → Task 2 ✓
- Members listing (search/limit) → Task 5, 9 ✓
- Settings: log channel + staff roles → Tasks 1, 6, 11 ✓
- All mutating routes write a `ModerationCase` **and** a `LogEntry` → `recordCase`/`liftCase` in Task 2 ✓
- Mount behind `requireStaff` → Task 7 ✓
- **Deferred (own follow-up plan, explicitly out of scope here):** AutoMod filter + `AutoModConfig` settings UI; event logging (`guildMemberAdd/Remove`, message delete/edit, role change) + `GET /logs` + Logs page. The `LogEntry` model is already exercised by moderation actions, so the follow-up only adds producers/readers.

**Placeholder scan:** No TBD/TODO. Every code step has complete code; every test step has runnable assertions + an expected result; every manual step has a concrete check.

**Type consistency:**
- `ActionDeps` (`{ guild: GuildLike; prisma: PrismaClient }`) is defined in Task 2 and consumed identically by Task 3 (`liftExpiredCases`) and Task 4 (`resolveAction` returns `ActionDeps`).
- `GuildLike` / `MemberLike` method names (`ban`, `kick`, `unban`, `fetch`, `timeout`) match the fakes in `actions.test.ts`, `scheduler.test.ts`, `moderation.test.ts`.
- `muteUser` takes `seconds` (route validates and passes `secs`); `MuteParams.seconds` matches.
- `updateSettings(guildId, data)` signature (Task 1) matches its call in the settings router (Task 6) and the mock in `settings.test.ts`.
- Frontend `apiPost/apiPut/apiDelete` (Task 8) match their use in Members/Cases/Settings (Tasks 9–11). The `/moderation/${kind}` path matches the router's `/ban|/kick|/mute|/warn`.
- `ModerationCase` fields used by the Cases page (`type`, `targetUserId`, `reason`, `createdAt`, `expiresAt`, `active`) match the Prisma model.

**Notes / Risks:**
- Bot role needs **Ban Members, Kick Members, Moderate Members** permissions in the guild (deploy-time/owner action) — otherwise actions throw and the route returns 502.
- `GuildModeration` + `GuildMembers` intents are already enabled in `src/bot/client.ts`.
- Members listing reads `guild.members.cache`; for large guilds the cache may be partial until a fetch/chunk runs. Acceptable for the core slice; pagination/fetch tuning is a later concern (matches the spec's open item).
- The scheduler uses `setInterval(..., 60s)` with `.unref()` so it never blocks process exit; tests call the pure `liftExpiredCases` directly (no fake timers needed).
