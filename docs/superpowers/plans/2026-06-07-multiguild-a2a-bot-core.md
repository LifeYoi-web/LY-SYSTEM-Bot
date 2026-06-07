# Multi-Guild أ2a — Bot Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-guild bot into the shared public bot (freemium spec §3.2): global slash commands, guildCreate/guildDelete lifecycle (free Subscription row + Arabic onboarding / mark `left`), multi-guild `ready` reconciliation, per-guild scheduler ticks, per-guild stats registration — while the live owner guild keeps behaving exactly as today.

**Architecture:** The bot layer already extracts `guildId` from every event context and Phase 0 locked tenant isolation in the scheduler. This plan removes the remaining single-guild assumptions: `registerCommands` flips to global (clearing the now-stale guild-scoped set), two new lifecycle events keep the Subscription registry in sync, `ready` reconciles ALL cached guilds (settings + subscription + stats allowlist + per-guild cache warms; eager member-fetch stays owner-only), and `startScheduler` becomes an outer sweep that runs the existing (unchanged, isolation-tested) `runSchedulerTick` once per cached guild with per-guild `TickState`. `voiceXp`'s module-level sweep clock becomes per-guild.

**Tech Stack:** TypeScript (CommonJS), discord.js v14, Prisma v7 (no schema changes), Vitest.

---

## Pre-existing context an engineer needs

- Run tests: `npx vitest run` (currently 372 tests / 58 files, green). Type check: `npx tsc --noEmit`.
- Conventions: `logger` not `console`; Arabic user-facing strings; LY orange `0xf57c00`; commits straight to `main`; **do NOT stage** `.gitignore` (modified), `no bg.png`, `scratch/`.
- Event contract: `src/bot/events/<name>.ts` uses `module.exports = { name, once, async execute(...args, commands) {} }` — NO ES exports in event files (the loader `require()`s compiled `.js`).
- `src/db/subscriptions.ts` (freemium A1) exports `getPlan`/`getConfirmedPlan`/`setPlan`/`seedOwnerPlan`/`invalidatePlan`/`_resetPlans`, imports the prisma singleton. `Subscription.status` defaults `'active'`; stage-ب lifecycle will use `grace`/`expired` — **never blindly overwrite status**.
- `tests/scheduler-tenant-isolation.test.ts` calls `runSchedulerTick({client, prisma, guildId: 'g1'}, createTickState())` directly with a recording prisma proxy — `runSchedulerTick`'s signature and per-guild semantics MUST NOT change.
- `tests/boot.test.ts` guards boot order (login → settings → server → register fire-and-forget last) — untouched by this plan (registerCommands stays a thunk in `index.ts`).
- The owner guild is seeded `custom` at boot (`seedOwnerPlan` in `src/index.ts`); `allowStatsGuild(config.guildId)` is called in `main()` before boot.
- Discord global command updates propagate near-instantly nowadays (the "~1h" in the loader comment is legacy); the swap order (put global → clear guild) leaves at most a seconds-long window on the owner guild.

## File structure (locked decisions)

| File | Responsibility |
|------|----------------|
| `src/db/subscriptions.ts` | + `ensureSubscription` (create-free / reactivate-left, never touches plan), + `markGuildLeft` |
| `src/bot/onboarding.ts` (new) | `buildOnboardingEmbed(dashboardUrl)` + `postOnboarding(guild)` — Arabic welcome-to-the-bot embed |
| `src/bot/events/guildCreate.ts` (new) | settings + subscription + stats allowlist + onboarding post |
| `src/bot/events/guildDelete.ts` (new) | `markGuildLeft` |
| `src/bot/guilds.ts` (new) | `reconcileKnownGuilds(client)` — per-guild settings/subscription/stats loop used by `ready` |
| `src/bot/events/ready.ts` | multi-guild reconcile + per-guild invite/booster/tempvoice warms; owner-only eager member fetch |
| `src/bot/loader.ts` | `registerCommands` gains `opts.clearGuildId` for the global path |
| `src/index.ts` | global registration call |
| `src/bot/scheduler.ts` | `SchedulerDeps` loses `guildId`; new `runSchedulerSweep` iterates cached guilds with a per-guild `TickState` map; `runSchedulerTick` (with `GuildTickDeps`) unchanged in behavior |
| `src/bot/voiceXp.ts` | module-level `lastSweep` becomes `Map<guildId, number>` |

---

### Task 1: `ensureSubscription` + `markGuildLeft` lifecycle helpers

**Files:**
- Modify: `src/db/subscriptions.ts`
- Modify: `tests/subscriptions.test.ts` (append a describe block)

- [ ] **Step 1: Write the failing tests** — append to `tests/subscriptions.test.ts` (the file already mocks the prisma singleton with `fakePrisma.subscription = { findUnique, upsert }`; ADD `updateMany: vi.fn().mockResolvedValue({ count: 0 })` to the hoisted fake and reset it in `beforeEach`):

