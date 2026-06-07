# Multi-Guild أ2b — Dashboard Multi-Tenant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The dashboard serves staff of ANY guild the shared bot is in (freemium spec §3.2 + 2026-06-04 spec §6.6–6.7): multi-guild OAuth discovery, a guild picker, per-request tenant context, `requireOwner` for global actions, a Prisma tenant guard that fails closed, and the two A1 UI follow-ups.

**Architecture:** Auth callback discovers every mutual guild where the user `isStaff` and stores `{ guildIds, guildId }` in the session. A `tenantContext` middleware (after `requireStaff`) validates the selection and attaches `req.tenant = { guildId }`; a `tenantGuildId(req)` helper is the ONLY way routers read the tenant (throws if missing — fail closed; tests inject `req.tenant` with a one-line middleware). The ~38 routers change mechanically from factory-scope `config.guildId` to per-request `tenantGuildId(req)`. A Prisma client extension asserts `where.guildId` on bulk queries against tenant-scoped models. `requireOwner` (new `OWNER_DISCORD_ID` env) guards `/api/bot` (presence + restart are bot-global). The SPA gains a guild picker + per-guild cache keys, hides the Bot page for non-owners, and fixes the two A1 lock-UX gaps.

**Tech Stack:** Express 5 + express-session, discord.js v14, Prisma v7 (client extension, no schema change), Vitest + supertest, React + react-query.

---

## Pre-existing context an engineer needs

- Run tests: `npx vitest run` (currently 396 tests / 63 files, green). Type check: `npx tsc --noEmit`. Web build: `npm --prefix web run build`.
- Conventions: deps injection (`deps = { client, prisma, config }`), `logger` not `console`, Arabic UI strings, LY orange `#f57c00`, commits straight to `main`, **do NOT stage** `.gitignore`, `no bg.png`, `scratch/`.
- Session shape today (`src/api/session.d.ts`): `user { id, username, avatar, authorized }` + `oauthState`. Auth flow (`src/api/routes/auth.ts`): callback fetches the member of `config.guildId` via the bot client, checks `isStaff(member, settings.staffRoleIds)`, regenerates the session. `/api/auth/me` returns `req.session.user`.
- `requireStaff()` (`src/api/middleware/requireStaff.ts`) only checks `req.session.user.authorized`.
- `requireFeature(key, getGuildId: () => string)` in `src/api/middleware/entitlements.ts` was BUILT for this swap (thunk comment says so). Mounted on `/api/tempvoice` + `/api/creatorannounce` in `server.ts`.
- Router inventory: 41 files in `src/api/routes/`. ~30 bind `const guildId = config.guildId;` at factory scope; ~11 use `config.guildId` inline (analytics, announce(no guildId), automod, bot, entitlements, logs, members, moderation, overview, server, settings). 21+ test files build routers with `config: { guildId: 'g1' }` fakes.
- The SPA: `useMe` in `web/src/auth.tsx` (`Me { id, username, avatar, authorized }` via `/auth/me`), `Guarded` in `App.tsx`, nav + titles in `components/Layout.tsx`, hooks in `web/src/lib/hooks.ts` (react-query, ~40 hooks with static queryKeys).
- A1 follow-ups recorded in the A1 plan: (1) router-wide `requireFeature` 403s GETs → TempVoice/CreatorAnnounce pages stay on skeleton, lock banner never shows; (2) `welcomeCardBg` upload not UI-locked.
- **Deployment requirement (surface to the user at push time): set `OWNER_DISCORD_ID` on Railway** — without it `/api/bot` 403s for everyone (fail closed).

## File structure (locked decisions)

| File | Responsibility |
|------|----------------|
| `src/shared/config.ts` | + optional `ownerDiscordId` (env `OWNER_DISCORD_ID`) |
| `src/api/session.d.ts` | + `guildIds?: string[]`, `guildId?: string` on SessionData |
| `src/api/middleware/tenant.ts` (new) | `tenantContext(config)` middleware + `tenantGuildId(req)` helper (throws when absent) + Express `Request.tenant` type |
| `src/api/middleware/requireOwner.ts` (new) | owner-only gate |
| `src/api/auth-utils.ts` | + `discoverManageableGuilds(client, userId)` |
| `src/api/routes/auth.ts` | callback multi-guild discovery; `/me` returns guilds+selected+isOwner; new `POST /select-guild` |
| `src/api/middleware/entitlements.ts` | `requireFeature` thunk becomes req-aware |
| `src/api/server.ts` | mount `tenantContext` after every `requireStaff()`; `/api/bot` behind `requireOwner` |
| 38 router files | `config.guildId` → `tenantGuildId(req)` per handler (mechanical) |
| `src/db/tenant-guard.ts` (new) | pure `assertTenantScoped(model, op, args)` + model allowlist |
| `src/db/prisma.ts` | wraps the client with the guard extension |
| `web/src/auth.tsx` + `lib/hooks.ts` | Me gains `guilds`/`guildId`/`isOwner`; `useSelectGuild`; query keys include guildId |
| `web/src/components/GuildPicker.tsx` (new) + `Layout.tsx` | picker UI; hide Bot nav for non-owner |
| `web/src/pages/TempVoice.tsx`, `CreatorAnnounce.tsx`, `Welcome.tsx` | A1 follow-ups |

