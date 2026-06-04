# SaaS Phase 0 — Fleet-Safety Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing single-tenant bot fleet-safe (per `docs/superpowers/specs/2026-06-04-ly-system-saas-design.md` §6.2/§6.3/§6.5 Phase 0) so the Phase-1 multi-client engine can never cross tenant boundaries or crash the shared process.

**Architecture:** Five surgical fixes, no new features: (1) scope `reconcileTempVoice` to one guild + guard its deletes, (2) scope `flushStats`/`bump` to allowlisted tenant guilds, (3) add the missing `guildId` filter to `liftExpiredCases`, (4) boot survives a failed Discord login (API still starts, login retries in background) + per-client `error`/`shardError` handlers, (5) logger redacts Discord-token-shaped secrets. Plus the spec's key test: a tick-wide invariant test asserting **no bulk query in a scheduler tick runs without a tenant `guildId` filter**.

**Tech Stack:** TypeScript (CommonJS), discord.js v14, Prisma v7, Vitest. No schema changes, no new deps, no web/ changes.

**Behavior change to be aware of:** `tests/boot.test.ts` currently asserts a login failure **crashes** boot ("propagates a login failure"). Phase 0 deliberately flips this per spec §6.2 ("one bad token doesn't crash boot"): login failure now logs, the API still starts, and login retries every 60s in the background (so a transient network failure at boot still recovers — previously Railway's crash-restart did that job).

---

## Pre-existing context an engineer needs

- **Build gotcha:** the bot loader only discovers compiled `.js` — but for these tasks `npx vitest run` + `npx tsc --noEmit` is enough until the final full build.
- **Run tests:** `npx vitest run tests/<name>.test.ts` for one file, `npx vitest run` for all (currently ~44 files, all green).
- **Conventions:** deps injection (`deps = { client, prisma, guildId }`), `logger` from `src/shared/logger.ts` (never `console`), commits straight to `main` (push only with the user's explicit approval at the end).
- `src/db/*.ts` helpers (`community.ts`, `settingsCache.ts`, …) import the **prisma singleton** from `src/db/prisma.ts` directly — the invariant test (Task 6) must `vi.mock` that module to capture their queries.

---

### Task 1: Logger redaction (`src/shared/logger.ts`)

Spec §6.3: the logger gains a redaction layer scrubbing Discord-token-shaped strings and `Bot `/`Bearer ` credentials before output.

**Files:**
- Modify: `src/shared/logger.ts`
- Create: `tests/logger.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/logger.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { redact, logger } from '../src/shared/logger';

const FAKE_TOKEN = 'xxxxxxxxxxxxxxxxxxxxxxxxxx.yyyyyy.zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';

describe('redact', () => {
  it('scrubs Discord-bot-token-shaped triplets', () => {
    expect(redact(`login failed for ${FAKE_TOKEN} (401)`)).toBe('login failed for [REDACTED] (401)');
  });

  it('scrubs JWT-shaped triplets', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c';
    expect(redact(`got ${jwt}`)).toBe('got [REDACTED]');
  });

  it('scrubs long credentials after Bot/Bearer prefixes', () => {
    expect(redact('Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456')).toBe('Authorization: Bearer [REDACTED]');
    expect(redact(`header "Bot ${FAKE_TOKEN}"`)).toContain('[REDACTED]');
    expect(redact(`header "Bot ${FAKE_TOKEN}"`)).not.toContain('yyyyyy');
  });

  it('leaves normal messages untouched (incl. short words after "Bot")', () => {
    const msg = 'Bot is online as: LY-SYSTEM#8787 — v1.2.3 ready';
    expect(redact(msg)).toBe(msg);
  });
});

describe('logger output redaction', () => {
  it('redacts token-shaped strings in logger.error output', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    logger.error(`bad token ${FAKE_TOKEN}`);
    expect(spy.mock.calls[0][0]).toContain('[REDACTED]');
    expect(spy.mock.calls[0][0]).not.toContain('yyyyyy');
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/logger.test.ts`
Expected: FAIL — `redact` is not exported.

- [ ] **Step 3: Implement redaction**

Replace `src/shared/logger.ts` with:

```ts
enum LogLevel {
  INFO = '📘 INFO',
  SUCCESS = '✅ SUCCESS',
  WARNING = '⚠️ WARNING',
  ERROR = '❌ ERROR',
}

// Fleet-safety (SaaS Phase 0, spec §6.3): scrub anything token-shaped before it
// reaches stdout. Defense in depth — token plaintext must never be logged.
const TOKEN_TRIPLET = /[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}/g; // Discord token / JWT
const AUTH_PREFIX = /\b(Bot|Bearer)\s+[A-Za-z0-9_\-.=+/]{20,}/g; // auth-header style

export function redact(message: string): string {
  return message.replace(TOKEN_TRIPLET, '[REDACTED]').replace(AUTH_PREFIX, '$1 [REDACTED]');
}

function log(level: LogLevel, message: string): void {
  const timestamp = new Date().toLocaleString('en-US');
  console.log(`[${timestamp}] ${level}: ${redact(message)}`);
}

export const logger = {
  info: (msg: string) => log(LogLevel.INFO, msg),
  success: (msg: string) => log(LogLevel.SUCCESS, msg),
  warning: (msg: string) => log(LogLevel.WARNING, msg),
  error: (msg: string) => log(LogLevel.ERROR, msg),
};
```

Note the minimum lengths: `{20,}` segments mean `Bot is online as: …` and semver strings never match.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/logger.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/logger.ts tests/logger.test.ts
git commit -m "feat(fleet): logger redacts Discord-token-shaped secrets (SaaS Phase 0)"
```

---

### Task 2: Stats — guild allowlist + per-guild flush (`src/bot/stats.ts`)

Spec §6.5: `flushStats` must be scoped strictly to the tenant guild, with a startup guard refusing to operate on any other guild. Today `bump()` buffers stats for **any** guild the bot is in (`src/bot/events/messageCreate.ts:21` has no guild filter) and `flushStats` persists them all; the scheduler feeds it `client.guilds.cache` member counts for every guild.

Design: an allowlist gate at `bump()` (the "startup guard") + `flushStats(prisma, guildId, memberCount?)` that flushes **only** that guild's buckets and leaves other allowlisted tenants' buckets in the buffer (so in Phase 1 each tenant's tick flushes its own).

**Files:**
- Modify: `src/bot/stats.ts`
- Modify: `src/index.ts` (register the allowlist at startup)
- Modify: `tests/stats.test.ts`
- (The scheduler call site is updated in Task 5.)

- [ ] **Step 1: Update the test file (failing tests first)**

Replace `tests/stats.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bump, flushStats, allowStatsGuild, _resetStats, _peekStats } from '../src/bot/stats';

beforeEach(() => {
  _resetStats();
  allowStatsGuild('g1');
});

describe('stats aggregator', () => {
  it('accumulates per-guild counters in memory', () => {
    bump('g1', 'messages');
    bump('g1', 'messages');
    bump('g1', 'joins');
    expect(_peekStats().size).toBe(1);
  });

  it('ignores bumps for guilds not on the allowlist (fleet-safety guard)', () => {
    bump('g-foreign', 'messages');
    expect(_peekStats().size).toBe(0);
  });

  it('flushes increments to DailyStat and clears the buffer', async () => {
    bump('g1', 'messages', 2);
    bump('g1', 'joins');
    const upsert = vi.fn().mockResolvedValue({});
    const n = await flushStats({ dailyStat: { upsert } } as any, 'g1', 50);

    expect(n).toBe(1);
    const arg = upsert.mock.calls[0][0];
    expect(arg.update.messages).toEqual({ increment: 2 });
    expect(arg.update.joins).toEqual({ increment: 1 });
    expect(arg.update.memberCount).toBe(50);
    expect(arg.create).toMatchObject({ guildId: 'g1', messages: 2, joins: 1, memberCount: 50 });
    expect(_peekStats().size).toBe(0);
  });

  it('flushes ONLY the requested guild and leaves other tenants buffered', async () => {
    allowStatsGuild('g2');
    bump('g1', 'messages');
    bump('g2', 'messages');
    const upsert = vi.fn().mockResolvedValue({});
    const n = await flushStats({ dailyStat: { upsert } } as any, 'g1');

    expect(n).toBe(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].create.guildId).toBe('g1');
    // g2's bucket is untouched — its own tenant tick flushes it.
    expect(_peekStats().size).toBe(1);
    expect([..._peekStats().keys()][0].startsWith('g2|')).toBe(true);
  });

  it('is a no-op flush when nothing is buffered', async () => {
    const upsert = vi.fn();
    expect(await flushStats({ dailyStat: { upsert } } as any, 'g1')).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('re-queues counters when the DB upsert fails (no data loss)', async () => {
    bump('g1', 'messages', 3);
    const upsert = vi.fn().mockRejectedValueOnce(new Error('db down'));
    const persisted = await flushStats({ dailyStat: { upsert } } as any, 'g1');
    expect(persisted).toBe(0); // nothing persisted
    // counts merged back into the buffer for the next flush
    expect(_peekStats().get('g1|' + new Date().toISOString().slice(0, 10))?.messages).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stats.test.ts`
Expected: FAIL — `allowStatsGuild` is not exported; `flushStats` signature mismatch.

- [ ] **Step 3: Implement the allowlist + scoped flush**

In `src/bot/stats.ts`, replace everything from the `buckets` declaration through `_resetStats` (keep `StatField`, `Bucket`, `keyOf`, `_peekStats` as-is):

```ts
// In-memory per-guild/per-day counters. Events bump these cheaply; the scheduler
// flushes them to DailyStat periodically so we never write a DB row per message.
const buckets = new Map<string, Bucket>();

// Fleet-safety guard (SaaS Phase 0, spec §6.5): events fire for ANY guild a bot
// was invited to — only configured tenant guilds may ever be counted.
const allowedGuilds = new Set<string>();

/** Register a guild whose activity may be counted (called once per tenant at startup). */
export function allowStatsGuild(guildId: string): void {
  allowedGuilds.add(guildId);
}

function keyOf(guildId: string, date = utcDateKey()): string {
  return `${guildId}|${date}`;
}

export function bump(guildId: string, field: StatField, by = 1): void {
  if (!allowedGuilds.has(guildId)) return;
  const key = keyOf(guildId);
  let b = buckets.get(key);
  if (!b) {
    b = { messages: 0, joins: 0, leaves: 0, modActions: 0 };
    buckets.set(key, b);
  }
  b[field] += by;
}

/**
 * Persist and clear pending counters for ONE guild (other tenants' buckets stay
 * buffered for their own tick). `memberCount` records a fresh snapshot alongside
 * the increments.
 */
export async function flushStats(
  prisma: PrismaClient,
  guildId: string,
  memberCount?: number,
): Promise<number> {
  const prefix = `${guildId}|`;
  const entries = [...buckets.entries()].filter(([key]) => key.startsWith(prefix));
  let persisted = 0;
  for (const [key, b] of entries) {
    buckets.delete(key);
    const date = key.slice(prefix.length);
    try {
      await prisma.dailyStat.upsert({
        where: { guildId_date: { guildId, date } },
        create: { guildId, date, ...b, memberCount: memberCount ?? 0 },
        update: {
          messages: { increment: b.messages },
          joins: { increment: b.joins },
          leaves: { increment: b.leaves },
          modActions: { increment: b.modActions },
          ...(memberCount != null ? { memberCount } : {}),
        },
      });
      persisted++;
    } catch {
      // Persist failed (e.g. transient DB error): merge counts back so the next
      // flush retries them instead of silently dropping the day's activity.
      const cur = buckets.get(key);
      if (cur) {
        cur.messages += b.messages;
        cur.joins += b.joins;
        cur.leaves += b.leaves;
        cur.modActions += b.modActions;
      } else {
        buckets.set(key, { ...b });
      }
    }
  }
  return persisted;
}

/** Test helpers. */
export function _resetStats(): void {
  buckets.clear();
  allowedGuilds.clear();
}
```

- [ ] **Step 4: Register the tenant guild at startup**

In `src/index.ts`, add the import and call (after `loadConfig()`):

```ts
import { allowStatsGuild } from './bot/stats';
```

```ts
  const config = loadConfig();
  allowStatsGuild(config.guildId); // fleet-safety: only the tenant guild is counted
```

- [ ] **Step 5: Run tests — stats file passes, scheduler call site now broken**

Run: `npx vitest run tests/stats.test.ts`
Expected: PASS (6 tests).

Run: `npx tsc --noEmit`
Expected: ONE error in `src/bot/scheduler.ts` (old `flushStats(deps.prisma, memberCounts)` call). That's fixed in Task 5 — to keep this commit green, apply the minimal call-site fix now in `src/bot/scheduler.ts` (inside `tick`, replacing the `memberCounts` block at lines 73-76):

```ts
    // Flush buffered activity counters — strictly the tenant guild (fleet-safety).
    const tenantGuild = deps.client.guilds.cache.get(deps.guildId);
    await flushStats(deps.prisma, deps.guildId, tenantGuild?.memberCount).catch((err) =>
      logger.error(`Stats flush error: ${err}`),
    );
```

Run: `npx tsc --noEmit` → clean. Run: `npx vitest run` → all green.

- [ ] **Step 6: Commit**

```bash
git add src/bot/stats.ts src/bot/scheduler.ts src/index.ts tests/stats.test.ts
git commit -m "feat(fleet): stats allowlist + per-guild flush, scheduler feeds only tenant guild (SaaS Phase 0)"
```

---

### Task 3: `reconcileTempVoice` scoped to one guild (`src/bot/tempvoice.ts:136-151`)

The Phase-0 headline bug: `reconcileTempVoice` does `findMany()` with **no `where`** and deletes any row whose guild isn't in this client's cache — in a fleet, client A would delete client B's live rooms. Fix: scope the query to `guildId`, and only treat a channel as "truly gone" when the **guild itself is cached** (otherwise we can't know — skip).

**Files:**
- Modify: `src/bot/tempvoice.ts:136-151` (`reconcileTempVoice`)
- Modify: `src/bot/events/ready.ts:40-42` (call site gains `guildId`)
- Modify: `tests/tempvoice.test.ts` (append a new describe block)

- [ ] **Step 1: Write the failing tests**

Append to `tests/tempvoice.test.ts` (it already imports `vi`, `describe`, `it`, `expect` — extend the import from `../src/bot/tempvoice` with `reconcileTempVoice` if not present):

```ts
function reconcileClient(guilds: Record<string, unknown>) {
  return { guilds: { cache: new Map(Object.entries(guilds)) } } as any;
}
function reconcilePrisma(rows: unknown[]) {
  return {
    tempVoiceChannel: {
      findMany: vi.fn().mockResolvedValue(rows),
      delete: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

describe('reconcileTempVoice (fleet-safety)', () => {
  it('queries only the given guild', async () => {
    const prisma = reconcilePrisma([]);
    await reconcileTempVoice(reconcileClient({}), prisma, 'g1');
    expect(prisma.tempVoiceChannel.findMany).toHaveBeenCalledWith({ where: { guildId: 'g1' } });
  });

  it('does NOT delete rows when the guild is not in this client cache (cannot verify)', async () => {
    const prisma = reconcilePrisma([{ channelId: 'c1', guildId: 'g1', ownerId: 'u1' }]);
    await reconcileTempVoice(reconcileClient({}), prisma, 'g1');
    expect(prisma.tempVoiceChannel.delete).not.toHaveBeenCalled();
  });

  it('skips rows of another guild even if the query returned them (defense in depth)', async () => {
    const prisma = reconcilePrisma([{ channelId: 'cB', guildId: 'gB', ownerId: 'u1' }]);
    const client = reconcileClient({ gB: { channels: { cache: new Map() } } });
    await reconcileTempVoice(client, prisma, 'g1');
    expect(prisma.tempVoiceChannel.delete).not.toHaveBeenCalled();
  });

  it('deletes the row when the guild is cached but the channel is gone', async () => {
    const prisma = reconcilePrisma([{ channelId: 'c1', guildId: 'g1', ownerId: 'u1' }]);
    const client = reconcileClient({ g1: { channels: { cache: new Map() } } });
    await reconcileTempVoice(client, prisma, 'g1');
    expect(prisma.tempVoiceChannel.delete).toHaveBeenCalledWith({ where: { channelId: 'c1' } });
  });

  it('deletes channel + row when the temp channel is empty', async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const channel = { members: new Map(), delete: del };
    const prisma = reconcilePrisma([{ channelId: 'c1', guildId: 'g1', ownerId: 'u1' }]);
    const client = reconcileClient({ g1: { channels: { cache: new Map([['c1', channel]]) } } });
    await reconcileTempVoice(client, prisma, 'g1');
    expect(del).toHaveBeenCalled();
    expect(prisma.tempVoiceChannel.delete).toHaveBeenCalledWith({ where: { channelId: 'c1' } });
  });

  it('keeps occupied channels and their rows', async () => {
    const channel = { members: new Map([['u9', {}]]), delete: vi.fn() };
    const prisma = reconcilePrisma([{ channelId: 'c1', guildId: 'g1', ownerId: 'u1' }]);
    const client = reconcileClient({ g1: { channels: { cache: new Map([['c1', channel]]) } } });
    await reconcileTempVoice(client, prisma, 'g1');
    expect(channel.delete).not.toHaveBeenCalled();
    expect(prisma.tempVoiceChannel.delete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tempvoice.test.ts`
Expected: FAIL — `reconcileTempVoice` takes 2 args / queries without `where` / deletes when guild missing.

- [ ] **Step 3: Implement the scoped reconcile**

Replace `reconcileTempVoice` in `src/bot/tempvoice.ts` with:

```ts
/**
 * Prune orphaned/empty temp channels at boot (in-memory state is lost across restarts).
 * Fleet-safety (SaaS Phase 0): strictly scoped to ONE guild — this client may not even
 * see other tenants' guilds, and must never touch their rows.
 */
export async function reconcileTempVoice(client: Client, prisma: PrismaClient, guildId: string): Promise<void> {
  const rows = await prisma.tempVoiceChannel.findMany({ where: { guildId } }).catch(() => [] as TempVoiceChannel[]);
  let pruned = 0;
  for (const row of rows) {
    // Defense in depth: never act on another guild's row even if the query was wrong.
    if (row.guildId !== guildId) continue;
    const guild = client.guilds.cache.get(row.guildId);
    // Guild not visible to this client (cold cache / kicked) — we cannot verify the
    // channel is truly gone, so leave the row alone.
    if (!guild) continue;
    const channel = guild.channels.cache.get(row.channelId) as VoiceChannel | undefined;
    if (!channel) {
      await prisma.tempVoiceChannel.delete({ where: { channelId: row.channelId } }).catch(() => undefined);
      pruned++;
      continue;
    }
    if (channel.members.size === 0) {
      await channel.delete('Temp voice reconcile — empty at boot').catch(() => undefined);
      await prisma.tempVoiceChannel.delete({ where: { channelId: row.channelId } }).catch(() => undefined);
      pruned++;
    }
  }
  if (rows.length) logger.info(`tempvoice: reconciled ${rows.length} row(s), pruned ${pruned} at boot`);
}
```

- [ ] **Step 4: Update the call site**

In `src/bot/events/ready.ts`, replace lines 40-42 with (note it now needs `guildId`, which is already in scope):

```ts
    // Prune orphaned temp voice rooms (created last session, never cleaned because the bot
    // restarted before the channels emptied). Scoped to the configured guild (fleet-safety).
    if (guildId) {
      await reconcileTempVoice(client, prisma, guildId).catch((err) => logger.warning(`tempvoice reconcile failed: ${err}`));
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/tempvoice.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/bot/tempvoice.ts src/bot/events/ready.ts tests/tempvoice.test.ts
git commit -m "fix(fleet): reconcileTempVoice scoped to tenant guild, never deletes unverifiable rows (SaaS Phase 0)"
```

---

### Task 4: `liftExpiredCases` gains the missing `guildId` filter (`src/bot/scheduler.ts:19-27`)

**Bug found during planning (not in the spec's "verified" list — the spec is wrong about this one):** `liftExpiredCases` queries `where: { active: true, expiresAt: … }` with **no guildId**. In a fleet, tenant A's tick would lift tenant B's bans/mutes against the wrong guild. Even today, a case created in a foreign guild would be "lifted" against the configured guild.

**Files:**
- Modify: `src/bot/scheduler.ts:19-27` (`liftExpiredCases` signature + where)
- Modify: `tests/scheduler.test.ts:20-57` (both `liftExpiredCases` tests)
- Modify: `docs/superpowers/specs/2026-06-04-ly-system-saas-design.md` §6.5 (correct the "verified" claim)

- [ ] **Step 1: Update the tests (failing first)**

In `tests/scheduler.test.ts`, change the two `liftExpiredCases` calls and the `findMany` assertion:

```ts
    const n = await liftExpiredCases({ guild, prisma } as any, 'g1');
    expect(n).toBe(2);
    expect(prisma.moderationCase.findMany).toHaveBeenCalledWith({
      where: { guildId: 'g1', active: true, expiresAt: { not: null, lte: expect.any(Date) } },
    });
```

and in the second test:

```ts
    expect(await liftExpiredCases({ guild, prisma } as any, 'g1')).toBe(0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scheduler.test.ts`
Expected: FAIL — `findMany` called without `guildId`.

- [ ] **Step 3: Implement**

In `src/bot/scheduler.ts`, replace `liftExpiredCases`:

```ts
/** Lift (unban/untimeout) cases whose expiry passed — strictly for ONE guild (fleet-safety). */
export async function liftExpiredCases(deps: ActionDeps, guildId: string): Promise<number> {
  const expired = await deps.prisma.moderationCase.findMany({
    where: { guildId, active: true, expiresAt: { not: null, lte: new Date() } },
  });
  for (const c of expired) {
    await liftCase(deps, c.id);
  }
  return expired.length;
}
```

And update its call inside `tick` (currently `liftExpiredCases({ guild: …, prisma: deps.prisma })`):

```ts
      const n = await liftExpiredCases({ guild: guild as unknown as GuildLike, prisma: deps.prisma }, deps.guildId);
```

- [ ] **Step 4: Correct the spec**

In `docs/superpowers/specs/2026-06-04-ly-system-saas-design.md` §6.5, the sentence claiming the tasks are "already guildId-filtered (verified: …)" wrongly includes `liftExpiredCases`. Append to that list item:

```markdown
  *(Correction 2026-06-04: `liftExpiredCases` was in fact NOT guildId-filtered — fixed in Phase 0.)*
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/scheduler.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/bot/scheduler.ts tests/scheduler.test.ts docs/superpowers/specs/2026-06-04-ly-system-saas-design.md
git commit -m "fix(fleet): liftExpiredCases was missing the guildId filter (SaaS Phase 0)"
```

---

### Task 5: Extract `runSchedulerTick` (testable single tick) (`src/bot/scheduler.ts:67-131`)

The spec's key Phase-0 test needs to run **one tick** and inspect every query — but `tick` is a closure inside `startScheduler` with throttle state in closure variables. Extract it with an explicit state object. Pure refactor (same behavior), locked by existing + new tests.

**Files:**
- Modify: `src/bot/scheduler.ts:67-131`
- Modify: `tests/scheduler.test.ts` (smoke test that `startScheduler` still returns a timer)

- [ ] **Step 1: Refactor `startScheduler`**

Replace `startScheduler` in `src/bot/scheduler.ts` with:

```ts
/** Throttle/once-per-day bookkeeping carried across ticks (one per tenant in the fleet). */
export interface TickState {
  lastStatRefresh: number;
  lastBirthdayKey: string;
  lastTrendCheck: number;
}

export function createTickState(): TickState {
  return { lastStatRefresh: 0, lastBirthdayKey: '', lastTrendCheck: 0 };
}

/** One scheduler pass for one tenant guild. Exported so tests can run a single tick. */
export async function runSchedulerTick(deps: SchedulerDeps, state: TickState): Promise<void> {
  // Flush buffered activity counters — strictly the tenant guild (fleet-safety).
  const tenantGuild = deps.client.guilds.cache.get(deps.guildId);
  await flushStats(deps.prisma, deps.guildId, tenantGuild?.memberCount).catch((err) =>
    logger.error(`Stats flush error: ${err}`),
  );

  const posted = await postDueScheduled(deps).catch((err) => {
    logger.error(`Scheduled post error: ${err}`);
    return 0;
  });
  if (posted > 0) logger.info(`Scheduler posted ${posted} scheduled message(s)`);

  // Time-based community tasks.
  await endDueGiveaways(deps).catch((err) => logger.error(`Giveaway end error: ${err}`));
  await fireDueReminders(deps).catch((err) => logger.error(`Reminder error: ${err}`));

  // Voice-activity XP (pro-rated to the elapsed tick), temp-role expiry, raid lock auto-lift.
  await sweepVoiceXp(deps.client, deps.prisma, deps.guildId).catch((err) => logger.error(`Voice XP error: ${err}`));
  await expireShopRoles(deps).catch((err) => logger.error(`Shop expiry error: ${err}`));
  await sweepRaids(deps).catch(() => undefined);

  // Aggregate-trend tasks (weekly digest + churn alerts), throttled to ~30 min.
  if (Date.now() - state.lastTrendCheck > 1_800_000) {
    state.lastTrendCheck = Date.now();
    await postWeeklyDigest(deps).catch((err) => logger.error(`Digest error: ${err}`));
    await runChurnAlerts(deps).catch((err) => logger.error(`Alerts error: ${err}`));
  }

  // Creator content (YouTube/TikTok new uploads). Self-throttles per source inside the task.
  const newVids = await pollCreatorContent(deps).catch((err) => {
    logger.error(`Creator poll error: ${err}`);
    return 0;
  });
  if (newVids > 0) logger.info(`Scheduler announced ${newVids} new creator upload(s)`);

  // Stat-counter channels: throttled to ~10 min (Discord rate-limits channel renames).
  if (Date.now() - state.lastStatRefresh > 600_000) {
    state.lastStatRefresh = Date.now();
    await refreshStatCounters(deps).catch((err) => logger.error(`StatCounter error: ${err}`));
  }
  // Birthdays: once per UTC day (re-announces on restart, which is acceptable).
  const dayKey = new Date().toISOString().slice(0, 10);
  if (dayKey !== state.lastBirthdayKey) {
    state.lastBirthdayKey = dayKey;
    await announceBirthdays(deps).catch((err) => logger.error(`Birthday error: ${err}`));
  }

  const guild = deps.client.guilds.cache.get(deps.guildId);
  if (!guild) return;
  try {
    const n = await liftExpiredCases({ guild: guild as unknown as GuildLike, prisma: deps.prisma }, deps.guildId);
    if (n > 0) logger.info(`Scheduler lifted ${n} expired case(s)`);
  } catch (err) {
    logger.error(`Scheduler error: ${err}`);
  }
}

export function startScheduler(deps: SchedulerDeps, intervalMs = 60_000): NodeJS.Timeout {
  const state = createTickState();
  const handle = setInterval(() => void runSchedulerTick(deps, state), intervalMs);
  handle.unref?.();
  return handle;
}
```

(`GuildLike` is already imported at the top of the file.)

- [ ] **Step 2: Add a smoke test for the wrapper**

Append to `tests/scheduler.test.ts`:

```ts
import { startScheduler } from '../src/bot/scheduler';

describe('startScheduler', () => {
  it('returns a clearable interval handle and does not tick synchronously', () => {
    const deps = { client: { guilds: { cache: new Map() } }, prisma: {}, guildId: 'g1' } as any;
    const handle = startScheduler(deps, 60_000);
    expect(handle).toBeDefined();
    clearInterval(handle);
  });
});
```

(Merge the `startScheduler` import into the existing `from '../src/bot/scheduler'` import line.)

- [ ] **Step 3: Run tests to verify everything still passes**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green, tsc clean.

- [ ] **Step 4: Commit**

```bash
git add src/bot/scheduler.ts tests/scheduler.test.ts
git commit -m "refactor(fleet): extract runSchedulerTick with explicit state (SaaS Phase 0)"
```

---

### Task 6: Tick-wide tenant-isolation invariant test (the spec's key Phase-0 test)

Spec: *"Unit test asserting no scheduler/boot query runs without a guildId filter."* A recording Prisma proxy captures **every** query a full tick makes — both via injected `deps.prisma` and via the `src/db/prisma` singleton that `src/db/{community,settingsCache,leveling,…}.ts` import directly (mocked with `vi.mock`). Any future task added to the tick without a guild filter fails this test.

**Files:**
- Create: `tests/scheduler-tenant-isolation.test.ts`

- [ ] **Step 1: Write the invariant test**

Create `tests/scheduler-tenant-isolation.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// One recording fake serves BOTH the injected deps.prisma and the db/* singleton
// (src/db/community.ts etc. import prisma directly). vi.hoisted so the vi.mock
// factory below can reference it.
const { recorded, recordingPrisma } = vi.hoisted(() => {
  const recorded: { model: string; method: string; args: any }[] = [];
  const recordingPrisma = new Proxy(
    {},
    {
      get(_t, model: string) {
        if (typeof model !== 'string' || model === 'then') return undefined;
        return new Proxy(
          {},
          {
            get(_t2, method: string) {
              if (typeof method !== 'string' || method === 'then') return undefined;
              return (args: any) => {
                recorded.push({ model, method, args });
                if (method === 'findMany' || method === 'groupBy') return Promise.resolve([]);
                if (method === 'count') return Promise.resolve(0);
                if (method === 'findUnique' || method === 'findFirst') return Promise.resolve(null);
                return Promise.resolve({});
              };
            },
          },
        );
      },
    },
  ) as any;
  return { recorded, recordingPrisma };
});

vi.mock('../src/db/prisma', () => ({ prisma: recordingPrisma }));

import { runSchedulerTick, createTickState } from '../src/bot/scheduler';
import { allowStatsGuild, bump, _resetStats } from '../src/bot/stats';

// No tick task should ever reach the network in this test; if one does, fail loudly.
vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => '', json: async () => ({}) }),
);

function fakeClient() {
  const g1 = {
    id: 'g1',
    memberCount: 7,
    channels: { cache: new Map() },
    roles: { cache: new Map() },
    members: { fetch: vi.fn().mockRejectedValue(new Error('not found')) },
    voiceStates: { cache: new Map() },
  };
  // A second guild this client can SEE (e.g. invited) but that is NOT the tenant.
  const gB = { id: 'gB', memberCount: 3, channels: { cache: new Map() }, roles: { cache: new Map() }, voiceStates: { cache: new Map() } };
  return {
    guilds: { cache: new Map([['g1', g1], ['gB', gB]]) },
    channels: { cache: new Map() },
    users: { fetch: vi.fn().mockResolvedValue(null) },
  } as any;
}

async function runOneTick() {
  recorded.length = 0;
  _resetStats();
  allowStatsGuild('g1');
  bump('g1', 'messages');
  bump('gB', 'messages'); // foreign guild — the allowlist must drop this silently
  await runSchedulerTick({ client: fakeClient(), prisma: recordingPrisma, guildId: 'g1' }, createTickState());
}

describe('scheduler tick — tenant isolation invariant (SaaS Phase 0)', () => {
  beforeEach(() => {
    recorded.length = 0;
  });

  it('every bulk query in a full tick carries the tenant guildId filter', async () => {
    await runOneTick();
    const BULK = new Set(['findMany', 'findFirst', 'count', 'updateMany', 'deleteMany', 'groupBy', 'aggregate']);
    const bulkCalls = recorded.filter((c) => BULK.has(c.method));
    expect(bulkCalls.length).toBeGreaterThan(0); // the harness actually exercised queries
    for (const call of bulkCalls) {
      const where = call.args?.where ?? {};
      const guildId = where.guildId ?? where.guildId_date?.guildId;
      expect(guildId, `${call.model}.${call.method} ran without a tenant guildId filter`).toBe('g1');
    }
  });

  it('no query in the tick ever references another guild', async () => {
    await runOneTick();
    expect(JSON.stringify(recorded)).not.toContain('gB');
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/scheduler-tenant-isolation.test.ts`
Expected: PASS — Tasks 2/4/5 already fixed the violations this test exists to catch. If it FAILS, the failure message names the exact `model.method` still leaking; fix that task before proceeding (do not weaken the test).

- [ ] **Step 3: Commit**

```bash
git add tests/scheduler-tenant-isolation.test.ts
git commit -m "test(fleet): tick-wide invariant — no bulk query without tenant guildId (SaaS Phase 0)"
```

---

### Task 7: Boot survives a failed login + background retry (`src/boot.ts`)

Spec §6.2: a bad/expired token must **not** throw out of boot — the API/dashboard still starts. New behavior: login failure is caught and logged; boot continues; login retries every 60s until it succeeds (preserves transient-failure recovery that the old crash-and-Railway-restart behavior provided). **This deliberately flips the existing test** `'propagates a login failure (must crash the process, not be swallowed)'`.

**Files:**
- Modify: `src/boot.ts`
- Modify: `tests/boot.test.ts`
- Modify: `src/index.ts` (new `logInfo` dep)

- [ ] **Step 1: Update the tests (failing first)**

In `tests/boot.test.ts`: add `logInfo: vi.fn(),` to `baseDeps()` (after `logError`), then **replace** the `'propagates a login failure (must crash the process, not be swallowed)'` test with:

```ts
  // SaaS Phase 0 (spec §6.2): one bad token must NOT take the process down — the
  // dashboard/API still starts so the owner can see and fix it. This intentionally
  // replaces the old "propagates a login failure" behavior.
  it('starts the API server even when login fails (bad token must not crash boot)', async () => {
    const deps = baseDeps();
    deps.login = vi.fn().mockRejectedValue(new Error('invalid token'));
    await boot(deps as any);
    expect(deps.startApiServer).toHaveBeenCalledTimes(1);
    expect(deps.startScheduler).toHaveBeenCalledTimes(1);
    expect(deps.logError).toHaveBeenCalledWith(expect.stringContaining('Discord login failed'));
  });

  it('retries login in the background until it succeeds, then stops', async () => {
    vi.useFakeTimers();
    try {
      const deps = baseDeps();
      deps.login = vi
        .fn()
        .mockRejectedValueOnce(new Error('net down')) // boot attempt
        .mockRejectedValueOnce(new Error('net down')) // retry #1
        .mockResolvedValue(undefined); // retry #2 succeeds
      await boot(deps as any);
      expect(deps.login).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(deps.login).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(deps.login).toHaveBeenCalledTimes(3);
      expect(deps.logInfo).toHaveBeenCalledWith(expect.stringContaining('login retry succeeded'));
      await vi.advanceTimersByTimeAsync(300_000); // after success: no more attempts
      expect(deps.login).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not start a retry loop when login succeeds first try', async () => {
    vi.useFakeTimers();
    try {
      const deps = baseDeps();
      await boot(deps as any);
      await vi.advanceTimersByTimeAsync(600_000);
      expect(deps.login).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/boot.test.ts`
Expected: FAIL — boot rejects on login failure; `logInfo` missing.

- [ ] **Step 3: Implement**

Replace `src/boot.ts` with:

```ts
export interface BootDeps {
  guildId: string;
  login: () => Promise<unknown>;
  ensureGuildSettings: (guildId: string) => Promise<unknown>;
  startApiServer: () => void;
  startScheduler: () => void;
  registerCommands: () => Promise<unknown>;
  logError: (msg: string) => void;
  logInfo: (msg: string) => void;
}

/**
 * Boot order matters: the bot/dashboard must come up even if Discord command
 * registration hangs or fails. Registration calls Discord's REST API, which can
 * block on a rate limit (it waits out the retry-after) or reject — so it runs
 * LAST and fire-and-forget, never awaited before the API server starts.
 *
 * Regression: a guild-command-registration call hung on 5/24, and because it was
 * awaited before startApiServer, the whole dashboard 502'd for ~24h. See tests/boot.test.ts.
 *
 * Fleet-safety (SaaS Phase 0, spec §6.2): a failed Discord login must not take
 * the process down either — the dashboard/API still starts so the owner can see
 * and fix the problem (e.g. a revoked token), and login retries in the background
 * (a transient network failure at boot used to rely on the crash-restart loop).
 */
export async function boot(deps: BootDeps): Promise<void> {
  let loggedIn = true;
  try {
    await deps.login();
  } catch (err) {
    loggedIn = false;
    deps.logError(`Discord login failed (API still starting; retrying every 60s): ${err}`);
  }
  await deps.ensureGuildSettings(deps.guildId);
  deps.startApiServer();
  deps.startScheduler();
  if (!loggedIn) retryLogin(deps);
  void Promise.resolve()
    .then(() => deps.registerCommands())
    .catch((err) => deps.logError(`Command registration failed (continuing): ${err}`));
}

/** Keep retrying login on an interval until it succeeds; never throws. */
function retryLogin(deps: BootDeps, intervalMs = 60_000): void {
  const handle = setInterval(() => {
    void deps
      .login()
      .then(() => {
        clearInterval(handle);
        deps.logInfo('Discord login retry succeeded');
      })
      .catch((err) => deps.logError(`Discord login retry failed: ${err}`));
  }, intervalMs);
  (handle as { unref?: () => void }).unref?.();
}
```

- [ ] **Step 4: Wire the new dep**

In `src/index.ts`, add to the `boot({ … })` call after `logError`:

```ts
    logInfo: (msg) => logger.info(msg),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/boot.test.ts && npx tsc --noEmit`
Expected: PASS (6 tests), tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/boot.ts src/index.ts tests/boot.test.ts
git commit -m "feat(fleet): boot survives a failed Discord login — API starts, login retries (SaaS Phase 0)"
```

---

### Task 8: Per-client `error`/`shardError` handlers (`src/bot/client.ts`)

Spec §6.2: an unhandled `'error'` event on an EventEmitter **throws** and would crash the shared fleet process. Attach scoped handlers to every client (today: the one client; Phase 1 calls this per tenant with a tenant label).

**Files:**
- Modify: `src/bot/client.ts`
- Modify: `src/index.ts`
- Create: `tests/client-errors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/client-errors.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { attachClientErrorHandlers } from '../src/bot/client';

describe('attachClientErrorHandlers (fleet-safety)', () => {
  it('without handlers, an error emit crashes (sanity check of the hazard)', () => {
    const ee = new EventEmitter();
    expect(() => ee.emit('error', new Error('boom'))).toThrow('boom');
  });

  it('a client error is logged with the tenant label, not thrown', () => {
    const ee = new EventEmitter();
    const logError = vi.fn();
    attachClientErrorHandlers(ee, 'tenant-g1', logError);
    expect(() => ee.emit('error', new Error('gateway reset'))).not.toThrow();
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0][0]).toContain('tenant-g1');
    expect(logError.mock.calls[0][0]).toContain('gateway reset');
  });

  it('shard errors are logged too', () => {
    const ee = new EventEmitter();
    const logError = vi.fn();
    attachClientErrorHandlers(ee, 'tenant-g1', logError);
    ee.emit('shardError', new Error('ws closed'));
    expect(logError.mock.calls[0][0]).toContain('ws closed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/client-errors.test.ts`
Expected: FAIL — `attachClientErrorHandlers` is not exported.

- [ ] **Step 3: Implement**

In `src/bot/client.ts`, add at the top `import { logger } from '../shared/logger';` and append:

```ts
/**
 * Per-client fault isolation (SaaS Phase 0, spec §6.2): an unhandled 'error'
 * event on an EventEmitter throws — one client's gateway hiccup must never take
 * down the shared fleet process. Phase 1 calls this once per tenant client.
 */
export function attachClientErrorHandlers(
  emitter: { on(event: string, listener: (arg: unknown) => void): unknown },
  label: string,
  logError: (msg: string) => void = logger.error,
): void {
  emitter.on('error', (err) => logError(`${label}: client error: ${err}`));
  emitter.on('shardError', (err) => logError(`${label}: shard error: ${err}`));
}
```

- [ ] **Step 4: Wire it for the existing client**

In `src/index.ts`, extend the client import and attach after `loadEvents`:

```ts
import { client, attachClientErrorHandlers } from './bot/client';
```

```ts
  loadEvents(client, commands);
  attachClientErrorHandlers(client, 'bot');
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/client-errors.test.ts && npx tsc --noEmit`
Expected: PASS (3 tests), tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/bot/client.ts src/index.ts tests/client-errors.test.ts
git commit -m "feat(fleet): per-client error/shardError isolation handlers (SaaS Phase 0)"
```

---

## Final Verification

- [ ] **Full test suite:** `npx vitest run` — every suite green (expect ~47 files; the 5 new/changed: logger, stats, tempvoice, scheduler, scheduler-tenant-isolation, boot, client-errors).
- [ ] **Type check + full build:** `npm run build` (prisma generate → tsc → web build) — must complete clean; this is the deploy gate.
- [ ] **Review the diff end-to-end:** `git diff 968ee1a..HEAD` — confirm: no schema changes, no behavior change for the live single-tenant bot beyond (a) foreign-guild stats no longer recorded, (b) login failure no longer crash-loops, (c) token shapes redacted in logs.
- [ ] **Push (needs the user's explicit approval — Railway auto-deploys `main`):** after approval, `git push`, then watch the Railway deploy come up and confirm `/api/health` responds and the bot is online.

## Out of scope (later phases)

- `TenantRegistry`, `GlobalConfig`/`TenantRuntime` split, token vault crypto, Subscription models/gate — Phase 1.
- Central multi-guild OAuth + `tenantContext` + Prisma tenant-guard extension — Phase 2.
- The `bump()` allowlist currently holds one guild; Phase 1's registry calls `allowStatsGuild` per tenant.