```ts
describe('ensureSubscription / markGuildLeft (multi-guild lifecycle)', () => {
  it('ensureSubscription creates a free row when missing and never touches plan on rejoin', async () => {
    await ensureSubscription('g-new');
    expect(fakePrisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { guildId: 'g-new', status: 'left' },
      data: { status: 'active' },
    });
    expect(fakePrisma.subscription.upsert).toHaveBeenCalledWith({
      where: { guildId: 'g-new' },
      update: {},
      create: { guildId: 'g-new', plan: 'free' },
    });
  });

  it('ensureSubscription invalidates the plan cache (rejoin sees fresh state)', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
    expect(await getPlan('g-back')).toBe('premium');
    fakePrisma.subscription.findUnique.mockResolvedValue(null);
    await ensureSubscription('g-back');
    expect(await getPlan('g-back')).toBe('free'); // cache invalidated → re-read
  });

  it('markGuildLeft sets status left without touching plan, and invalidates the cache', async () => {
    await markGuildLeft('g-gone');
    expect(fakePrisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { guildId: 'g-gone' },
      data: { status: 'left' },
    });
  });
});
```

(Import `ensureSubscription, markGuildLeft` in the existing import line from `../src/db/subscriptions`.)

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/subscriptions.test.ts` → FAIL (exports missing).

- [ ] **Step 3: Implement** — append to `src/db/subscriptions.ts`:

```ts
/**
 * guildCreate / ready reconciliation: every guild the shared bot is in gets a
 * Subscription row. Creates 'free' when missing; a re-join flips a previous
 * 'left' back to 'active'. NEVER touches plan or any other status (stage-ب
 * lifecycle owns grace/expired) — a premium guild that re-invites the bot
 * keeps premium.
 */
export async function ensureSubscription(guildId: string): Promise<void> {
  await prisma.subscription.updateMany({ where: { guildId, status: 'left' }, data: { status: 'active' } });
  await prisma.subscription.upsert({ where: { guildId }, update: {}, create: { guildId, plan: 'free' } });
  invalidatePlan(guildId);
}

/** guildDelete: mark the subscription left (data retained — cleanup is a later stage). */
export async function markGuildLeft(guildId: string): Promise<void> {
  await prisma.subscription.updateMany({ where: { guildId }, data: { status: 'left' } });
  invalidatePlan(guildId);
}
```

- [ ] **Step 4: Verify** — `npx vitest run tests/subscriptions.test.ts` → PASS (12). `npx tsc --noEmit` → clean. Full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/db/subscriptions.ts tests/subscriptions.test.ts
git commit -m "feat(saas): subscription lifecycle helpers — ensureSubscription + markGuildLeft (multiguild A2a)"
```

---

### Task 2: Arabic onboarding module

**Files:**
- Create: `src/bot/onboarding.ts`
- Create: `tests/onboarding.test.ts`

- [ ] **Step 1: Write the failing test** — create `tests/onboarding.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { buildOnboardingEmbed, postOnboarding } from '../src/bot/onboarding';

function fakeGuild(opts: { system?: boolean; sendable?: boolean } = {}) {
  const send = vi.fn().mockResolvedValue({});
  const me = { id: 'bot' };
  const sendableChannel = {
    isTextBased: () => true,
    permissionsFor: () => ({ has: () => opts.sendable !== false }),
    send,
  };
  return {
    guild: {
      name: 'سيرفر تجريبي',
      members: { me },
      systemChannel: opts.system === false ? null : sendableChannel,
      channels: { cache: new Map(opts.system === false ? [['c1', sendableChannel]] : []) },
    } as any,
    send,
  };
}

describe('buildOnboardingEmbed', () => {
  it('is an Arabic LY-orange embed carrying the dashboard link', () => {
    const embed = buildOnboardingEmbed('https://dash.example').toJSON();
    expect(embed.color).toBe(0xf57c00);
    expect(embed.title).toContain('LY-SYSTEM');
    expect(JSON.stringify(embed)).toContain('https://dash.example');
  });
});

describe('postOnboarding', () => {
  it('posts to the system channel when sendable', async () => {
    const { guild, send } = fakeGuild();
    expect(await postOnboarding(guild, 'https://dash.example')).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('falls back to the first sendable text channel when no system channel', async () => {
    const { guild, send } = fakeGuild({ system: false });
    expect(await postOnboarding(guild, 'https://dash.example')).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('returns false (never throws) when nothing is sendable', async () => {
    const { guild } = fakeGuild({ system: false, sendable: false });
    expect(await postOnboarding(guild, 'https://dash.example')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/onboarding.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/bot/onboarding.ts`:**