---

### Task 1: Config + session types + `tenantContext` + `requireOwner`

**Files:**
- Modify: `src/shared/config.ts`, `src/api/session.d.ts`
- Create: `src/api/middleware/tenant.ts`, `src/api/middleware/requireOwner.ts`
- Create: `tests/tenant-middleware.test.ts`

- [ ] **Step 1: Write the failing test** — create `tests/tenant-middleware.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { tenantContext, tenantGuildId } from '../src/api/middleware/tenant';
import { requireOwner } from '../src/api/middleware/requireOwner';

function appWith(session: Record<string, unknown>, config = { guildId: 'g-owner', ownerDiscordId: 'u-owner' }) {
  const a = express();
  a.use((req, _res, next) => {
    (req as any).session = session;
    next();
  });
  a.use('/t', tenantContext(config as any), (req, res) => res.json({ guildId: tenantGuildId(req) }));
  a.use('/o', requireOwner(config as any), (_req, res) => res.json({ ok: true }));
  return a;
}

describe('tenantContext', () => {
  it('attaches the selected guild when it is in the session list', async () => {
    const res = await request(appWith({ user: { authorized: true }, guildIds: ['g1', 'g2'], guildId: 'g2' })).get('/t').expect(200);
    expect(res.body.guildId).toBe('g2');
  });

  it('403s a selected guild that is NOT in the session list', async () => {
    await request(appWith({ user: { authorized: true }, guildIds: ['g1'], guildId: 'g-evil' })).get('/t').expect(403);
  });

  it('legacy session (no guildIds) falls back to the owner guild — same access it had pre-A2b', async () => {
    const res = await request(appWith({ user: { authorized: true } })).get('/t').expect(200);
    expect(res.body.guildId).toBe('g-owner');
  });

  it('tenantGuildId throws (500) when tenantContext never ran — fail closed', async () => {
    const a = express();
    a.get('/raw', (req, res) => res.json({ guildId: tenantGuildId(req) }));
    await request(a).get('/raw').expect(500);
  });
});

describe('requireOwner', () => {
  it('passes the configured owner through', async () => {
    await request(appWith({ user: { authorized: true, id: 'u-owner' } })).get('/o').expect(200);
  });
  it('403s any other staff user', async () => {
    await request(appWith({ user: { authorized: true, id: 'u-staff' } })).get('/o').expect(403);
  });
  it('403s everyone when OWNER_DISCORD_ID is unset (fail closed)', async () => {
    await request(appWith({ user: { authorized: true, id: 'u-owner' } }, { guildId: 'g-owner' } as any)).get('/o').expect(403);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/tenant-middleware.test.ts` → FAIL.

- [ ] **Step 3: Implement.**

`src/shared/config.ts` — add to `AppConfig`: `/** Optional: Discord user id allowed on owner-only routes (/api/bot, future fleet/payments). Absent => those routes deny. */ ownerDiscordId?: string;` and in `loadConfig`: `ownerDiscordId: env.OWNER_DISCORD_ID || undefined,` (NOT in REQUIRED).

`src/api/session.d.ts` — extend SessionData:

```ts
    /** Guilds (ids) where this user is staff — computed at login (A2b multi-guild). */
    guildIds?: string[];
    /** The currently selected guild (must be one of guildIds). */
    guildId?: string;
```

`src/api/middleware/tenant.ts`:

