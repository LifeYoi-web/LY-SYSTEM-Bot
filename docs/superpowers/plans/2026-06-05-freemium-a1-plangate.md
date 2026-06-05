# Freemium أ1 — PlanGate & Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the entitlements core of the freemium model (spec `docs/superpowers/specs/2026-06-05-freemium-tiers-design.md` §3.1/§4): a `Subscription` row per guild, a cached `getPlan`, the `entitlements.ts` matrix, and enforcement at every existing premium feature + create-limit — with the owner guild seeded `custom` so **nothing changes for the live bot**.

**Architecture:** One pure matrix module (`src/shared/entitlements.ts`) is the single source of truth. A cached DB lookup (`src/db/subscriptions.ts`, mirrors `settingsCache`) resolves a guild's plan (fail-open to cached value, unknown → `free`). Three thin enforcement layers consume them: bot-side (`src/bot/premium.ts` upsell + a premium-command map in `interactionCreate`), API-side (middleware + create-limit checks in POST handlers), and a daily transcript-retention sweep. Multi-guild itself is plan أ2 — here the only guild is the owner's (`custom`), so all gates pass in production while tests pin the free/premium behavior.

**Tech Stack:** TypeScript (CommonJS), discord.js v14, Prisma v7 (additive schema only), Vitest + supertest.

---

## Pre-existing context an engineer needs

- Run tests: `npx vitest run tests/<name>.test.ts`; all: `npx vitest run` (currently 323 tests / 49 files, green). Type check: `npx tsc --noEmit`.
- Conventions: deps injection, `logger` not `console`, Arabic user-facing strings, LY orange `0xf57c00`, commits straight to `main` (push only with explicit user approval).
- Schema is **additive only** (`prisma db push --accept-data-loss` on deploy — never rename/drop).
- `src/db/*.ts` helpers import the prisma **singleton** from `src/db/prisma.ts`. Route files instead receive `deps.prisma` + `deps.config` (see `src/api/routes/tags.ts` for the canonical shape; tests build the router with a fake prisma + supertest — see `tests/tags.test.ts`).
- `tests/scheduler-tenant-isolation.test.ts` mocks `src/db/prisma` with a recording proxy and asserts every bulk query in a scheduler tick carries `where.guildId` — your changes must keep it green (plan reads are `findUnique` by guildId; the new prune sweep uses `deleteMany({ where: { guildId, … } })` — both compliant).
- Do NOT stage the unrelated dirty items (`.gitignore` modification, untracked `no bg.png`, `scratch/`).

## File structure (locked decisions)

| File | Responsibility |
|------|----------------|
| `prisma/schema.prisma` | + `Subscription` model (additive) |
| `src/shared/entitlements.ts` (new) | Pure tier matrix: `Plan`, `FEATURES`, `LIMITS`, `hasFeature`, `limitFor` |
| `src/db/subscriptions.ts` (new) | Cached `getPlan` / `setPlan` / `seedOwnerPlan` (fail-open), invalidation |
| `src/bot/premium.ts` (new) | `featureAllowed`, Arabic `upsellReply` payload |
| `src/bot/events/interactionCreate.ts` | Premium-command map gate (music) + `mu:` button gate |
| `src/bot/voiceXp.ts`, `src/bot/events/voiceStateUpdate.ts`, `src/bot/creator/poll.ts`, `src/bot/tickets.ts` | Feature gates (voiceXp / tempVoice / creatorAlerts / aiSummaries) |
| `src/api/middleware/entitlements.ts` (new) | `requireFeature` middleware + `planLimit` helper |
| `src/api/routes/entitlements.ts` (new) | `GET /api/entitlements` for the SPA |
| 10 existing routers | create-limit checks (4-line pattern) |
| `src/bot/scheduler-tasks.ts` + `scheduler.ts` | daily `pruneOldTranscripts` sweep |
| `web/src/lib/hooks.ts` + 4 pages | `useEntitlements` + lock banners |

---

### Task 1: `Subscription` model + cached plan lookup

**Files:**
- Modify: `prisma/schema.prisma` (append)
- Create: `src/db/subscriptions.ts`
- Create: `tests/subscriptions.test.ts`

- [ ] **Step 1: Append the model to `prisma/schema.prisma`**

```prisma
// ---- SaaS subscriptions (freemium tiers — spec 2026-06-05) ----
model Subscription {
  guildId   String    @id
  plan      String    @default("free") // free | premium | custom
  status    String    @default("active") // active | grace | expired | left (lifecycle lands in stage B)
  expiresAt DateTime? // null = never (free tier / owner lifetime)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([plan])
}
```

Run: `npx prisma generate` — must succeed (client gains `prisma.subscription`).

- [ ] **Step 2: Write the failing test**

Create `tests/subscriptions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fakePrisma } = vi.hoisted(() => {
  const fakePrisma = {
    subscription: {
      findUnique: vi.fn(),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
  return { fakePrisma };
});
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { getPlan, setPlan, seedOwnerPlan, invalidatePlan, _resetPlans } from '../src/db/subscriptions';

beforeEach(() => {
  _resetPlans();
  fakePrisma.subscription.findUnique.mockReset();
  fakePrisma.subscription.upsert.mockClear();
});

describe('getPlan', () => {
  it('returns the stored plan and caches it', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue({ guildId: 'g1', plan: 'premium' });
    expect(await getPlan('g1')).toBe('premium');
    expect(await getPlan('g1')).toBe('premium');
    expect(fakePrisma.subscription.findUnique).toHaveBeenCalledTimes(1); // cached
  });

  it('defaults to free when no row exists', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue(null);
    expect(await getPlan('g-new')).toBe('free');
  });

  it('fails OPEN to the cached plan on DB error (paying guild never loses premium on a blip)', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValueOnce({ guildId: 'g1', plan: 'premium' });
    expect(await getPlan('g1')).toBe('premium');
    invalidatePlan('g1'); // force a re-read…
    fakePrisma.subscription.findUnique.mockRejectedValueOnce(new Error('db down'));
    // …but the stale entry was dropped by invalidate, so simulate the TTL-expiry path instead:
    fakePrisma.subscription.findUnique.mockResolvedValueOnce({ guildId: 'g1', plan: 'premium' });
    expect(await getPlan('g1')).toBe('premium');
  });

  it('fails SAFE to free when there is no cache and the DB errors', async () => {
    fakePrisma.subscription.findUnique.mockRejectedValue(new Error('db down'));
    expect(await getPlan('g-cold')).toBe('free');
  });

  it('keeps the last-known plan when the TTL refresh hits a DB error', async () => {
    vi.useFakeTimers();
    try {
      fakePrisma.subscription.findUnique.mockResolvedValueOnce({ guildId: 'g1', plan: 'premium' });
      expect(await getPlan('g1')).toBe('premium');
      vi.advanceTimersByTime(6 * 60_000); // past the 5-min TTL
      fakePrisma.subscription.findUnique.mockRejectedValueOnce(new Error('db down'));
      expect(await getPlan('g1')).toBe('premium'); // stale-but-served
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('setPlan / seedOwnerPlan', () => {
  it('setPlan upserts and invalidates the cache', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue({ guildId: 'g1', plan: 'free' });
    await getPlan('g1');
    await setPlan('g1', 'premium');
    expect(fakePrisma.subscription.upsert).toHaveBeenCalledWith({
      where: { guildId: 'g1' },
      update: { plan: 'premium' },
      create: { guildId: 'g1', plan: 'premium' },
    });
    fakePrisma.subscription.findUnique.mockResolvedValue({ guildId: 'g1', plan: 'premium' });
    expect(await getPlan('g1')).toBe('premium'); // cache was invalidated → re-read
  });

  it('seedOwnerPlan creates custom only when missing (never overwrites)', async () => {
    await seedOwnerPlan('g-owner');
    expect(fakePrisma.subscription.upsert).toHaveBeenCalledWith({
      where: { guildId: 'g-owner' },
      update: {},
      create: { guildId: 'g-owner', plan: 'custom' },
    });
  });
});
```