```ts
import { EmbedBuilder, PermissionFlagsBits, type Guild, type GuildBasedChannel } from 'discord.js';

const ORANGE = 0xf57c00;

/** First-contact embed posted when the shared bot joins a new guild. */
export function buildOnboardingEmbed(dashboardUrl: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(ORANGE)
    .setTitle('👋 أهلاً! أنا LY-SYSTEM')
    .setDescription(
      [
        'بوت إدارة وحماية وتفاعل عربي متكامل — تم تفعيلي في سيرفركم بنجاح.',
        '',
        '⚙️ **لوحة التحكم:** كل الإعدادات من المتصفح:',
        dashboardUrl,
        '',
        '✨ ابدأ بـ `/help` لاستعراض الأوامر، أو افتح اللوحة لضبط الترحيب والحماية والمستويات.',
      ].join('\n'),
    );
}

function canSend(channel: GuildBasedChannel, guild: Guild): boolean {
  const me = guild.members.me;
  if (!me || !('permissionsFor' in channel) || !channel.isTextBased()) return false;
  const perms = channel.permissionsFor(me);
  return Boolean(perms?.has(PermissionFlagsBits.SendMessages));
}

/** Posts the onboarding embed to the system channel (or first sendable text channel). Never throws. */
export async function postOnboarding(guild: Guild, dashboardUrl: string): Promise<boolean> {
  try {
    const system = guild.systemChannel;
    const target =
      (system && canSend(system, guild) ? system : null) ??
      [...guild.channels.cache.values()].find((c) => canSend(c, guild)) ??
      null;
    if (!target || !target.isTextBased()) return false;
    await target.send({ embeds: [buildOnboardingEmbed(dashboardUrl)] });
    return true;
  } catch {
    return false;
  }
}
```

NOTE: the fakes in the test are structural — if `isTextBased`/`permissionsFor` checks need adjusting to satisfy both the fakes and `tsc` against discord.js types, adapt the implementation (keep behavior: system channel first, fallback scan, never throws), and keep the test's observable assertions.

- [ ] **Step 4: Verify** — `npx vitest run tests/onboarding.test.ts` → PASS (4). `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/bot/onboarding.ts tests/onboarding.test.ts
git commit -m "feat(saas): Arabic onboarding embed for new guilds (multiguild A2a)"
```

---

### Task 3: `guildCreate` + `guildDelete` events

**Files:**
- Create: `src/bot/events/guildCreate.ts`
- Create: `src/bot/events/guildDelete.ts`
- Create: `tests/guild-lifecycle.test.ts`

- [ ] **Step 1: Write the failing test** — create `tests/guild-lifecycle.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: {
    subscription: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    guildSettings: { upsert: vi.fn().mockResolvedValue({ guildId: 'g-new' }) },
  },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { _resetPlans } from '../src/db/subscriptions';
import { _resetStats, bump, flushStats } from '../src/bot/stats';

const guildCreate = require('../src/bot/events/guildCreate');
const guildDelete = require('../src/bot/events/guildDelete');

function fakeGuild(id = 'g-new') {
  const send = vi.fn().mockResolvedValue({});
  return {
    id,
    name: 'سيرفر جديد',
    memberCount: 42,
    members: { me: { id: 'bot' } },
    systemChannel: { isTextBased: () => true, permissionsFor: () => ({ has: () => true }), send },
    channels: { cache: new Map() },
    send,
  } as any;
}

beforeEach(() => {
  _resetPlans();
  _resetStats();
  vi.clearAllMocks();
});

describe('guildCreate', () => {
  it('ensures settings + free subscription, registers stats, posts onboarding', async () => {
    const g = fakeGuild();
    await guildCreate.execute(g);
    expect(fakePrisma.guildSettings.upsert).toHaveBeenCalled(); // ensureGuildSettings
    expect(fakePrisma.subscription.upsert).toHaveBeenCalledWith({
      where: { guildId: 'g-new' },
      update: {},
      create: { guildId: 'g-new', plan: 'free' },
    });
    expect(g.systemChannel.send).toHaveBeenCalledTimes(1); // onboarding posted
    // stats allowlisted: a bump for the new guild now reaches flush
    bump('g-new', 'messages');
    const upsertSpy = vi.fn().mockResolvedValue({});
    await flushStats({ dailyStat: { upsert: upsertSpy } } as any, 'g-new');
    expect(upsertSpy).toHaveBeenCalled();
  });

  it('never throws even when everything fails', async () => {
    fakePrisma.guildSettings.upsert.mockRejectedValueOnce(new Error('db down'));
    await expect(guildCreate.execute(fakeGuild())).resolves.toBeUndefined();
  });
});

describe('guildDelete', () => {
  it('marks the subscription left', async () => {
    await guildDelete.execute({ id: 'g-gone', name: 'x' } as any);
    expect(fakePrisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { guildId: 'g-gone' },
      data: { status: 'left' },
    });
  });
});
```