```ts
import type { Request, RequestHandler } from 'express';
import type { AppConfig } from '../../shared/config';

export interface Tenant {
  guildId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    tenant?: Tenant;
  }
}

/**
 * Resolves the request's tenant guild from the session. Mount AFTER requireStaff.
 * Legacy sessions from before A2b carry no guildIds — they keep exactly the access
 * they always had: the owner guild.
 */
export function tenantContext(config: Pick<AppConfig, 'guildId'>): RequestHandler {
  return (req, res, next) => {
    const ids = req.session?.guildIds;
    if (!ids || ids.length === 0) {
      req.tenant = { guildId: config.guildId }; // legacy session fallback
      return next();
    }
    const selected = req.session?.guildId ?? ids[0];
    if (!ids.includes(selected)) {
      res.status(403).json({ error: 'guild not accessible' });
      return;
    }
    req.tenant = { guildId: selected };
    next();
  };
}

/** The one way handlers read the tenant. Throws when tenantContext didn't run — fail closed. */
export function tenantGuildId(req: Request): string {
  const guildId = req.tenant?.guildId;
  if (!guildId) throw new Error('tenantContext missing — route mounted without tenant middleware');
  return guildId;
}
```

`src/api/middleware/requireOwner.ts`:

```ts
import type { RequestHandler } from 'express';
import type { AppConfig } from '../../shared/config';

/** Owner-only routes (bot identity/restart, future fleet/payment approval). Fail closed without OWNER_DISCORD_ID. */
export function requireOwner(config: Pick<AppConfig, 'ownerDiscordId'>): RequestHandler {
  return (req, res, next) => {
    const ownerId = config.ownerDiscordId;
    if (ownerId && req.session?.user?.authorized && req.session.user.id === ownerId) return next();
    res.status(403).json({ error: 'owner only' });
  };
}
```

(Express 5: a sync throw in a handler — the tenantGuildId fail-closed test — is converted to a 500 by the framework.)

- [ ] **Step 4: Verify** — `npx vitest run tests/tenant-middleware.test.ts` → PASS (7). `npx tsc --noEmit` clean. Full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/shared/config.ts src/api/session.d.ts src/api/middleware/tenant.ts src/api/middleware/requireOwner.ts tests/tenant-middleware.test.ts
git commit -m "feat(saas): tenantContext + tenantGuildId + requireOwner — per-request tenant resolution (multiguild A2b)"
```

---

### Task 2: Multi-guild auth — discovery, me, select-guild

**Files:**
- Modify: `src/api/auth-utils.ts`, `src/api/routes/auth.ts`
- Modify: `tests/authRoute.test.ts` (extend), `tests/auth-utils.test.ts` (extend)

- [ ] **Step 1: Write the failing tests.** Append to `tests/auth-utils.test.ts`:

```ts
import { discoverManageableGuilds } from '../src/api/auth-utils';

describe('discoverManageableGuilds', () => {
  function fakeClient(guilds: Array<{ id: string; member: any | null; staffRoleIds?: string[] }>) {
    return {
      guilds: {
        cache: new Map(
          guilds.map((g) => [
            g.id,
            {
              id: g.id,
              name: `name-${g.id}`,
              iconURL: () => null,
              members: { fetch: vi.fn(() => (g.member ? Promise.resolve(g.member) : Promise.reject(new Error('unknown member')))) },
            },
          ]),
        ),
      },
    } as any;
  }
  const admin = { permissions: { has: () => true }, roles: { cache: { some: () => false } } };
  const pleb = { permissions: { has: () => false }, roles: { cache: { some: () => false } } };

  it('returns only guilds where the user is staff', async () => {
    const client = fakeClient([
      { id: 'gA', member: admin },
      { id: 'gB', member: pleb },
      { id: 'gC', member: null }, // not a member at all
    ]);
    const getStaffRoleIds = vi.fn().mockResolvedValue([]);
    const result = await discoverManageableGuilds(client, 'u1', getStaffRoleIds);
    expect(result.map((g) => g.id)).toEqual(['gA']);
    expect(result[0].name).toBe('name-gA');
  });

  it('a guild whose settings read fails is skipped (never blocks login)', async () => {
    const client = fakeClient([{ id: 'gA', member: admin }]);
    const getStaffRoleIds = vi.fn().mockRejectedValue(new Error('db down'));
    // admin bypasses staff roles, so a settings failure must not exclude an admin:
    const result = await discoverManageableGuilds(client, 'u1', getStaffRoleIds);
    expect(result.map((g) => g.id)).toEqual(['gA']);
  });
});
```

Append to `tests/authRoute.test.ts` (mirror its existing app/session fakes — READ IT FIRST):

```ts
describe('POST /select-guild', () => {
  it('switches when the guild is in the session list', async () => {
    // build the auth router app with a session middleware injecting
    // { user: { authorized: true }, guildIds: ['g1','g2'], guildId: 'g1' }
    // POST /api/auth/select-guild { guildId: 'g2' } → 200; session.guildId === 'g2'
  });
  it('403s a guild outside the list', async () => {
    // same session; POST { guildId: 'g-evil' } → 403
  });
  it('401s when logged out', async () => {
    // empty session → 401
  });
});