- [ ] **Step 3: Run to verify it fails** — `npx vitest run tests/subscriptions.test.ts` → FAIL (module missing).

- [ ] **Step 4: Implement `src/db/subscriptions.ts`**

```ts
import { prisma } from './prisma';

export type Plan = 'free' | 'premium' | 'custom';

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { plan: Plan; at: number }>();

function asPlan(value: string | undefined | null): Plan {
  return value === 'premium' || value === 'custom' ? value : 'free';
}

/**
 * A guild's plan, cached ~5 min. Fail-open: on a DB error the last-known cached
 * plan is served (a paying guild must never lose premium on an infra blip);
 * a cold cache + DB error fails safe to 'free'.
 */
export async function getPlan(guildId: string): Promise<Plan> {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.plan;
  try {
    const row = await prisma.subscription.findUnique({ where: { guildId } });
    const plan = asPlan(row?.plan);
    cache.set(guildId, { plan, at: Date.now() });
    return plan;
  } catch {
    if (hit) {
      hit.at = Date.now(); // serve stale, retry next TTL
      return hit.plan;
    }
    return 'free';
  }
}

/** Owner/dashboard writes a plan; cache invalidated so the change is immediate. */
export async function setPlan(guildId: string, plan: Plan): Promise<void> {
  await prisma.subscription.upsert({ where: { guildId }, update: { plan }, create: { guildId, plan } });
  invalidatePlan(guildId);
}

/** Boot seeding: the owner guild gets a lifetime 'custom' row — created once, never overwritten. */
export async function seedOwnerPlan(guildId: string): Promise<void> {
  await prisma.subscription.upsert({ where: { guildId }, update: {}, create: { guildId, plan: 'custom' } });
  invalidatePlan(guildId);
}

export function invalidatePlan(guildId: string): void {
  cache.delete(guildId);
}

/** Test helper. */
export function _resetPlans(): void {
  cache.clear();
}
```

- [ ] **Step 5: Run to verify it passes** — `npx vitest run tests/subscriptions.test.ts` → PASS (7). Then `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/db/subscriptions.ts tests/subscriptions.test.ts
git commit -m "feat(saas): Subscription model + cached fail-open getPlan (freemium A1)"
```

---

### Task 2: `entitlements.ts` — the tier matrix

**Files:**
- Create: `src/shared/entitlements.ts`
- Create: `tests/entitlements.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/entitlements.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hasFeature, limitFor, FEATURES, LIMITS, PLAN_RANK } from '../src/shared/entitlements';

describe('entitlements matrix', () => {
  it('free lacks premium features; premium and custom have them', () => {
    expect(hasFeature('free', 'music')).toBe(false);
    expect(hasFeature('premium', 'music')).toBe(true);
    expect(hasFeature('custom', 'music')).toBe(true);
    expect(hasFeature('free', 'voiceXp')).toBe(false);
    expect(hasFeature('free', 'creatorAlerts')).toBe(false);
    expect(hasFeature('free', 'aiSummaries')).toBe(false);
    expect(hasFeature('free', 'tempVoice')).toBe(false);
    expect(hasFeature('free', 'welcomeStyles')).toBe(false);
    expect(hasFeature('free', 'welcomeCustomBg')).toBe(false);
  });

  it('limits follow the spec §4 launch defaults', () => {
    expect(limitFor('free', 'tags')).toBe(10);
    expect(limitFor('free', 'autoResponses')).toBe(5);
    expect(limitFor('free', 'rolePanels')).toBe(2);
    expect(limitFor('free', 'scheduledMessages')).toBe(3);
    expect(limitFor('free', 'statCounters')).toBe(2);
    expect(limitFor('free', 'savedEmbeds')).toBe(5);
    expect(limitFor('free', 'shopItems')).toBe(5);
    expect(limitFor('free', 'ticketTypes')).toBe(1);
    expect(limitFor('free', 'activeGiveaways')).toBe(1);
    expect(limitFor('free', 'applicationForms')).toBe(1);
    expect(limitFor('free', 'transcriptRetentionDays')).toBe(7);
    expect(limitFor('premium', 'tags')).toBe(Infinity);
    expect(limitFor('custom', 'ticketTypes')).toBe(Infinity);
  });

  it('every feature key maps to a plan present in PLAN_RANK, every limit covers all plans', () => {
    for (const plan of Object.values(FEATURES)) expect(PLAN_RANK[plan]).toBeDefined();
    for (const perPlan of Object.values(LIMITS)) {
      expect(Object.keys(perPlan).sort()).toEqual(['custom', 'free', 'premium']);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/entitlements.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/shared/entitlements.ts`**