ADAPTATION NOTES: (a) read `src/bot/stats.ts` first — if `flushStats`'s real signature differs (`(prisma, guildId, memberCount?)`), match it; if `_resetStats` doesn't exist, check what `tests/scheduler-tenant-isolation.test.ts` imports and mirror. (b) `ensureGuildSettings` lives in `src/db/settingsCache.ts` and upserts `guildSettings` through the singleton — the assertion on `fakePrisma.guildSettings.upsert` covers it; read the file and adapt the fake if it calls a different method (e.g. `findUnique` then `create`). (c) events are loaded with `require()` because they use `module.exports`.

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/guild-lifecycle.test.ts` → FAIL (modules missing).

- [ ] **Step 3: Implement `src/bot/events/guildCreate.ts`:**

```ts
import type { Guild } from 'discord.js';
import { logger } from '../../shared/logger';
import { ensureGuildSettings } from '../../db/settingsCache';
import { ensureSubscription } from '../../db/subscriptions';
import { allowStatsGuild } from '../stats';
import { postOnboarding } from '../onboarding';

module.exports = {
  name: 'guildCreate',
  once: false,
  async execute(guild: Guild) {
    logger.info(`Joined guild: ${guild.name} (${guild.id}, ${guild.memberCount} members)`);
    try {
      await ensureGuildSettings(guild.id);
      await ensureSubscription(guild.id); // free tier by default; rejoin keeps the old plan
      allowStatsGuild(guild.id);
      const dashboardUrl = process.env.DASHBOARD_URL || '';
      if (dashboardUrl) await postOnboarding(guild, dashboardUrl);
    } catch (err) {
      logger.error(`guildCreate setup failed for ${guild.id}: ${err}`);
    }
  },
};
```

**Implement `src/bot/events/guildDelete.ts`:**

```ts
import type { Guild } from 'discord.js';
import { logger } from '../../shared/logger';
import { markGuildLeft } from '../../db/subscriptions';

module.exports = {
  name: 'guildDelete',
  once: false,
  async execute(guild: Guild) {
    logger.info(`Left guild: ${guild.name ?? '?'} (${guild.id})`);
    await markGuildLeft(guild.id).catch((err) => logger.error(`guildDelete cleanup failed for ${guild.id}: ${err}`));
  },
};
```

- [ ] **Step 4: Verify** — `npx vitest run tests/guild-lifecycle.test.ts` → PASS. Full suite + `npx tsc --noEmit` green/clean.

- [ ] **Step 5: Commit**

```bash
git add src/bot/events/guildCreate.ts src/bot/events/guildDelete.ts tests/guild-lifecycle.test.ts
git commit -m "feat(saas): guildCreate/guildDelete lifecycle — free subscription + onboarding + left marking (multiguild A2a)"
```

---

### Task 4: `reconcileKnownGuilds` + multi-guild `ready`

**Files:**
- Create: `src/bot/guilds.ts`
- Modify: `src/bot/events/ready.ts`
- Create: `tests/guild-reconcile.test.ts`

- [ ] **Step 1: Write the failing test** — create `tests/guild-reconcile.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: {
    subscription: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    guildSettings: { upsert: vi.fn().mockResolvedValue({}) },
  },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { reconcileKnownGuilds } from '../src/bot/guilds';
import { _resetPlans } from '../src/db/subscriptions';
import { _resetStats, bump, flushStats } from '../src/bot/stats';

beforeEach(() => {
  _resetPlans();
  _resetStats();
  vi.clearAllMocks();
});

function clientWith(ids: string[]) {
  return { guilds: { cache: new Map(ids.map((id) => [id, { id, name: `g-${id}` }])) } } as any;
}

describe('reconcileKnownGuilds', () => {
  it('ensures settings + subscription + stats for every cached guild', async () => {
    const n = await reconcileKnownGuilds(clientWith(['g1', 'g2']));
    expect(n).toBe(2);
    expect(fakePrisma.guildSettings.upsert).toHaveBeenCalledTimes(2);
    expect(fakePrisma.subscription.upsert).toHaveBeenCalledTimes(2);
    bump('g2', 'messages');
    const upsertSpy = vi.fn().mockResolvedValue({});
    await flushStats({ dailyStat: { upsert: upsertSpy } } as any, 'g2');
    expect(upsertSpy).toHaveBeenCalled();
  });

  it('one bad guild does not stop the others', async () => {
    fakePrisma.guildSettings.upsert.mockRejectedValueOnce(new Error('boom'));
    const n = await reconcileKnownGuilds(clientWith(['g1', 'g2']));
    expect(n).toBe(1); // g1 failed, g2 reconciled
  });
});
```

(Same adaptation notes as Task 3 for stats/settings internals.)

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/guild-reconcile.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/bot/guilds.ts`:**