describe('GET /me (multi-guild)', () => {
  it('returns guilds, selected guildId and isOwner', async () => {
    // session { user: { authorized: true, id: 'u-owner' }, guildIds: ['g1'], guildId: 'g1' }
    // config.ownerDiscordId = 'u-owner'; client cache has g1 with name/icon
    // expect body { ...user, isOwner: true, guildId: 'g1', guilds: [{ id: 'g1', name, icon }] }
  });
});
```

(Write these as REAL tests against the actual router — the sketch above lists the required behaviors; mirror the file's existing supertest setup exactly.)

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement.** Append to `src/api/auth-utils.ts`:

```ts
export interface ManageableGuild {
  id: string;
  name: string;
  icon: string | null;
}

/**
 * Every mutual guild where the user is staff. Per-guild failures (uncached member,
 * settings read error) skip that guild's staff-role check but never block login —
 * admins resolve from permissions alone.
 */
export async function discoverManageableGuilds(
  client: { guilds: { cache: Map<string, any> } },
  userId: string,
  getStaffRoleIds: (guildId: string) => Promise<string[]>,
): Promise<ManageableGuild[]> {
  const out: ManageableGuild[] = [];
  for (const guild of client.guilds.cache.values()) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) continue;
    const staffRoleIds = await getStaffRoleIds(guild.id).catch(() => [] as string[]);
    if (!isStaff(member, staffRoleIds)) continue;
    out.push({ id: guild.id, name: guild.name, icon: guild.iconURL?.() ?? null });
  }
  return out;
}
```

In `src/api/routes/auth.ts`:
- The callback's single-guild block (fetch member of `config.guildId` → isStaff check) becomes:

```ts
      const manageable = await discoverManageableGuilds(client, user.id, async (gid) => (await getSettings(gid)).staffRoleIds);
      if (manageable.length === 0) return res.redirect(`${config.dashboardUrl}/login?error=forbidden`);
      const guildIds = manageable.map((g) => g.id);
      const selected = guildIds.includes(config.guildId) ? config.guildId : guildIds[0];
```

and inside the `regenerate` callback, after setting `req.session.user`, add `req.session.guildIds = guildIds; req.session.guildId = selected;`.
- `/me` becomes:

```ts
  router.get('/me', (req, res) => {
    if (!req.session.user?.authorized) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const guildIds = req.session.guildIds ?? [config.guildId];
    const guilds = guildIds.map((id) => {
      const g = client.guilds.cache.get(id);
      return { id, name: g?.name ?? id, icon: g?.iconURL?.() ?? null };
    });
    res.json({
      ...req.session.user,
      isOwner: Boolean(config.ownerDiscordId && req.session.user.id === config.ownerDiscordId),
      guildId: req.session.guildId ?? config.guildId,
      guilds,
    });
  });
```

- New endpoint (before `return router`):

```ts
  router.post('/select-guild', (req, res) => {
    if (!req.session.user?.authorized) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const guildId = String((req.body as { guildId?: unknown })?.guildId ?? '');
    const ids = req.session.guildIds ?? [config.guildId];
    if (!ids.includes(guildId)) {
      res.status(403).json({ error: 'guild not accessible' });
      return;
    }
    req.session.guildId = guildId;
    res.json({ ok: true, guildId });
  });