```ts
// Single source of truth for the freemium tier matrix (spec 2026-06-05 §4).
// Pure data + helpers — no I/O. Plan resolution lives in src/db/subscriptions.ts.

export type Plan = 'free' | 'premium' | 'custom';

export const PLAN_RANK: Record<Plan, number> = { free: 0, premium: 1, custom: 2 };

/** Premium-gated features: the minimum plan that unlocks each. */
export type FeatureKey =
  | 'music'
  | 'tempVoice'
  | 'voiceXp'
  | 'creatorAlerts'
  | 'aiSummaries'
  | 'welcomeStyles' // the 9-style gallery (free keeps 'classic')
  | 'welcomeCustomBg';

export const FEATURES: Record<FeatureKey, Plan> = {
  music: 'premium',
  tempVoice: 'premium',
  voiceXp: 'premium',
  creatorAlerts: 'premium',
  aiSummaries: 'premium',
  welcomeStyles: 'premium',
  welcomeCustomBg: 'premium',
};

/** Create-time caps per plan (launch defaults — adjust here only). */
export type LimitKey =
  | 'tags'
  | 'autoResponses'
  | 'rolePanels'
  | 'scheduledMessages'
  | 'statCounters'
  | 'savedEmbeds'
  | 'shopItems'
  | 'ticketTypes'
  | 'activeGiveaways'
  | 'applicationForms'
  | 'transcriptRetentionDays';

const UNLIMITED = Infinity;

export const LIMITS: Record<LimitKey, Record<Plan, number>> = {
  tags: { free: 10, premium: UNLIMITED, custom: UNLIMITED },
  autoResponses: { free: 5, premium: UNLIMITED, custom: UNLIMITED },
  rolePanels: { free: 2, premium: UNLIMITED, custom: UNLIMITED },
  scheduledMessages: { free: 3, premium: UNLIMITED, custom: UNLIMITED },
  statCounters: { free: 2, premium: UNLIMITED, custom: UNLIMITED },
  savedEmbeds: { free: 5, premium: UNLIMITED, custom: UNLIMITED },
  shopItems: { free: 5, premium: UNLIMITED, custom: UNLIMITED },
  ticketTypes: { free: 1, premium: UNLIMITED, custom: UNLIMITED },
  activeGiveaways: { free: 1, premium: UNLIMITED, custom: UNLIMITED },
  applicationForms: { free: 1, premium: UNLIMITED, custom: UNLIMITED },
  transcriptRetentionDays: { free: 7, premium: UNLIMITED, custom: UNLIMITED },
};

export function hasFeature(plan: Plan, key: FeatureKey): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[FEATURES[key]];
}

export function limitFor(plan: Plan, key: LimitKey): number {
  return LIMITS[key][plan];
}
```

Note: `Plan` is re-declared in `src/db/subscriptions.ts` from Task 1 — change that file to `import type { Plan } from '../shared/entitlements';` and `export type { Plan };` so there is ONE definition (entitlements is the source; subscriptions re-exports for convenience).

- [ ] **Step 4: Run to verify** — `npx vitest run tests/entitlements.test.ts tests/subscriptions.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/shared/entitlements.ts src/db/subscriptions.ts tests/entitlements.test.ts
git commit -m "feat(saas): entitlements tier matrix — features + launch limits (freemium A1)"
```

---

### Task 3: Bot-side guard — `src/bot/premium.ts` + boot seeding

**Files:**
- Create: `src/bot/premium.ts`
- Create: `tests/premium.test.ts`
- Modify: `src/index.ts` (seed the owner plan at boot)

- [ ] **Step 1: Write the failing test**

Create `tests/premium.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: { subscription: { findUnique: vi.fn() } },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { featureAllowed, upsellReply } from '../src/bot/premium';
import { _resetPlans } from '../src/db/subscriptions';

beforeEach(() => {
  _resetPlans();
  fakePrisma.subscription.findUnique.mockReset();
});

describe('featureAllowed', () => {
  it('false for a free guild on a premium feature', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue(null);
    expect(await featureAllowed('g1', 'music')).toBe(false);
  });
  it('true for a premium guild', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
    expect(await featureAllowed('g1', 'music')).toBe(true);
  });
});

describe('upsellReply', () => {
  it('is an ephemeral Arabic embed with an upgrade link button', () => {
    const payload = upsellReply('الموسيقى');
    expect(payload.flags).toBeDefined();
    const embed = payload.embeds[0].toJSON();
    expect(embed.title).toContain('بريميوم');
    expect(embed.description).toContain('الموسيقى');
    expect(payload.components).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/premium.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/bot/premium.ts`**

```ts
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { getPlan } from '../db/subscriptions';
import { hasFeature, type FeatureKey } from '../shared/entitlements';

const ORANGE = 0xf57c00;

/** True when the guild's plan unlocks the feature (plan is cached — cheap on hot paths). */
export async function featureAllowed(guildId: string, key: FeatureKey): Promise<boolean> {
  return hasFeature(await getPlan(guildId), key);
}

/** Standard Arabic upsell payload for gated slash commands / buttons. */
export function upsellReply(featureLabel: string) {
  const url = process.env.DASHBOARD_URL || 'https://discord.com';
  const embed = new EmbedBuilder()
    .setColor(ORANGE)
    .setTitle('🔒 ميزة بريميوم')
    .setDescription(`**${featureLabel}** متاحة في باقة بريميوم.\nرقِّ سيرفرك من لوحة التحكم وافتح كل المميزات.`);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel('⬆️ ترقية الباقة').setStyle(ButtonStyle.Link).setURL(url),
  );
  return { embeds: [embed], components: [row], flags: MessageFlags.Ephemeral } as const;
}
```

- [ ] **Step 4: Seed the owner plan at boot.** In `src/index.ts`: add `import { seedOwnerPlan } from './db/subscriptions';` and change the `ensureGuildSettings` boot dep from

```ts
    ensureGuildSettings,
```

to

```ts
    ensureGuildSettings: async (gid: string) => {
      await ensureGuildSettings(gid);
      await seedOwnerPlan(gid); // owner guild = lifetime custom (created once, never overwritten)
    },
```

- [ ] **Step 5: Verify** — `npx vitest run tests/premium.test.ts` → PASS (3). `npx tsc --noEmit` → clean. `npx vitest run` → all green.

- [ ] **Step 6: Commit**

```bash
git add src/bot/premium.ts tests/premium.test.ts src/index.ts
git commit -m "feat(saas): bot-side premium guard + Arabic upsell + owner seeding (freemium A1)"
```

---

### Task 4: Gate music in `interactionCreate` (commands map + `mu:` buttons)

**Files:**
- Modify: `src/bot/premium.ts` (the map + gate fn live HERE — `interactionCreate.ts` uses `module.exports` for the event contract, so adding ES `export`s there breaks the loader/type-check)
- Modify: `src/bot/events/interactionCreate.ts` (two one-line call sites)
- Create: `tests/premium-gate-interactions.test.ts`

The dispatcher in `interactionCreate.ts` looks up `commands.get(interaction.commandName)` then calls `execute`. Add a gate just before that call, and the same check at the `mu:` button branch (search for `customId.startsWith('mu:')`).

- [ ] **Step 1: Write the failing test**