```ts
import type { Client } from 'discord.js';
import { logger } from '../shared/logger';
import { ensureGuildSettings } from '../db/settingsCache';
import { ensureSubscription } from '../db/subscriptions';
import { allowStatsGuild } from './stats';

/**
 * Boot-time registry sync: every guild the shared bot is currently in gets a
 * settings row, a Subscription row (free by default), and a stats allowlist
 * entry — covering guilds joined while the bot was offline (missed guildCreate).
 * Per-guild failures are logged and skipped. Returns the reconciled count.
 */
export async function reconcileKnownGuilds(client: Client): Promise<number> {
  let n = 0;
  for (const guild of client.guilds.cache.values()) {
    try {
      await ensureGuildSettings(guild.id);
      await ensureSubscription(guild.id);
      allowStatsGuild(guild.id);
      n++;
    } catch (err) {
      logger.warning(`Guild reconcile failed for ${guild.id}: ${err}`);
    }
  }
  return n;
}
```

(Read `src/shared/logger.ts` for the exact warn method name — `logger.warning` per ready.ts usage.)

- [ ] **Step 4: Rewrite the multi-guild parts of `src/bot/events/ready.ts`.** Read the current file first (quoted in full in the repo). The new shape — presence + music init stay as-is; the guild-scoped block changes:

```ts
import { Client } from 'discord.js';
import { logger } from '../../shared/logger';
import { getSettings } from '../../db/settingsCache';
import { buildPresence } from '../presence';
import { prisma } from '../../db/prisma';
import { reconcileTempVoice } from '../tempvoice';
import { getMusicManager } from '../music/manager';
import { cacheGuildInvites } from '../invites';
import { reconcileBoosters } from '../boosters';
import { reconcileKnownGuilds } from '../guilds';

module.exports = {
  name: 'ready',
  once: true,
  async execute(client: Client) {
    logger.success(`Bot is online as: ${client.user?.tag}`);
    logger.info(`Connected to ${client.guilds.cache.size} server(s)`);

    const ownerGuildId = process.env.GUILD_ID;
    const totalMembers = client.guilds.cache.reduce((sum, g) => sum + (g.memberCount ?? 0), 0);
    // Presence comes from the owner guild's settings (the bot has ONE global presence).
    const settings = ownerGuildId ? await getSettings(ownerGuildId).catch(() => null) : null;
    client.user?.setPresence(buildPresence(settings ?? {}, totalMembers));

    // Registry sync for every guild we are in (settings + subscription + stats).
    const n = await reconcileKnownGuilds(client).catch(() => 0);
    if (n) logger.success(`Reconciled ${n} guild(s) into the registry`);

    // Owner guild keeps the eager member-cache warm (dashboard member list);
    // other guilds warm lazily on demand.
    if (ownerGuildId) {
      const ownerGuild = client.guilds.cache.get(ownerGuildId);
      await ownerGuild?.members
        .fetch()
        .then((m) => logger.success(`Member cache warmed (${m.size})`))
        .catch(() => logger.warning('Could not warm member cache (check GuildMembers intent)'));
    }

    // Per-guild cache warms + reconciles (invite attribution, boosters, temp-voice orphans).
    for (const guild of client.guilds.cache.values()) {
      await cacheGuildInvites(guild).catch(() => undefined);
      await reconcileBoosters(guild, prisma).catch(() => undefined);
      await reconcileTempVoice(client, prisma, guild.id).catch((err) =>
        logger.warning(`tempvoice reconcile failed for ${guild.id}: ${err}`),
      );
    }

    // Connect to the Lavalink node (no-op if music is disabled). Never blocks/aborts startup.
    const music = getMusicManager();
    if (music && client.user) {
      await music
        .init({ id: client.user.id, username: client.user.username })
        .then(() => logger.success('Music: Lavalink init sent.'))
        .catch((err) => logger.warning(`Music: Lavalink init failed (continuing): ${err}`));
    }
  },
};
```