```

(`express.json()` is applied app-wide in server.ts — verify; if the auth router needs it locally, add `router.use(express.json())`.)

- [ ] **Step 4: Verify** — auth tests + full suite + tsc green/clean.

- [ ] **Step 5: Commit**

```bash
git add src/api/auth-utils.ts src/api/routes/auth.ts tests/auth-utils.test.ts tests/authRoute.test.ts
git commit -m "feat(saas): multi-guild login — staff discovery, guild picker session, select-guild (multiguild A2b)"
```

---

### Task 3: Wire `tenantContext` into server.ts + req-aware `requireFeature` + owner-gate `/api/bot`

**Files:**
- Modify: `src/api/middleware/entitlements.ts` (thunk signature)
- Modify: `src/api/server.ts`
- Modify: `tests/entitlements-api.test.ts` (thunk call sites)
- Create: `tests/server-tenant.test.ts`

- [ ] **Step 1: Change `requireFeature`** in `src/api/middleware/entitlements.ts`:

```ts
export function requireFeature(key: FeatureKey, getGuildId: (req: Parameters<RequestHandler>[0]) => string): RequestHandler {
  return async (req, res, next) => {
    if (hasFeature(await getPlan(getGuildId(req)), key)) return next();
    res.status(403).json({ error: 'premium feature', upgrade: true, feature: key });
  };
}
```

Update `tests/entitlements-api.test.ts` call sites from `requireFeature('music', () => 'g1')` to `requireFeature('music', () => 'g1')` — a zero-arg arrow still satisfies `(req) => string`? NO — TypeScript allows a function with FEWER params, so `() => 'g1'` remains assignable. Verify with tsc; only adjust if it errors.

- [ ] **Step 2: server.ts wiring.** Import `tenantContext` + `requireOwner`. Build `const tenant = tenantContext(deps.config);` once. Then mechanically: every mount of the form `app.use('/api/X', requireStaff(), ...rest)` (EXCEPT `/api/auth` and `/api/health`) becomes `app.use('/api/X', requireStaff(), tenant, ...rest)`. The two requireFeature mounts become `requireFeature('tempVoice', (req) => tenantGuildId(req))` (import tenantGuildId). `/api/bot` becomes `app.use('/api/bot', requireStaff(), requireOwner(deps.config), createBotRouter({ client: deps.client, config: deps.config }))` — note: NO tenant middleware needed (bot routes are global, not per-guild; READ bot.ts — it reads settings for presence via config.guildId; leave bot.ts reading `config.guildId` (the owner guild's settings row stores the global presence) and note this in the commit message).

- [ ] **Step 3: Write `tests/server-tenant.test.ts`** — integration through createApp (mirror `tests/server.test.ts` fakes — READ IT): a session-stubbed app where (a) a staff user with `guildIds:['gA']`, `guildId:'gA'` hits `/api/tags` and the tags router receives tenant gA (assert via the fake prisma's recorded `where.guildId === 'gA'`); (b) the same user with session.guildId='gB' (not in list) gets 403 from ANY tenant route; (c) `/api/bot` 403s for non-owner staff and passes for the owner. Use `createApp` with `sessionStore` injection or a session-stubbing middleware — mirror how existing server tests fake sessions; if none exists, build the app and override `req.session` via an injected middleware BEFORE the routers (read server.ts to see if that's possible — if not, test (a)/(b) directly against `tenantContext` + a tags router app, and (c) against requireOwner + bot router app; the load-bearing assertions are the same).

- [ ] **Step 4: Verify** — new tests + tests/server.test.ts + entitlements-api + full suite + tsc.

- [ ] **Step 5: Commit**

```bash
git add src/api/server.ts src/api/middleware/entitlements.ts tests/server-tenant.test.ts tests/entitlements-api.test.ts
git commit -m "feat(saas): tenantContext on every staff route + owner-gated /api/bot (multiguild A2b)"
```

NOTE: after this task the suite may have failures in router tests IF any router already read req.tenant — they don't yet (that's Tasks 4-5). server.ts adding `tenant` middleware is backward-compatible: routers still read `config.guildId` until refactored, and tenantContext's legacy fallback resolves to `config.guildId` for sessions without guildIds. Full suite MUST be green at this commit.

---

### Task 4: Mechanical router refactor — wave 1 (prisma-only + config-only routers, 24 files)

**Files (modify each + its test):** alerts, analytics, automod, autoresponders, birthdays, boosters, counting, digest, economy, embeds, entitlements, invites, leveling, logs, notes, raid, reminders, report, rolepanels, scheduled, settings, shop, starboard, statcounters, sticky, tags (their routers in `src/api/routes/` — 26 listed; do digest/embeds/rolepanels/sticky here too even though they hold a client — their guildId usage is identical).

The mechanical pattern per router file:
1. `import { tenantGuildId } from '../middleware/tenant';`
2. Factory-scope `const guildId = config.guildId;` → DELETE; in EACH handler add `const guildId = tenantGuildId(req);` as the first line (handlers that don't use guildId stay untouched).
3. Inline `config.guildId` / `deps.config.guildId` reads → `tenantGuildId(req)` (bind once per handler if used multiple times).
4. If `config` becomes unused in the file, remove it from the destructure/deps type ONLY if tsc complains; otherwise leave deps shapes untouched (minimal diff).
5. The router's test file gains ONE line in its app builder, BEFORE the router mount: `a.use((req, _res, next) => { (req as any).tenant = { guildId: 'g1' }; next(); });` (match the test's existing guildId fake value — usually 'g1').

- [ ] **Step 1:** Apply to all wave-1 routers + tests. Work file by file; after each 5 files run the affected tests.
- [ ] **Step 2:** `npx vitest run` FULL — every router test green (the added middleware line is the only test change; assertions untouched). `npx tsc --noEmit` clean.
- [ ] **Step 3: Commit**

```bash
git add src/api/routes tests
git commit -m "refactor(saas): wave-1 routers read the tenant per-request via tenantGuildId (multiguild A2b)"
```

(Verify with `git status` that ONLY router/test files are staged.)

---

### Task 5: Mechanical router refactor — wave 2 (client-using + complex routers)

**Files:** announce (no guildId — verify + skip if so), applications, creatorannounce, giveaways, members, moderation, overview, server, staffreport, suggestions, tempvoice, tickets, rules (+ their tests, same one-line middleware).

Same pattern as Task 4 PLUS the client-lookup change: `client.guilds.cache.get(config.guildId)` → `client.guilds.cache.get(tenantGuildId(req))` (per handler). For `moderation.ts`'s `resolveAction` closure that captures `deps.config.guildId`: make it take `guildId` as a parameter from each handler. For `server.ts`(route)'s `guild()` helper: same — parameterize.

- [ ] **Step 1:** Apply to all wave-2 routers + tests.
- [ ] **Step 2:** FULL suite + tsc green/clean. Also re-run `tests/premium-gates-api.test.ts` + `tests/plan-limits-api.test.ts` — they build settings/leveling/tags/giveaways routers and MUST get the tenant middleware line too (free/premium semantics unchanged).
- [ ] **Step 3:** grep audit: `grep -rn "config.guildId" src/api/routes/` → ONLY auth.ts (its own flow) and bot.ts (global presence — deliberate) remain. `grep -rn "config.guildId" src/api/server.ts` → only the tenantContext construction + auth/bot deps.
- [ ] **Step 4: Commit**

```bash
git add src/api/routes tests
git commit -m "refactor(saas): wave-2 routers (client lookups) read the tenant per-request (multiguild A2b)"
```

---

### Task 6: Prisma tenant guard — fail closed on missing guildId

**Files:**
- Create: `src/db/tenant-guard.ts`
- Modify: `src/db/prisma.ts`
- Create: `tests/tenant-guard.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/tenant-guard.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { assertTenantScoped, TENANT_EXEMPT_MODELS } from '../src/db/tenant-guard';

