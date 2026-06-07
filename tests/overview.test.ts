import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createOverviewRouter } from '../src/api/routes/overview';

function fakeDeps() {
  const guild = {
    name: 'My Server',
    memberCount: 42,
    iconURL: () => 'https://cdn.discordapp.com/icon.png',
    channels: { cache: { size: 12 } },
    roles: { cache: { size: 5 } },
    premiumTier: 2,
    premiumSubscriptionCount: 7,
    members: { cache: { values: () => [{ user: { bot: false } }, { user: { bot: true } }] } },
  };
  const prisma = {
    moderationCase: { count: vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(10) },
    dailyStat: { findFirst: vi.fn().mockResolvedValue({ joins: 4, messages: 100 }) },
    logEntry: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return {
    config: { guildId: 'g1' },
    client: { guilds: { cache: { get: (id: string) => (id === 'g1' ? guild : undefined) } } },
    prisma,
  } as any;
}

describe('overview route', () => {
  it('returns enriched server stats', async () => {
    const app = express();
    app.use((req, _res, next) => { (req as any).tenant = { guildId: 'g1' }; next(); });
    app.use('/api/overview', createOverviewRouter(fakeDeps()));
    const res = await request(app).get('/api/overview').expect(200);
    expect(res.body).toMatchObject({
      name: 'My Server',
      memberCount: 42,
      botCount: 1,
      humanCount: 41,
      channelCount: 12,
      roleCount: 5,
      boostLevel: 2,
      boostCount: 7,
      activeCases: 3,
      totalCases: 10,
      todayJoins: 4,
      recentLogs: [],
    });
  });

  it('503s when the guild is unavailable', async () => {
    const deps = fakeDeps();
    const app = express();
    app.use((req, _res, next) => { (req as any).tenant = { guildId: 'missing' }; next(); });
    app.use('/api/overview', createOverviewRouter(deps));
    await request(app).get('/api/overview').expect(503);
  });
});