(Behavioral deltas vs today: invite/booster/tempvoice warms run for EVERY cached guild instead of only the configured one; the single-guild invite warm's "Manage Server" warning downgraded to silent per-guild catch — a free guild without the permission must not spam boot logs. Everything else identical.)

- [ ] **Step 5: Verify** — `npx vitest run tests/guild-reconcile.test.ts` → PASS. Full suite + tsc green/clean.

- [ ] **Step 6: Commit**

```bash
git add src/bot/guilds.ts src/bot/events/ready.ts tests/guild-reconcile.test.ts
git commit -m "feat(saas): multi-guild ready — registry reconcile + per-guild cache warms (multiguild A2a)"
```

---

### Task 5: Global command registration

**Files:**
- Modify: `src/bot/loader.ts` (`registerCommands` global path + `clearGuildId`)
- Modify: `src/index.ts` (the registerCommands thunk)
- Create: `tests/register-commands.test.ts`

- [ ] **Step 1: Write the failing test** — create `tests/register-commands.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { putSpy } = vi.hoisted(() => ({ putSpy: vi.fn().mockResolvedValue(undefined) }));

vi.mock('discord.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('discord.js')>();
  class FakeREST {
    setToken() { return this; }
    put = putSpy;
  }
  return { ...orig, REST: FakeREST };
});

import { Collection } from 'discord.js';
import { registerCommands } from '../src/bot/loader';

beforeEach(() => putSpy.mockClear());

function commands() {
  const c = new Collection<string, any>();
  c.set('ping', { data: { toJSON: () => ({ name: 'ping' }) }, execute: vi.fn() });
  return c;
}

describe('registerCommands', () => {
  it('guild-scoped: puts guild commands then clears global (legacy path unchanged)', async () => {
    await registerCommands(commands(), 'tok', 'app1', 'g1');
    const urls = putSpy.mock.calls.map((c) => c[0]);
    expect(urls[0]).toBe('/applications/app1/guilds/g1/commands');
    expect(urls[1]).toBe('/applications/app1/commands');
    expect(putSpy.mock.calls[1][1]).toEqual({ body: [] });
  });

  it('global: puts global commands and clears the stale guild set', async () => {
    await registerCommands(commands(), 'tok', 'app1', undefined, { clearGuildId: 'g1' });
    const urls = putSpy.mock.calls.map((c) => c[0]);
    expect(urls[0]).toBe('/applications/app1/commands');
    expect(putSpy.mock.calls[0][1].body).toHaveLength(1);
    expect(urls[1]).toBe('/applications/app1/guilds/g1/commands');
    expect(putSpy.mock.calls[1][1]).toEqual({ body: [] });
  });

  it('global without clearGuildId: single global put only', async () => {
    await registerCommands(commands(), 'tok', 'app1');
    expect(putSpy).toHaveBeenCalledTimes(1);
    expect(putSpy.mock.calls[0][0]).toBe('/applications/app1/commands');
  });
});
```

(`Routes.applicationCommands('app1')` returns `/applications/app1/commands` and `Routes.applicationGuildCommands('app1','g1')` returns `/applications/app1/guilds/g1/commands` — real discord.js Routes are kept by the partial mock. If loading `../src/bot/loader` pulls in side-effectful imports that break under the partial mock, adapt the mock to include whatever loader.ts imports from discord.js — keep `...orig` spread so everything else stays real.)

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/register-commands.test.ts` → FAIL (the global path doesn't accept opts / ordering differs).

- [ ] **Step 3: Modify `registerCommands` in `src/bot/loader.ts`** — current body (lines ~25-44) becomes:

```ts
export async function registerCommands(
  commands: Collection<string, Command>,
  token: string,
  clientId: string,
  guildId?: string,
  opts?: { clearGuildId?: string },
): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token);
  const body = Array.from(commands.values()).map((c) => c.data.toJSON());
  logger.info('Registering commands with Discord...');
  if (guildId) {
    // Guild-scoped registration updates INSTANTLY (kept for tests/tooling).
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    // Clear any stale GLOBAL commands left by earlier deploys so they don't show as duplicates.
    await rest.put(Routes.applicationCommands(clientId), { body: [] }).catch(() => undefined);
    logger.success(`Registered ${body.length} command(s) to guild ${guildId} (instant).`);
  } else {
    // Multi-guild: ONE global set serves every guild the shared bot is in.
    await rest.put(Routes.applicationCommands(clientId), { body });
    if (opts?.clearGuildId) {
      // Clear the stale guild-scoped set from the single-guild era so commands don't show twice.
      await rest.put(Routes.applicationGuildCommands(clientId, opts.clearGuildId), { body: [] }).catch(() => undefined);
    }
    logger.success(`Registered ${body.length} global command(s).`);
  }
}
```

- [ ] **Step 4: Flip `src/index.ts` to global** — the boot dep changes from

```ts
    registerCommands: () => registerCommands(commands, config.discordToken, config.clientId, config.guildId),
```

to

```ts
    // Multi-guild: global registration; clears the stale guild-scoped set from the single-guild era.
    registerCommands: () => registerCommands(commands, config.discordToken, config.clientId, undefined, { clearGuildId: config.guildId }),