describe('assertTenantScoped', () => {
  it('passes bulk reads that carry where.guildId', () => {
    expect(() => assertTenantScoped('Tag', 'findMany', { where: { guildId: 'g1' } })).not.toThrow();
    expect(() => assertTenantScoped('DailyStat', 'findMany', { where: { guildId_date: { guildId: 'g1', date: 'x' } } })).not.toThrow();
  });

  it('throws on a bulk read missing the tenant filter', () => {
    expect(() => assertTenantScoped('Tag', 'findMany', { where: {} })).toThrow(/guildId/);
    expect(() => assertTenantScoped('Tag', 'deleteMany', {})).toThrow(/guildId/);
    expect(() => assertTenantScoped('MemberLevel', 'count', { where: { userId: 'u1' } })).toThrow(/guildId/);
  });

  it('exempts non-tenant models and unique single-row ops', () => {
    expect(() => assertTenantScoped('Subscription', 'findMany', {})).not.toThrow(); // registry model — exempt
    expect(() => assertTenantScoped('Tag', 'findUnique', { where: { id: 1 } })).not.toThrow(); // PK lookup
    expect(() => assertTenantScoped('Tag', 'update', { where: { id: 1 } })).not.toThrow();
  });

  it('exempt list is the deliberate registry/global set', () => {
    expect([...TENANT_EXEMPT_MODELS].sort()).toEqual(['GuildSettings', 'Subscription'].sort());
  });
});
```

- [ ] **Step 2:** FAIL, then implement `src/db/tenant-guard.ts`:

```ts
// Defense-in-depth (2026-06-04 spec §6.7): a tenant-scoped bulk query that forgets
// its guildId filter fails CLOSED at the client layer instead of leaking another
// guild's rows. Unique-key single-row ops are exempt (handlers fetch by PK obtained
// from an already-scoped read); registry/global models are exempt by name.

const BULK_OPS = new Set(['findMany', 'findFirst', 'count', 'updateMany', 'deleteMany', 'groupBy', 'aggregate']);

/** Models that are themselves the tenant registry or global — never tenant-filtered. */
export const TENANT_EXEMPT_MODELS: ReadonlySet<string> = new Set(['Subscription', 'GuildSettings']);