Create `tests/premium-gate-interactions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: { subscription: { findUnique: vi.fn() } },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { gatePremiumCommand, PREMIUM_COMMANDS } from '../src/bot/premium';
import { _resetPlans } from '../src/db/subscriptions';

beforeEach(() => {
  _resetPlans();
  fakePrisma.subscription.findUnique.mockReset();
});

describe('premium command gating', () => {
  it('maps all 13 music commands to the music feature', () => {
    const music = ['play', 'skip', 'pause', 'resume', 'stop', 'disconnect', 'queue', 'nowplaying', 'volume', 'loop', 'shuffle', 'seek', 'lyrics'];
    for (const name of music) expect(PREMIUM_COMMANDS[name]?.key).toBe('music');
  });

  it('blocks a music command for a free guild with the upsell reply', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue(null); // free
    const reply = vi.fn().mockResolvedValue(undefined);
    const blocked = await gatePremiumCommand({ commandName: 'play', guildId: 'g1', reply } as any);
    expect(blocked).toBe(true);
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0][0].embeds[0].toJSON().title).toContain('بريميوم');
  });

  it('lets a premium guild through', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
    const reply = vi.fn();
    expect(await gatePremiumCommand({ commandName: 'play', guildId: 'g1', reply } as any)).toBe(false);
    expect(reply).not.toHaveBeenCalled();
  });

  it('ignores non-premium commands and DMs', async () => {
    const reply = vi.fn();
    expect(await gatePremiumCommand({ commandName: 'ping', guildId: 'g1', reply } as any)).toBe(false);
    expect(await gatePremiumCommand({ commandName: 'play', guildId: null, reply } as any)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/premium-gate-interactions.test.ts` → FAIL (exports missing).

- [ ] **Step 3: Implement — append to `src/bot/premium.ts`**

```ts
/** Slash commands that require a plan — one map entry per future premium command. */
export const PREMIUM_COMMANDS: Record<string, { key: FeatureKey; label: string }> = Object.fromEntries(
  ['play', 'skip', 'pause', 'resume', 'stop', 'disconnect', 'queue', 'nowplaying', 'volume', 'loop', 'shuffle', 'seek', 'lyrics'].map(
    (name) => [name, { key: 'music' as FeatureKey, label: 'الموسيقى' }],
  ),
);

/** Returns true when the interaction was blocked (upsell already sent). */
export async function gatePremiumCommand(interaction: {
  commandName: string;
  guildId: string | null;
  reply: (payload: unknown) => Promise<unknown>;
}): Promise<boolean> {
  const gate = PREMIUM_COMMANDS[interaction.commandName];
  if (!gate || !interaction.guildId) return false;
  if (await featureAllowed(interaction.guildId, gate.key)) return false;
  await interaction.reply(upsellReply(gate.label)).catch(() => undefined);
  return true;
}
```

(`FeatureKey` is already imported in this file from Task 3; extend that import if needed. Do NOT add exports to `interactionCreate.ts` — it uses `module.exports` for the event contract and mixing ES exports there breaks the loader.)

Then in `src/bot/events/interactionCreate.ts`, add to the imports `import { gatePremiumCommand, featureAllowed, upsellReply } from '../premium';` and, inside the slash-command dispatch branch (where the handler does `const command = commands.get(interaction.commandName)` before `command.execute(...)`), insert:

```ts
    if (await gatePremiumCommand(interaction)) return;
```

And in the `mu:` button branch (where `customId.startsWith('mu:')` is handled), insert before the existing handling:

```ts
    if (interaction.guildId && !(await featureAllowed(interaction.guildId, 'music'))) {
      await interaction.reply(upsellReply('الموسيقى')).catch(() => undefined);
      return;
    }
```

- [ ] **Step 4: Verify** — `npx vitest run tests/premium-gate-interactions.test.ts` → PASS. Full suite + `npx tsc --noEmit` → green/clean.

- [ ] **Step 5: Commit**

```bash
git add src/bot/premium.ts src/bot/events/interactionCreate.ts tests/premium-gate-interactions.test.ts
git commit -m "feat(saas): central premium-command gate — music commands + mu: buttons (freemium A1)"
```

---

### Task 5: Gate voiceXp / tempVoice / creatorAlerts / aiSummaries at their entry points

**Files:**
- Modify: `src/bot/voiceXp.ts` (top of `sweepVoiceXp`)
- Modify: `src/bot/events/voiceStateUpdate.ts` (before temp-channel creation)
- Modify: `src/bot/creator/poll.ts` (top of `pollCreatorContent`)
- Modify: `src/bot/tickets.ts` (the fire-and-forget AI summary call in `closeTicket`)
- Create: `tests/premium-gates-features.test.ts`

Each gate is ONE early-return line using `featureAllowed` from `src/bot/premium.ts`. Find the exact insertion points by reading each file; the gate goes after cheap argument checks but before any work:

```ts
// sweepVoiceXp(client, prisma, guildId) — first line of the function body:
  if (!(await featureAllowed(guildId, 'voiceXp'))) return 0;

// voiceStateUpdate — right after the handler resolves the guild and confirms cfg.enabled,
// before any channel create/move logic:
  if (!(await featureAllowed(guild.id, 'tempVoice'))) return;

// pollCreatorContent(deps) — first line of the function body:
  if (!(await featureAllowed(deps.guildId, 'creatorAlerts'))) return 0;

// closeTicket — wrap the existing aiEnabled(...) fire-and-forget summary call:
  if (aiEnabled(config) && (await featureAllowed(guildId, 'aiSummaries'))) { /* existing call */ }
```

(Each function already has `guildId`/`guild`/`deps.guildId` in scope; adjust the variable name to match the file. If `closeTicket` receives no `guildId` directly, it has the ticket row — use `ticket.guildId`.)

- [ ] **Step 1: Write the failing test**

Create `tests/premium-gates-features.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: { subscription: { findUnique: vi.fn() } },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { sweepVoiceXp } from '../src/bot/voiceXp';
import { pollCreatorContent } from '../src/bot/creator/poll';
import { _resetPlans } from '../src/db/subscriptions';

beforeEach(() => {
  _resetPlans();
  fakePrisma.subscription.findUnique.mockResolvedValue(null); // free
});

describe('premium feature gates (free guild)', () => {
  it('sweepVoiceXp is a no-op for a free guild (no level reads at all)', async () => {
    const prisma = { levelConfig: { findUnique: vi.fn() } } as any;
    const client = { guilds: { cache: new Map() } } as any;
    const n = await sweepVoiceXp(client, prisma, 'g-free');
    expect(n).toBe(0);
    expect(prisma.levelConfig.findUnique).not.toHaveBeenCalled();
  });

  it('pollCreatorContent is a no-op for a free guild', async () => {
    const deps = { client: {} as any, prisma: { creatorAnnounceConfig: { findUnique: vi.fn() } } as any, guildId: 'g-free' };
    const n = await pollCreatorContent(deps as any);
    expect(n).toBe(0);
  });

  it('both run for a premium guild', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
    const client = { guilds: { cache: new Map() } } as any;
    const prisma = { levelConfig: { findUnique: vi.fn().mockResolvedValue(null) } } as any;
    // premium passes the gate; the function then no-ops for its own reasons (no config/guild)
    await expect(sweepVoiceXp(client, prisma, 'g-prem')).resolves.toBeDefined();
  });
});
```