```

- [ ] **Step 5: Verify** — `npx vitest run tests/register-commands.test.ts tests/boot.test.ts` → PASS. Full suite + tsc green/clean.

- [ ] **Step 6: Commit**

```bash
git add src/bot/loader.ts src/index.ts tests/register-commands.test.ts
git commit -m "feat(saas): global slash-command registration — one set for all guilds (multiguild A2a)"
```

---

### Task 6: Scheduler sweep over all guilds + per-guild voiceXp clock

**Files:**
- Modify: `src/bot/scheduler.ts`
- Modify: `src/bot/voiceXp.ts`
- Modify: `src/index.ts` (drop `guildId` from the startScheduler deps)
- Create: `tests/scheduler-sweep.test.ts`
- Modify (only if needed): `tests/scheduler.test.ts`

- [ ] **Step 1: Write the failing test** — create `tests/scheduler-sweep.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: { subscription: { findUnique: vi.fn().mockResolvedValue(null) } },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { runSchedulerSweep, runSchedulerTick, createTickState } from '../src/bot/scheduler';
import { sweepVoiceXp, _resetVoiceXpClock } from '../src/bot/voiceXp';
import { _resetPlans } from '../src/db/subscriptions';

beforeEach(() => {
  _resetPlans();
  _resetVoiceXpClock();
});

function clientWith(ids: string[]) {
  return {
    guilds: { cache: new Map(ids.map((id) => [id, { id, memberCount: 5 }])) },
  } as any;
}

// A prisma whose every model.method resolves to a benign empty value.
function benignPrisma() {
  return new Proxy({}, {
    get: (_t, _model) => new Proxy({}, {
      get: (_t2, method) => (..._a: any[]) => {
        if (method === 'findMany' || method === 'groupBy') return Promise.resolve([]);
        if (method === 'count') return Promise.resolve(0);
        if (method === 'findUnique' || method === 'findFirst') return Promise.resolve(null);
        return Promise.resolve({});
      },
    }),
  }) as any;
}

describe('runSchedulerSweep', () => {
  it('ticks once per cached guild with isolated per-guild state', async () => {
    const states = new Map();
    await runSchedulerSweep({ client: clientWith(['g1', 'g2']), prisma: benignPrisma() } as any, states);
    expect([...states.keys()].sort()).toEqual(['g1', 'g2']);
    expect(states.get('g1')).not.toBe(states.get('g2'));
  });

  it('prunes state for guilds the bot left', async () => {
    const states = new Map([['g-old', createTickState()]]);
    await runSchedulerSweep({ client: clientWith(['g1']), prisma: benignPrisma() } as any, states);
    expect(states.has('g-old')).toBe(false);
    expect(states.has('g1')).toBe(true);
  });
});

describe('voiceXp per-guild clock', () => {
  it('two guilds swept in the same tick each get their own elapsed window', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' }); // pass the plan gate
    const calls: string[] = [];
    const prisma = {
      levelConfig: { upsert: vi.fn().mockImplementation(({ where }: any) => { calls.push(where.guildId); return Promise.resolve(null); }) },
    } as any;
    const client = { guilds: { cache: new Map() } } as any;
    const t0 = 1_000_000;
    // First sweep establishes each guild's baseline independently (returns 0, no throw):
    expect(await sweepVoiceXp(client, prisma, 'g1', t0)).toBe(0);
    expect(await sweepVoiceXp(client, prisma, 'g2', t0)).toBe(0);
    // Second sweep 2 minutes later: BOTH guilds see ~2 elapsed minutes (no shared-clock zeroing).
    await sweepVoiceXp(client, prisma, 'g1', t0 + 120_000);
    await sweepVoiceXp(client, prisma, 'g2', t0 + 120_000);
    // Reaching the config read for both guilds on the second sweep proves the
    // per-guild clock: with the old module-level clock, g2's second call would
    // compute elapsed=0 (g1's call updated the shared clock) and bail before the read.
    expect(calls.filter((g) => g === 'g2').length).toBeGreaterThanOrEqual(1);
  });
});
```

ADAPTATION NOTES: read `src/bot/voiceXp.ts` FIRST. (a) The level-config read goes through `getLevelConfig` (singleton prisma via `src/db/leveling.ts`) — if so, the `prisma` param fake above won't see it; instead extend the hoisted `fakePrisma` with the model/method `getLevelConfig` actually uses (mirror `tests/premium-gates-features.test.ts`, which already solved exactly this for `levelConfig.upsert`) and assert on that. The essential assertion stands: g2's SECOND call must reach the config read. (b) If a `_reset` helper for the sweep clock already exists under another name, use it; otherwise export `_resetVoiceXpClock`. (c) The early-bail condition is `elapsedMin <= 0 || elapsedMin > 10` — keep it per guild.

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/scheduler-sweep.test.ts` → FAIL (`runSchedulerSweep`/`_resetVoiceXpClock` missing).

- [ ] **Step 3: Implement the scheduler sweep.** In `src/bot/scheduler.ts`:

a) Split the deps types — `SchedulerDeps` loses `guildId`; the per-guild tick keeps it:

