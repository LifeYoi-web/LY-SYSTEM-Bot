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

// No tick task should ever reach the network in this test; if one does, it gets a dead response.
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
  const gB = {
    id: 'gB',
    memberCount: 3,
    channels: { cache: new Map() },
    roles: { cache: new Map() },
    voiceStates: { cache: new Map() },
  };
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
