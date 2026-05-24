import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createOverviewRouter } from '../src/api/routes/overview';

function fakeDeps() {
  const guild = {
    name: 'My Server',
    memberCount: 42,
    channels: { cache: { size: 12 } },
  };
  return {
    config: { guildId: 'g1' },
    client: { guilds: { cache: { get: (id: string) => (id === 'g1' ? guild : undefined) } } },
  } as any;
}

describe('overview route', () => {
  it('returns server stats', async () => {
    const app = express();
    app.use('/api/overview', createOverviewRouter(fakeDeps()));
    const res = await request(app).get('/api/overview').expect(200);
    expect(res.body).toMatchObject({ name: 'My Server', memberCount: 42, channelCount: 12, recentLogs: [] });
  });

  it('503s when the guild is unavailable', async () => {
    const deps = fakeDeps();
    deps.config.guildId = 'missing';
    const app = express();
    app.use('/api/overview', createOverviewRouter(deps));
    await request(app).get('/api/overview').expect(503);
  });
});
