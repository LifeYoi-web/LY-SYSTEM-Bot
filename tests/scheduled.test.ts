import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createScheduledRouter } from '../src/api/routes/scheduled';

function deps() {
  return {
    config: { guildId: 'g1' },
    prisma: {
      scheduledMessage: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 's1', ...data })),
      },
    },
  } as any;
}
function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/scheduled', createScheduledRouter(deps()));
  return a;
}

describe('scheduled route', () => {
  it('creates with valid data', async () => {
    const runAt = new Date(Date.now() + 3_600_000).toISOString();
    const res = await request(app()).post('/api/scheduled').send({ channelId: 'c1', content: 'hi', runAt }).expect(201);
    expect(res.body).toMatchObject({ channelId: 'c1', content: 'hi', repeat: 'none' });
  });
  it('rejects an invalid date', async () => {
    await request(app()).post('/api/scheduled').send({ channelId: 'c1', content: 'hi', runAt: 'nope' }).expect(400);
  });
  it('rejects missing content', async () => {
    await request(app()).post('/api/scheduled').send({ channelId: 'c1', runAt: new Date().toISOString() }).expect(400);
  });
  it('rejects an invalid repeat', async () => {
    const runAt = new Date().toISOString();
    await request(app()).post('/api/scheduled').send({ channelId: 'c1', content: 'x', runAt, repeat: 'hourly' }).expect(400);
  });
});