```ts
export interface SchedulerDeps {
  client: Client;
  prisma: PrismaClient;
  /** Optional RapidAPI creds enabling the TikTok creator-announce source. */
  rapidApiKey?: string;
  rapidApiTikTokHost?: string;
}

export interface GuildTickDeps extends SchedulerDeps {
  guildId: string;
}
```

b) `runSchedulerTick(deps: GuildTickDeps, state: TickState)` — ONLY the type annotation changes; the body stays byte-identical (the tenant-isolation test must keep passing unchanged).

c) New sweep + startScheduler:

```ts
/**
 * Multi-guild sweep: run the (tenant-isolated) per-guild tick once for every
 * guild the shared bot is currently in, each with its own TickState. One
 * guild's failure never blocks the others. State for departed guilds is pruned.
 */
export async function runSchedulerSweep(deps: SchedulerDeps, states: Map<string, TickState>): Promise<void> {
  for (const guildId of deps.client.guilds.cache.keys()) {
    let state = states.get(guildId);
    if (!state) {
      state = createTickState();
      states.set(guildId, state);
    }
    await runSchedulerTick({ ...deps, guildId }, state).catch((err) =>
      logger.error(`Scheduler tick failed for guild ${guildId}: ${err}`),
    );
  }
  for (const guildId of states.keys()) {
    if (!deps.client.guilds.cache.has(guildId)) states.delete(guildId);
  }
}

export function startScheduler(deps: SchedulerDeps, intervalMs = 60_000): NodeJS.Timeout {
  const states = new Map<string, TickState>();
  const handle = setInterval(() => void runSchedulerSweep(deps, states), intervalMs);
  handle.unref?.();
  return handle;
}
```

d) In `src/index.ts`, drop `guildId` from the startScheduler deps:

```ts
    startScheduler: () =>
      startScheduler({
        client,
        prisma,
        rapidApiKey: config.rapidApiKey,
        rapidApiTikTokHost: config.rapidApiTikTokHost,
      }),
```

e) `tests/scheduler.test.ts`'s startScheduler test passes `guildId: 'g1'` in an `as any` deps object — an extra property is harmless; only update it if tsc/the test actually complains.

- [ ] **Step 4: Implement the per-guild voiceXp clock.** In `src/bot/voiceXp.ts`, replace the module-level `let lastSweep` (line ~10) with:

```ts
// Per-guild sweep clock: each guild's elapsed window is independent (a shared
// clock would zero out every guild after the first one in the same sweep).
const lastSweep = new Map<string, number>();

/** Test helper. */
export function _resetVoiceXpClock(): void {
  lastSweep.clear();
}
```

and inside `sweepVoiceXp` swap the reads/writes: `const prev = lastSweep.get(guildId); lastSweep.set(guildId, now);` keeping the existing baseline (`if (!prev) return 0`) and gap (`elapsedMin <= 0 || elapsedMin > 10`) semantics per guild.

- [ ] **Step 5: Verify** — `npx vitest run tests/scheduler-sweep.test.ts tests/scheduler.test.ts tests/scheduler-tenant-isolation.test.ts tests/premium-gates-features.test.ts` → PASS (the isolation test exercises `runSchedulerTick` directly and must be untouched). Full suite + tsc green/clean.

- [ ] **Step 6: Commit**

```bash
git add src/bot/scheduler.ts src/bot/voiceXp.ts src/index.ts tests/scheduler-sweep.test.ts
git commit -m "feat(saas): scheduler sweeps every guild with per-guild state + voiceXp clock (multiguild A2a)"
```

---

### Task 7: Final verification

- [ ] **Full suite:** `npx vitest run` — green (expect ~+15 tests over 372).
- [ ] **Type check + build:** `npm run build` — clean.
- [ ] **Owner-experience check (critical):** the owner guild must behave EXACTLY as before — it is in `client.guilds.cache`, so: reconcile gives it settings (already exist) + subscription (already `custom`, `update:{}` never touches it) + stats allowlist (already allowed — Set, idempotent); the sweep ticks it with its own state (same tasks as today); global commands replace guild commands with the same 56-command set. Grep the diff for anything that could differ for the owner guild and list findings.
- [ ] **Review the diff:** `git diff fe3baa8..HEAD` — no schema changes at all in this plan; no unrelated files staged.
- [ ] Do NOT push — أ2b (dashboard multi-tenant) lands next; one push ships both.

## Out of scope (later plans)

- أ2b: multi-guild dashboard (auth/picker/tenantContext/Prisma tenant guard/requireOwner + the two A1 follow-ups recorded in the A1 plan).
- Stage ب: payments, receipts, grace/expiry lifecycle, `left`-row 30-day cleanup task, upgrade page.
- Stage د: custom-bot fleet (TenantRegistry, token vault, wizard).