(Note: if `sweepVoiceXp` / `pollCreatorContent` read config through `src/db/*` singleton helpers instead of the injected prisma, the `vi.mock` above already intercepts them — adapt the "not called" assertion to whichever client the function actually uses; the essential assertions are `n === 0` for free and no throw for premium. The tempVoice and aiSummaries gates are exercised by reading the diff in review — their handlers are not unit-testable without heavy Discord fakes, and the gate line is identical to the two tested here.)

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/premium-gates-features.test.ts` → FAIL (gates missing → functions do work / throw on fakes).

- [ ] **Step 3: Add the four gate lines** as described above (one per file). Import `featureAllowed` from the right relative path in each (`../premium` from events/, `./premium` from bot root files, `../premium` from creator/).

- [ ] **Step 4: Verify** — `npx vitest run tests/premium-gates-features.test.ts` → PASS. Full suite green — **including `tests/scheduler-tenant-isolation.test.ts`** (the tick now also records `subscription.findUnique({ where: { guildId: 'g1' } })` — compliant) and `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/bot/voiceXp.ts src/bot/events/voiceStateUpdate.ts src/bot/creator/poll.ts src/bot/tickets.ts tests/premium-gates-features.test.ts
git commit -m "feat(saas): gate voiceXp/tempVoice/creatorAlerts/aiSummaries by plan (freemium A1)"
```

---

### Task 6: API middleware + `GET /api/entitlements`

**Files:**
- Create: `src/api/middleware/entitlements.ts`
- Create: `src/api/routes/entitlements.ts`
- Modify: `src/api/server.ts` (mount)
- Create: `tests/entitlements-api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/entitlements-api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: { subscription: { findUnique: vi.fn() } },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { requireFeature, planLimit } from '../src/api/middleware/entitlements';
import { createEntitlementsRouter } from '../src/api/routes/entitlements';
import { _resetPlans } from '../src/db/subscriptions';

beforeEach(() => {
  _resetPlans();
  fakePrisma.subscription.findUnique.mockReset();
});

function appWith(mw: any, guildId = 'g1') {
  const a = express();
  a.use('/gated', mw, (_req, res) => res.json({ ok: true }));
  a.use('/api/entitlements', createEntitlementsRouter({ config: { guildId } } as any));
  return a;
}

describe('requireFeature middleware', () => {
  it('403 + upgrade flag for a free guild', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue(null);
    const res = await request(appWith(requireFeature('music', () => 'g1'))).get('/gated').expect(403);
    expect(res.body.upgrade).toBe(true);
    expect(res.body.feature).toBe('music');
  });
  it('passes a premium guild through', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
    await request(appWith(requireFeature('music', () => 'g1'))).get('/gated').expect(200);
  });
});

describe('planLimit', () => {
  it('returns the free cap and Infinity for premium', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue(null);
    expect(await planLimit('g1', 'tags')).toBe(10);
    _resetPlans();
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
    expect(await planLimit('g1', 'tags')).toBe(Infinity);
  });
});

describe('GET /api/entitlements', () => {
  it('returns plan + feature booleans + JSON-safe limits (Infinity → null)', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue(null);
    const res = await request(appWith(requireFeature('music', () => 'g1'))).get('/api/entitlements').expect(200);
    expect(res.body.plan).toBe('free');
    expect(res.body.features.music).toBe(false);
    expect(res.body.limits.tags).toBe(10);
    _resetPlans();
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
    const res2 = await request(appWith(requireFeature('music', () => 'g1'))).get('/api/entitlements').expect(200);
    expect(res2.body.features.music).toBe(true);
    expect(res2.body.limits.tags).toBeNull(); // Infinity is not JSON — null = unlimited
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/entitlements-api.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/api/middleware/entitlements.ts`**

```ts
import type { RequestHandler } from 'express';
import { getPlan } from '../../db/subscriptions';
import { hasFeature, limitFor, type FeatureKey, type LimitKey } from '../../shared/entitlements';

/**
 * 403 + { upgrade: true } when the guild's plan lacks the feature.
 * Mount AFTER requireStaff. `getGuildId` is a thunk so A2 can swap in the
 * session-selected guild without touching call sites.
 */
export function requireFeature(key: FeatureKey, getGuildId: () => string): RequestHandler {
  return async (_req, res, next) => {
    if (hasFeature(await getPlan(getGuildId()), key)) return next();
    res.status(403).json({ error: 'premium feature', upgrade: true, feature: key });
  };
}

/** The numeric cap for a guild+limit (Infinity = unlimited). For POST-handler checks. */
export async function planLimit(guildId: string, key: LimitKey): Promise<number> {
  return limitFor(await getPlan(guildId), key);
}
```

- [ ] **Step 4: Implement `src/api/routes/entitlements.ts`**

```ts
import { Router } from 'express';
import type { AppConfig } from '../../shared/config';
import { getPlan } from '../../db/subscriptions';
import { FEATURES, LIMITS, hasFeature, limitFor, type FeatureKey, type LimitKey } from '../../shared/entitlements';

export interface EntitlementsDeps {
  config: Pick<AppConfig, 'guildId'>;
}

/** The SPA reads this once per session to render lock badges + limit counters. */
export function createEntitlementsRouter(deps: EntitlementsDeps): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    const plan = await getPlan(deps.config.guildId);
    const features = Object.fromEntries(
      (Object.keys(FEATURES) as FeatureKey[]).map((k) => [k, hasFeature(plan, k)]),
    );
    const limits = Object.fromEntries(
      (Object.keys(LIMITS) as LimitKey[]).map((k) => {
        const v = limitFor(plan, k);
        return [k, Number.isFinite(v) ? v : null]; // Infinity is not JSON — null = unlimited
      }),
    );
    res.json({ plan, features, limits });
  });
  return router;
}
```

- [ ] **Step 5: Mount in `src/api/server.ts`** — add the import and, next to the other `app.use('/api/…', requireStaff(), …)` lines:

```ts
  app.use('/api/entitlements', requireStaff(), createEntitlementsRouter({ config: deps.config }));
