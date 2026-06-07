/**
 * plan-limits-api.test.ts
 *
 * TDD: verifies the create-time plan limits across the two representative routers
 * (tags = simple count, giveaways = filtered count with Discord side-effect guard).
 *
 * Surfaces covered:
 *   - The singleton `prisma` (vi.mock) is intercepted by getPlan → subscription.findUnique
 *   - Each router's injected `deps.prisma` carries the model fakes (including `count`)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Hoist the singleton prisma mock (used by getPlan / subscriptions.ts) ──────
const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: { subscription: { findUnique: vi.fn() } },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { createTagsRouter } from '../src/api/routes/tags';
import { createGiveawaysRouter } from '../src/api/routes/giveaways';
import { _resetPlans } from '../src/db/subscriptions';

// ── helpers ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  _resetPlans();
  fakePrisma.subscription.findUnique.mockResolvedValue(null); // free guild by default
});

// ── TAGS ───────────────────────────────────────────────────────────────────────

function makeTagsDeps(countValue: number, existing: unknown = null) {
  return {
    config: { guildId: 'g1' },
    prisma: {
      tag: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(existing),
        create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 't1', ...data })),
        count: vi.fn().mockResolvedValue(countValue),
      },
    },
  } as any;
}

function tagsApp(d: any) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { (req as any).tenant = { guildId: 'g1' }; next(); });
  a.use('/api/tags', createTagsRouter(d));
  return a;
}

describe('tags create-limit gate (free plan cap = 10)', () => {
  it('free guild AT cap (count=10) → 403 with upgrade:true and limit:10', async () => {
    const d = makeTagsDeps(10);
    const res = await request(tagsApp(d))
      .post('/api/tags')
      .send({ name: 'hello', content: 'world' })
      .expect(403);
    expect(res.body.upgrade).toBe(true);
    expect(res.body.limit).toBe(10);
    expect(d.prisma.tag.create).not.toHaveBeenCalled();
  });

  it('free guild UNDER cap (count=9) → create succeeds (201)', async () => {
    const d = makeTagsDeps(9);
    const res = await request(tagsApp(d))
      .post('/api/tags')
      .send({ name: 'hello', content: 'world' })
      .expect(201);
    expect(d.prisma.tag.create).toHaveBeenCalledOnce();
    expect(res.body.name).toBe('hello');
  });

  it('400 validation errors still win over the limit check (missing content)', async () => {
    const d = makeTagsDeps(10);
    await request(tagsApp(d))
      .post('/api/tags')
      .send({ name: 'hello' }) // no content
      .expect(400);
    // count should NOT have been called — validation is first
    expect(d.prisma.tag.count).not.toHaveBeenCalled();
  });

  it('premium guild with huge count (5000) → create succeeds', async () => {
    _resetPlans();
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
    const d = makeTagsDeps(5000);
    await request(tagsApp(d))
      .post('/api/tags')
      .send({ name: 'hello', content: 'world' })
      .expect(201);
    expect(d.prisma.tag.create).toHaveBeenCalledOnce();
  });
});

// ── GIVEAWAYS ─────────────────────────────────────────────────────────────────

function makeGiveawaysDeps(activeCount: number) {
  const channel = { isTextBased: () => true, send: vi.fn().mockResolvedValue({ id: 'm1' }) };
  return {
    config: { guildId: 'g1' },
    client: { channels: { cache: { get: vi.fn().mockReturnValue(channel) } } },
    prisma: {
      giveaway: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ id: 'gw1', entrants: [], winners: [], ended: false, ...data }),
        ),
        update: vi.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ id: 'gw1', channelId: 'c1', prize: 'x', winnerCount: 1, endsAt: new Date(), entrants: [], winners: [], ended: false, ...data }),
        ),
        count: vi.fn().mockResolvedValue(activeCount),
      },
    },
  } as any;
}

function giveawaysApp(d: any) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { (req as any).tenant = { guildId: 'g1' }; next(); });
  a.use('/api/giveaways', createGiveawaysRouter(d));
  return a;
}

const validGiveawayPayload = { channelId: 'c1', prize: 'Nitro', winnerCount: 1, duration: '1h' };

describe('giveaways create-limit gate (free plan cap = 1 active)', () => {
  it('free guild with 1 active giveaway → 403 with upgrade:true', async () => {
    const d = makeGiveawaysDeps(1);
    const res = await request(giveawaysApp(d))
      .post('/api/giveaways')
      .send(validGiveawayPayload)
      .expect(403);
    expect(res.body.upgrade).toBe(true);
    expect(res.body.limit).toBe(1);
  });

  it('count is called with { guildId, ended: false } when the gate fires', async () => {
    const d = makeGiveawaysDeps(1);
    await request(giveawaysApp(d))
      .post('/api/giveaways')
      .send(validGiveawayPayload)
      .expect(403);
    expect(d.prisma.giveaway.count).toHaveBeenCalledWith({
      where: { guildId: 'g1', ended: false },
    });
  });

  it('NO Discord channel work happens when the gate blocks (channel.send not called)', async () => {
    const d = makeGiveawaysDeps(1);
    await request(giveawaysApp(d))
      .post('/api/giveaways')
      .send(validGiveawayPayload)
      .expect(403);
    // The channel should not even have been looked up, or at minimum send must not be called
    expect(d.client.channels.cache.get().send).not.toHaveBeenCalled();
    expect(d.prisma.giveaway.create).not.toHaveBeenCalled();
  });

  it('free guild with 0 active giveaways → create succeeds (201)', async () => {
    const d = makeGiveawaysDeps(0);
    const res = await request(giveawaysApp(d))
      .post('/api/giveaways')
      .send(validGiveawayPayload)
      .expect(201);
    expect(res.body.messageId).toBe('m1');
    expect(d.prisma.giveaway.create).toHaveBeenCalledOnce();
  });

  it('premium guild with 5000 active giveaways → create succeeds', async () => {
    _resetPlans();
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
    const d = makeGiveawaysDeps(5000);
    const res = await request(giveawaysApp(d))
      .post('/api/giveaways')
      .send(validGiveawayPayload)
      .expect(201);
    expect(d.prisma.giveaway.create).toHaveBeenCalledOnce();
    expect(res.body.messageId).toBe('m1');
  });

  it('400 validation errors still win (missing prize)', async () => {
    const d = makeGiveawaysDeps(1);
    await request(giveawaysApp(d))
      .post('/api/giveaways')
      .send({ channelId: 'c1', winnerCount: 1, duration: '1h' }) // no prize
      .expect(400);
    expect(d.prisma.giveaway.count).not.toHaveBeenCalled();
  });
});
