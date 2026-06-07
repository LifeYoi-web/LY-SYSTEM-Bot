import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// planLimit calls getPlan which reads the singleton prisma.subscription — mock it
// so this test stays isolated. plan: 'custom' → Infinity → count check always passes.
const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: { subscription: { findUnique: vi.fn().mockResolvedValue({ plan: 'custom' }) } },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { createGiveawaysRouter } from '../src/api/routes/giveaways';

function deps() {
  const channel = { isTextBased: () => true, send: vi.fn().mockResolvedValue({ id: 'm1' }) };
  return {
    config: { guildId: 'g1' },
    client: { channels: { cache: { get: () => channel } } },
    prisma: {
      giveaway: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'gw1', entrants: [], winners: [], ...data })),
        update: vi
          .fn()
          .mockImplementation(({ data }: any) =>
            Promise.resolve({ id: 'gw1', channelId: 'c1', prize: 'x', winnerCount: 1, endsAt: new Date(), entrants: [], winners: [], ...data }),
          ),
        count: vi.fn().mockResolvedValue(0),
      },
    },
  } as any;
}
function app(d: any) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { (req as any).tenant = { guildId: 'g1' }; next(); });
  a.use('/api/giveaways', createGiveawaysRouter(d));
  return a;
}

describe('giveaways route', () => {
  it('POST / creates + posts a giveaway and stores the message id', async () => {
    const d = deps();
    const res = await request(app(d)).post('/api/giveaways').send({ channelId: 'c1', prize: 'Nitro', winnerCount: 2, duration: '1h' }).expect(201);
    expect(res.body.messageId).toBe('m1');
    expect(d.client.channels.cache.get().send).toHaveBeenCalled();
  });
  it('POST / 400s on a bad duration', async () => {
    await request(app(deps())).post('/api/giveaways').send({ channelId: 'c1', prize: 'x', winnerCount: 1, duration: 'soon' }).expect(400);
  });
  it('POST / 400s on bad winnerCount', async () => {
    await request(app(deps())).post('/api/giveaways').send({ channelId: 'c1', prize: 'x', winnerCount: 0, duration: '1h' }).expect(400);
  });
  it('POST / 400s without a prize', async () => {
    await request(app(deps())).post('/api/giveaways').send({ channelId: 'c1', winnerCount: 1, duration: '1h' }).expect(400);
  });
});