```

- [ ] **Step 6: Verify** — `npx vitest run tests/entitlements-api.test.ts` → PASS. Full suite + tsc → green/clean.

- [ ] **Step 7: Commit**

```bash
git add src/api/middleware/entitlements.ts src/api/routes/entitlements.ts src/api/server.ts tests/entitlements-api.test.ts
git commit -m "feat(saas): requireFeature middleware + GET /api/entitlements (freemium A1)"
```

---

### Task 7: API premium gates — tempvoice & creatorannounce routers, welcome style/bg, voiceXp fields

**Files:**
- Modify: `src/api/server.ts` (2 mounts gain `requireFeature`)
- Modify: `src/api/routes/settings.ts` (welcome style/bg gate inside PUT)
- Modify: `src/api/routes/leveling.ts` (voiceXp fields gate inside its config PUT)
- Create: `tests/premium-gates-api.test.ts`

- [ ] **Step 1: Gate the two whole-feature routers in `src/api/server.ts`** — change the two mounts:

```ts
  app.use('/api/tempvoice', requireStaff(), requireFeature('tempVoice', () => deps.config.guildId), createTempVoiceRouter(deps));
  app.use('/api/creatorannounce', requireStaff(), requireFeature('creatorAlerts', () => deps.config.guildId), createCreatorAnnounceRouter(deps));
```

(import `requireFeature` from `./middleware/entitlements`; match the actual creatorannounce mount path/name already in the file.)

- [ ] **Step 2: Write the failing tests**

Create `tests/premium-gates-api.test.ts` — test the two PUT-level gates through the real routers (read each router's deps shape first and mirror its existing test file for fakes; `tests/settings.test.ts` and `tests/leveling.test.ts` show the exact fakes):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: { subscription: { findUnique: vi.fn() } },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { _resetPlans } from '../src/db/subscriptions';

beforeEach(() => {
  _resetPlans();
  fakePrisma.subscription.findUnique.mockResolvedValue(null); // free
});

// Settings: a free guild cannot set a non-classic welcome card style nor a custom BG.
describe('settings welcome gates (free guild)', () => {
  it('PUT with welcomeCardStyle != classic → 403 upgrade', async () => {
    const { createSettingsRouter } = await import('../src/api/routes/settings');
    const a = express();
    a.use(express.json());
    a.use('/api/settings', createSettingsRouter({ config: { guildId: 'g1' } } as any));
    const res = await request(a).put('/api/settings').send({ welcomeCardStyle: 'neon' }).expect(403);
    expect(res.body.upgrade).toBe(true);
  });

  it('PUT with welcomeCardBg → 403 upgrade; classic style passes the gate', async () => {
    const { createSettingsRouter } = await import('../src/api/routes/settings');
    const a = express();
    a.use(express.json());
    a.use('/api/settings', createSettingsRouter({ config: { guildId: 'g1' } } as any));
    await request(a).put('/api/settings').send({ welcomeCardBg: 'data:image/png;base64,AAAA' }).expect(403);
    // classic must NOT be blocked by the gate (route may still 200/500 depending on fakes —
    // assert only that it is not the 403-upgrade rejection):
    const res = await request(a).put('/api/settings').send({ welcomeCardStyle: 'classic' });
    expect(res.status).not.toBe(403);
  });
});

describe('leveling voiceXp gate (free guild)', () => {
  it('PUT enabling voiceXp → 403 upgrade', async () => {
    const { createLevelingRouter } = await import('../src/api/routes/leveling');
    const a = express();
    a.use(express.json());
    a.use('/api/leveling', createLevelingRouter({ prisma: fakePrisma, config: { guildId: 'g1' } } as any));
    const res = await request(a).put('/api/leveling/config').send({ voiceXpEnabled: true }).expect(403);
    expect(res.body.upgrade).toBe(true);
  });
});
```

**Adapt the request paths/bodies to the routers' real endpoints** (read `src/api/routes/settings.ts` and `src/api/routes/leveling.ts` first — e.g. the leveling config PUT may be `/config` or `/`; the settings router may need a prisma fake in deps. Mirror their existing test files; the assertions that matter are: free → 403 `{upgrade:true}` when the gated field is present, and the same request without gated fields is NOT 403).

- [ ] **Step 3: Implement the two field gates.** In each PUT handler, after body parsing and before persisting:

```ts
// settings.ts PUT — only when the request actually tries to set a gated field:
import { getPlan } from '../../db/subscriptions';
import { hasFeature } from '../../shared/entitlements';
// …inside the handler:
const plan = await getPlan(guildId);
if (b.welcomeCardStyle !== undefined && String(b.welcomeCardStyle) !== 'classic' && !hasFeature(plan, 'welcomeStyles')) {
  return res.status(403).json({ error: 'premium feature', upgrade: true, feature: 'welcomeStyles' });
}
if (b.welcomeCardBg !== undefined && b.welcomeCardBg !== null && !hasFeature(plan, 'welcomeCustomBg')) {
  return res.status(403).json({ error: 'premium feature', upgrade: true, feature: 'welcomeCustomBg' });
}
```

```ts
// leveling.ts config PUT — same shape:
const plan = await getPlan(guildId);
if (b.voiceXpEnabled === true && !hasFeature(plan, 'voiceXp')) {
  return res.status(403).json({ error: 'premium feature', upgrade: true, feature: 'voiceXp' });
}
```

(`b` = the parsed body variable each handler already has; adjust names to the file.)

- [ ] **Step 4: Verify** — `npx vitest run tests/premium-gates-api.test.ts` → PASS, plus the routers' existing test files still green (`tests/settings.test.ts`, `tests/leveling.test.ts`, `tests/tickets-route.test.ts` etc. may construct these routers — if any existing test now hits a gate, it is because the fake subscription returns free: add `subscription: { findUnique: vi.fn().mockResolvedValue({ plan: 'custom' }) }` to that test's prisma fake — do NOT weaken the gate). Full suite + tsc green/clean.

- [ ] **Step 5: Commit**

```bash
git add src/api/server.ts src/api/routes/settings.ts src/api/routes/leveling.ts tests/premium-gates-api.test.ts
git commit -m "feat(saas): API premium gates — tempvoice/creator routers, welcome style/bg, voiceXp (freemium A1)"
```

---

### Task 8: Create-limits in 10 routers

**Files:**
- Modify: 10 router files (list below)
- Create: `tests/plan-limits-api.test.ts`

The identical 4-line pattern, inserted in each create handler **after validation, before the `create` call** (import `planLimit` from `../middleware/entitlements` in each):

```ts
    const limit = await planLimit(guildId, '<LIMIT_KEY>');
    if ((await prisma.<MODEL>.count({ where: <COUNT_WHERE> })) >= limit) {
      return res.status(403).json({ error: 'limit reached', upgrade: true, limit });
    }
```

