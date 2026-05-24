import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createLogsRouter } from '../src/api/routes/logs';

function deps() {
  return {
    config: { guildId: 'g1' },
    prisma: {
      logEntry: {
        findMany: vi.fn().mockResolvedValue([{ id: 'l1', type: 'mod_ban', data: {} }]),
        count: vi.fn().mockResolvedValue(1),
      },
    },
  } as any;
}

describe('logs route', () => {
  it('returns paginated logs with a type filter', async () => {
    const d = deps();
    const app = express();
    app.use('/api/logs', createLogsRouter(d));
    const res = await request(app).get('/api/logs?type=mod_ban&limit=10&page=1').expect(200);
    expect(res.body).toMatchObject({ total: 1, page: 1, limit: 10, pages: 1 });
    expect(res.body.logs).toHaveLength(1);
    expect(d.prisma.logEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { guildId: 'g1', type: 'mod_ban' }, take: 10, skip: 0 }),
    );
  });

  it('clamps limit and computes skip from page', async () => {
    const d = deps();
    const app = express();
    app.use('/api/logs', createLogsRouter(d));
    await request(app).get('/api/logs?limit=999&page=3').expect(200);
    expect(d.prisma.logEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { guildId: 'g1' }, take: 100, skip: 200 }),
    );
  });
});
