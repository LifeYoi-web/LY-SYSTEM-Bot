import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: {
    subscription: { findUnique: vi.fn().mockResolvedValue(null) },
    levelConfig: { upsert: vi.fn().mockResolvedValue({ enabled: false, voiceXpEnabled: false }) },
  },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { runSchedulerSweep, createTickState } from '../src/bot/scheduler';
import { sweepVoiceXp, _resetVoiceXpClock } from '../src/bot/voiceXp';
import { _resetPlans } from '../src/db/subscriptions';

beforeEach(() => {
  _resetPlans();
  _resetVoiceXpClock();
  fakePrisma.subscription.findUnique.mockResolvedValue(null); // free by default
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
    // Set up premium for the voice XP gate to pass
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
    // Seed the levelConfig singleton cache with an enabled config for both guilds so the
    // function reaches past the config check. The cache is module-level and won't be
    // cleared by beforeEach, so we prime it via upsert on the first call.
    fakePrisma.levelConfig.upsert.mockResolvedValue({
      enabled: true,
      voiceXpEnabled: true,
      voiceXpPerMinute: 10,
      multiplier: 1,
      ignoredVoiceChannelIds: [],
    });

    // Build a client with a spy on guilds.cache.get — the voice loop calls this AFTER
    // the elapsed-window check passes, so tracking which guildIds reach guild-lookup
    // tells us whether the per-guild clock correctly gave each guild its own baseline.
    const guildCacheGetSpy = vi.fn().mockReturnValue(undefined); // no actual guild channels needed
    const client = {
      guilds: { cache: { get: guildCacheGetSpy, keys: () => [].values() } },
    } as any;
    const t0 = 1_000_000;

    // First sweep: establishes per-guild baseline (returns 0 — first run, no prev).
    expect(await sweepVoiceXp(client, {} as any, 'g1', t0)).toBe(0);
    expect(await sweepVoiceXp(client, {} as any, 'g2', t0)).toBe(0);

    // Clear the spy before the second sweep so we only track second-sweep calls.
    guildCacheGetSpy.mockClear();

    // Second sweep 2 minutes later: BOTH guilds must get past the elapsed-window check
    // and reach client.guilds.cache.get(guildId) (which is called only after elapsed check).
    await sweepVoiceXp(client, {} as any, 'g1', t0 + 120_000);
    await sweepVoiceXp(client, {} as any, 'g2', t0 + 120_000);

    // Both guilds should have reached the guild-lookup (post elapsed check).
    // With the old shared module clock, g1's second call would update the shared clock
    // to t0+120_000 and g2's second call would see elapsed≈0 and bail before guild-lookup.
    const lookedUp = guildCacheGetSpy.mock.calls.map(([id]: [string]) => id);
    expect(lookedUp).toContain('g1');
    expect(lookedUp).toContain('g2');
  });
});