Exact substitutions (verify each router's actual create endpoint + model while editing):

| Router file | LIMIT_KEY | MODEL | COUNT_WHERE |
|---|---|---|---|
| `src/api/routes/tags.ts` (POST /) | `tags` | `tag` | `{ guildId }` |
| `src/api/routes/autoresponders.ts` (POST) | `autoResponses` | `autoResponse` | `{ guildId }` |
| `src/api/routes/rolepanels.ts` (POST) | `rolePanels` | `rolePanel` | `{ guildId }` |
| `src/api/routes/scheduled.ts` (POST) | `scheduledMessages` | `scheduledMessage` | `{ guildId }` |
| `src/api/routes/statcounters.ts` (POST) | `statCounters` | `statCounter` | `{ guildId }` |
| `src/api/routes/embeds.ts` (POST) | `savedEmbeds` | `savedEmbed` | `{ guildId }` |
| `src/api/routes/shop.ts` (item create POST) | `shopItems` | `shopItem` | `{ guildId }` |
| `src/api/routes/tickets.ts` (ticket-TYPE create POST) | `ticketTypes` | `ticketType` | `{ guildId }` |
| `src/api/routes/giveaways.ts` (giveaway create POST) | `activeGiveaways` | `giveaway` | `{ guildId, ended: false }` |
| `src/api/routes/applications.ts` (form create POST) | `applicationForms` | `applicationForm` | `{ guildId }` |

- [ ] **Step 1: Write the failing tests**

Create `tests/plan-limits-api.test.ts` — cover the pattern end-to-end on TWO representative routers (tags = simple count, giveaways = filtered count), free-blocked + premium-unlimited + free-under-limit:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: { subscription: { findUnique: vi.fn() } },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { createTagsRouter } from '../src/api/routes/tags';
import { createGiveawaysRouter } from '../src/api/routes/giveaways';
import { _resetPlans } from '../src/db/subscriptions';

beforeEach(() => {
  _resetPlans();
  fakePrisma.subscription.findUnique.mockResolvedValue(null); // free
});

function tagsApp(count: number) {
  const a = express();
  a.use(express.json());
  a.use(
    '/api/tags',
    createTagsRouter({
      config: { guildId: 'g1' },
      prisma: {
        tag: {
          count: vi.fn().mockResolvedValue(count),
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 't', ...data })),
        },
      },
    } as any),
  );
  return a;
}

describe('create limits (tags)', () => {
  it('free guild at the cap (10) → 403 with the limit echoed', async () => {
    const res = await request(tagsApp(10)).post('/api/tags').send({ name: 'x', content: 'y' }).expect(403);
    expect(res.body).toMatchObject({ upgrade: true, limit: 10 });
  });
  it('free guild under the cap creates fine', async () => {
    await request(tagsApp(9)).post('/api/tags').send({ name: 'x', content: 'y' }).expect(201);
  });
  it('premium guild is unlimited', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
    await request(tagsApp(5000)).post('/api/tags').send({ name: 'x', content: 'y' }).expect(201);
  });
});

describe('create limits (active giveaways — filtered count)', () => {
  it('free guild with 1 active giveaway is blocked from a second', async () => {
    const countFn = vi.fn().mockResolvedValue(1);
    const a = express();
    a.use(express.json());
    a.use(
      '/api/giveaways',
      createGiveawaysRouter({
        config: { guildId: 'g1' },
        client: { channels: { cache: new Map() } },
        prisma: { giveaway: { count: countFn, create: vi.fn() } },
      } as any),
    );
    const res = await request(a)
      .post('/api/giveaways')
      .send({ channelId: 'c1', prize: 'x', winnerCount: 1, minutes: 60 })
      .expect(403);
    expect(res.body.upgrade).toBe(true);
    expect(countFn).toHaveBeenCalledWith({ where: { guildId: 'g1', ended: false } });
  });
});
```

**Adapt the giveaways deps/body to the real router** (read `src/api/routes/giveaways.ts` + `tests/giveaways.test.ts` for the actual create payload/validation; the limit check must run BEFORE channel validation so the test doesn't need a working channel fake — if the router validates the channel first, place the gate immediately after body parsing instead and adjust).

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/plan-limits-api.test.ts` → FAIL.

- [ ] **Step 3: Apply the 4-line pattern to all 10 routers** per the table. While in each file, confirm the handler's local `guildId`/`prisma` names and reuse them.

- [ ] **Step 4: Verify** — `npx vitest run tests/plan-limits-api.test.ts` → PASS. **Full suite**: any pre-existing router test that now trips a limit gets the `subscription: { findUnique: … { plan: 'custom' } }` fake added (same rule as Task 7 — never weaken the gate). `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/api/routes/tags.ts src/api/routes/autoresponders.ts src/api/routes/rolepanels.ts src/api/routes/scheduled.ts src/api/routes/statcounters.ts src/api/routes/embeds.ts src/api/routes/shop.ts src/api/routes/tickets.ts src/api/routes/giveaways.ts src/api/routes/applications.ts tests/plan-limits-api.test.ts
git commit -m "feat(saas): create-time plan limits across 10 routers (freemium A1)"
```

---

### Task 9: Free-tier transcript retention sweep (7 days)

**Files:**
- Modify: `src/bot/scheduler-tasks.ts` (new task fn)
- Modify: `src/bot/scheduler.ts` (`TickState` + wire into `runSchedulerTick`, daily)
- Modify: `tests/scheduler.test.ts` (TickState default) — only if it asserts the shape
- Create: `tests/transcript-retention.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/transcript-retention.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: { subscription: { findUnique: vi.fn() } },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { pruneOldTranscripts } from '../src/bot/scheduler-tasks';
import { _resetPlans } from '../src/db/subscriptions';

beforeEach(() => _resetPlans());

describe('pruneOldTranscripts', () => {
  it('free guild: deletes transcripts older than 7 days, guild-scoped', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue(null); // free
    const deleteMany = vi.fn().mockResolvedValue({ count: 3 });
    const deps = { prisma: { ticketTranscript: { deleteMany } }, guildId: 'g1', client: {} } as any;
    const n = await pruneOldTranscripts(deps, new Date('2026-06-05T00:00:00Z'));
    expect(n).toBe(3);
    const arg = deleteMany.mock.calls[0][0];
    expect(arg.where.guildId).toBe('g1');
    expect(arg.where.createdAt.lt.toISOString()).toBe('2026-05-29T00:00:00.000Z'); // now - 7d
  });

  it('premium guild: never deletes', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
    const deleteMany = vi.fn();
    const deps = { prisma: { ticketTranscript: { deleteMany } }, guildId: 'g1', client: {} } as any;
    expect(await pruneOldTranscripts(deps as any)).toBe(0);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/transcript-retention.test.ts` → FAIL.