function hasGuildFilter(where: Record<string, unknown> | undefined): boolean {
  if (!where) return false;
  if (typeof where.guildId === 'string') return true;
  const compound = where.guildId_date as { guildId?: unknown } | undefined;
  if (compound && typeof compound.guildId === 'string') return true;
  // AND-composed filters still count if any branch carries the guildId.
  const and = where.AND as Array<Record<string, unknown>> | Record<string, unknown> | undefined;
  if (Array.isArray(and)) return and.some((w) => hasGuildFilter(w));
  if (and) return hasGuildFilter(and);
  return false;
}

export function assertTenantScoped(model: string, operation: string, args: { where?: Record<string, unknown> } | undefined): void {
  if (!BULK_OPS.has(operation)) return;
  if (TENANT_EXEMPT_MODELS.has(model)) return;
  if (hasGuildFilter(args?.where)) return;
  throw new Error(`tenant guard: ${model}.${operation} without a guildId filter (fail closed)`);
}
```

- [ ] **Step 3: Wire into `src/db/prisma.ts`** (READ IT FIRST — it exports a singleton):

```ts
import { assertTenantScoped } from './tenant-guard';

const base = new PrismaClient(/* existing options */);
export const prisma = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        assertTenantScoped(model, operation, args as { where?: Record<string, unknown> });
        return query(args);
      },
    },
  },
}) as unknown as PrismaClient;
```

(The `as unknown as PrismaClient` keeps the exported type stable for the ~40 importing modules — the extension adds no API surface we use. If Prisma v7's `$extends` typing differs, adapt; the REQUIREMENT is: every bulk op on a non-exempt model passes through assertTenantScoped.)

IMPORTANT: models WITHOUT a guildId column at all (check schema: e.g. `Customer` later — none today besides the exempt two? VERIFY by listing schema models) must be added to the exempt set deliberately, with a comment. Audit `prisma/schema.prisma` while implementing: any model lacking a `guildId` field gets exempted by NAME (today: only `Subscription` + `GuildSettings` are keyed BY guildId as PK; everything else carries guildId — verify and adjust the exempt set + its test).

- [ ] **Step 4: Suite-wide audit.** `npx vitest run` — any failure now is a REAL unscoped query the guard caught (tests mock `src/db/prisma` so most suites bypass the guard; the ones that hit it are integration-style). For each: fix the query to carry guildId (preferred) or add a deliberate, commented exemption. Document every exemption in the commit message. `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/db/tenant-guard.ts src/db/prisma.ts tests/tenant-guard.test.ts
git commit -m "feat(saas): Prisma tenant guard — unscoped bulk queries fail closed (multiguild A2b)"
```

---

### Task 7: SPA — guild picker + per-guild query keys + owner-only Bot page

**Files:**
- Modify: `web/src/auth.tsx` (Me type + hooks)
- Create: `web/src/components/GuildPicker.tsx`
- Modify: `web/src/components/Layout.tsx`
- Modify: `web/src/lib/hooks.ts` (no per-hook change needed — see invalidation strategy)

No vitest (web has no runner) — verification is `npm --prefix web run build` + careful review.

- [ ] **Step 1: Me type + select hook** in `web/src/auth.tsx`:

```tsx
export interface MeGuild {
  id: string;
  name: string;
  icon: string | null;
}

export interface Me {
  id: string;
  username: string;
  avatar: string | null;
  authorized: boolean;
  isOwner?: boolean;
  guildId?: string;
  guilds?: MeGuild[];
}
```

and a `useSelectGuild` mutation beside `useMe` (mirror the file's react-query idiom):

```tsx
export function useSelectGuild() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (guildId: string) => apiPost<{ ok: boolean }>('/auth/select-guild', { guildId }),
    onSuccess: () => qc.clear(), // every cached query belongs to the previous guild
  });
}
```

(Use the file's actual api helpers — check how auth.tsx imports `api`; `qc.clear()` wipes ALL cached data so every page refetches under the new tenant — simpler and safer than per-key invalidation.)

- [ ] **Step 2: `web/src/components/GuildPicker.tsx`** — RTL select shown only when >1 guild:

```tsx
import { useMe, useSelectGuild } from '../auth';

export function GuildPicker() {
  const { data: me } = useMe();
  const select = useSelectGuild();
  if (!me?.guilds || me.guilds.length <= 1) return null;
  return (
    <select
      value={me.guildId}
      disabled={select.isPending}
      onChange={(e) => select.mutate(e.target.value)}
      style={{
        width: '100%',
        background: 'rgba(255,255,255,0.04)',
        color: 'inherit',
        border: '1px solid rgba(245,124,0,0.4)',
        borderRadius: 10,
        padding: '8px 10px',
        marginBottom: 12,
        fontFamily: 'inherit',
      }}
      aria-label="اختيار السيرفر"
    >
      {me.guilds.map((g) => (
        <option key={g.id} value={g.id} style={{ color: '#000' }}>
          {g.name}
        </option>
      ))}
    </select>
  );
}
```

(Match Layout's styling idiom — if the sidebar uses CSS classes, mirror them instead of inline styles.)

- [ ] **Step 3: Layout integration.** In `web/src/components/Layout.tsx`: render `<GuildPicker />` at the top of the sidebar (above the nav sections); hide the Bot nav item when `!me?.isOwner` (Layout already calls `useMe` or can — read the file; the nav item for `/dashboard/bot` gets filtered out for non-owners).

- [ ] **Step 4: Verify** — `npm --prefix web run build` clean; backend suite untouched.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat(saas): dashboard guild picker + owner-only bot page (multiguild A2b)"
```

---

### Task 8: SPA — A1 follow-ups (403-GET lock pages + welcomeCustomBg lock)

**Files:**
- Modify: `web/src/lib/api.ts` (ONLY if the error doesn't already carry status — read first)
- Modify: `web/src/pages/TempVoice.tsx`, `web/src/pages/CreatorAnnounce.tsx`, `web/src/pages/Welcome.tsx`

- [ ] **Step 1: 403-GET lock rendering.** READ `web/src/lib/api.ts` — determine how a non-OK response surfaces (thrown Error with status? message only?). If the status is not programmatically available, make the api helper attach it (`(err as any).status = res.status`) WITHOUT changing the message contract. Then in `TempVoice.tsx` + `CreatorAnnounce.tsx`: the page currently early-returns a skeleton while `data` is undefined. Change to: when the query `error` carries status 403, render the existing `<PremiumLock feature="tempVoice|creatorAlerts" ent={ent ?? null} />` (already imported on these pages) INSTEAD of the skeleton — the rest of the page hidden. The banner must show even though `useEntitlements` says the feature is false — that's exactly the locked case.

- [ ] **Step 2: welcomeCustomBg lock.** In `Welcome.tsx` (it already has `ent` + `stylesLocked`): add `const bgLocked = ent?.features.welcomeCustomBg === false;` — when bgLocked: disable the BG upload control (same disabled+lock-icon treatment as the style cards), and in `submit()` coerce `welcomeCardBg: bgLocked ? null : d.welcomeCardBg` (mirroring the welcomeCardStyle coercion line above it) so a stale premium BG can't 403 every save after a downgrade.

- [ ] **Step 3: Verify** — `npm --prefix web run build` clean. Mark the two follow-up checkboxes DONE in `docs/superpowers/plans/2026-06-05-freemium-a1-plangate.md` (edit the `- [ ]` to `- [x]`).

- [ ] **Step 4: Commit**

```bash
git add web/src docs/superpowers/plans/2026-06-05-freemium-a1-plangate.md
git commit -m "fix(saas): locked pages render the premium banner on 403 + BG upload lock (multiguild A2b, closes A1 follow-ups)"
```

---

### Task 9: Final verification (A2a + A2b together)

- [ ] **Full suite:** `npx vitest run` — green. **Type check + builds:** `npm run build` clean.
- [ ] **Owner-experience check:** owner logs in → discovery finds the owner guild (admin) → session `{ guildIds: [ownerGuild], guildId: ownerGuild }` → tenantContext resolves the same guild every router used before → ZERO behavioral change. Legacy sessions fall back to the owner guild. `/api/bot` needs OWNER_DISCORD_ID — **deploy requirement**.
- [ ] **Cross-tenant isolation:** the server-tenant test proves session.guildId outside guildIds → 403; the Prisma guard proves unscoped bulk queries throw.
- [ ] **Diff review:** `git diff fe3baa8..HEAD --stat` — no schema changes; no unrelated files.
- [ ] **Surface to the user before push:** OWNER_DISCORD_ID must be set on Railway (else /api/bot 403s for everyone including them); recommend they re-login after deploy (legacy session works but the picker appears after re-login).

## Out of scope (later)

- Stage ب: payments/receipts/grace/upgrade page; `left`-row 30-day cleanup.
- Stage د: TenantRegistry/multi-client/vault (req.tenant.client stays the shared client until then).
- Per-guild member-cache warming for the dashboard member list of non-owner guilds (lazy fetch already works; eager warm is an optimization).