- [ ] **Step 3: Implement.** In `src/bot/scheduler-tasks.ts` (imports at top: `getPlan` from `../db/subscriptions`, `limitFor` from `../shared/entitlements`):

```ts
/** Free tier keeps ticket transcripts 7 days (spec §4); paid plans keep forever. */
export async function pruneOldTranscripts(deps: TaskDeps, now: Date = new Date()): Promise<number> {
  const days = limitFor(await getPlan(deps.guildId), 'transcriptRetentionDays');
  if (!Number.isFinite(days)) return 0;
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const res = await deps.prisma.ticketTranscript.deleteMany({
    where: { guildId: deps.guildId, createdAt: { lt: cutoff } },
  });
  return res.count;
}
```

(If `TicketTranscript` has no `createdAt` column, check the model — it may be `closedAt` or similar; use the actual timestamp column and mirror it in the test.)

In `src/bot/scheduler.ts`: add `lastTranscriptPruneKey: string` to `TickState` (+ `''` in `createTickState()`), import `pruneOldTranscripts`, and add to `runSchedulerTick` next to the birthday daily block:

```ts
  // Transcript retention (free tier): once per UTC day.
  if (dayKey !== state.lastTranscriptPruneKey) {
    state.lastTranscriptPruneKey = dayKey;
    await pruneOldTranscripts(deps).catch((err) => logger.error(`Transcript prune error: ${err}`));
  }
```

(`dayKey` already exists in the birthday block scope — place this immediately after it so it reuses the variable.)

- [ ] **Step 4: Verify** — `npx vitest run tests/transcript-retention.test.ts tests/scheduler.test.ts tests/scheduler-tenant-isolation.test.ts` → PASS (the isolation test sees `ticketTranscript.deleteMany` with `where.guildId: 'g1'` — compliant by design). Full suite + tsc green/clean.

- [ ] **Step 5: Commit**

```bash
git add src/bot/scheduler-tasks.ts src/bot/scheduler.ts tests/transcript-retention.test.ts
git commit -m "feat(saas): free-tier transcript retention sweep — 7 days (freemium A1)"
```

---

### Task 10: SPA — `useEntitlements` + lock banners

**Files:**
- Modify: `web/src/lib/hooks.ts` (or wherever `useMe` lives — add the hook beside it)
- Create: `web/src/components/PremiumLock.tsx`
- Modify: `web/src/pages/TempVoice.tsx`, `web/src/pages/CreatorAnnounce.tsx`, `web/src/pages/Welcome.tsx`, `web/src/pages/Leveling.tsx` (exact page filenames may differ — find them in `web/src/pages/`)

No vitest here (the web app has no test runner) — verification is `npm --prefix web run build` + the existing manual-preview flow.

- [ ] **Step 1: Add the hook** next to `useMe` in `web/src/lib/hooks.ts`, following its exact fetch/state pattern:

```tsx
export interface Entitlements {
  plan: 'free' | 'premium' | 'custom';
  features: Record<string, boolean>;
  limits: Record<string, number | null>;
}

export function useEntitlements() {
  const [ent, setEnt] = useState<Entitlements | null>(null);
  useEffect(() => {
    let alive = true;
    api<Entitlements>('/entitlements')
      .then((e) => alive && setEnt(e))
      .catch(() => alive && setEnt(null));
    return () => {
      alive = false;
    };
  }, []);
  return ent;
}
```

(Use the file's existing `api()` helper signature — read `web/src/lib/api.ts` and mirror how other hooks call it.)

- [ ] **Step 2: Create `web/src/components/PremiumLock.tsx`** — an RTL banner shown when a feature is locked:

```tsx
export function PremiumLock({ feature, ent }: { feature: string; ent: { features: Record<string, boolean> } | null }) {
  if (!ent || ent.features[feature] !== false) return null;
  return (
    <div
      style={{
        background: 'rgba(245,124,0,0.08)',
        border: '1px solid #f57c00',
        borderRadius: 12,
        padding: '14px 18px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span style={{ fontSize: 20 }}>🔒</span>
      <div style={{ flex: 1 }}>
        <strong>ميزة بريميوم</strong>
        <div style={{ opacity: 0.75, fontSize: 13 }}>هذه الميزة متاحة في باقة بريميوم — رقِّ سيرفرك لفتحها.</div>
      </div>
      <span style={{ color: '#f57c00', fontWeight: 700 }}>⬆️ ترقية</span>
    </div>
  );
}
```

(Match the project's styling idiom — if pages use CSS classes instead of inline styles, mirror an existing alert/banner component's classes. The upgrade CTA becomes a real link in stage ب; for now it is visual.)

- [ ] **Step 3: Apply on the 4 pages.** At the top of each page component:

```tsx
const ent = useEntitlements();
// in JSX, right under the page title:
<PremiumLock feature="tempVoice" ent={ent} />
```

with the matching feature key per page: `tempVoice`, `creatorAlerts`, `welcomeStyles` (Welcome page), `voiceXp` (Leveling page — place the banner near the voice-XP section, not the whole page). On the Welcome page, additionally disable non-classic style options when `ent?.features.welcomeStyles === false` (add `disabled` + a 🔒 suffix to the style options in the picker; classic stays enabled).

- [ ] **Step 4: Verify** — `npm --prefix web run build` → clean build. `npx vitest run` (unchanged backend) → green.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat(saas): dashboard entitlements hook + premium lock banners (freemium A1)"
```

---

### Task 11: Final verification

- [ ] **Full suite:** `npx vitest run` — green (expect ~+20 tests over 323).
- [ ] **Type check + builds:** `npm run build` (prisma generate → tsc → web build) — clean. This also exercises `prisma generate` with the new model.
- [ ] **Owner-experience check (critical):** the seeded owner guild must behave EXACTLY as before — grep the diff for any gate that doesn't pass `custom`: every `featureAllowed`/`hasFeature` call passes for `custom` by construction (`PLAN_RANK.custom = 2` ≥ all), every limit is `Infinity`. Run the bot locally if possible (`npm run build && npm start`) and spot-check `/play` works and the dashboard pages show no lock banners.
- [ ] **Review the diff:** `git diff <base>..HEAD` — no schema renames/drops (additive only), no unrelated files staged.
- [ ] **Push (user approval required):** after approval, `git push` → Railway deploys; `prisma db push` creates the `Subscription` table automatically; watch `/api/health` + bot online.

## Out of scope (later plans)

- أ2: global command registration, guildCreate/Delete lifecycle, multi-guild dashboard (auth/picker/tenantContext/Prisma guard/requireOwner), stats registration for N guilds.
- Stage ب: Customer/PaymentRecord models, receipts, owner approval flow, grace/expiry lifecycle, upgrade page the CTA links to.
- Stage ج: the five launch exclusives.
