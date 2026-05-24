import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createTagsRouter } from '../src/api/routes/tags';

function deps(existing: unknown = null) {
  return {
    config: { guildId: 'g1' },
    prisma: {
      tag: {
        findMany: vi.fn().mockResolvedValue([{ id: 't1', name: 'rules', content: 'be nice' }]),
        findUnique: vi.fn().mockResolvedValue(existing),
        create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 't1', ...data })),
      },
    },
  } as any;
}
function app(d: any) {
  const a = express();
  a.use(express.json());
  a.use('/api/tags', createTagsRouter(d));
  return a;
}

describe('tags route', () => {
  it('GET / lists tags', async () => {
    const res = await request(app(deps())).get('/api/tags').expect(200);
    expect(res.body.tags).toHaveLength(1);
  });
  it('POST / creates a tag (lowercased name)', async () => {
    const res = await request(app(deps())).post('/api/tags').send({ name: 'Rules', content: 'hi' }).expect(201);
    expect(res.body.name).toBe('rules');
  });
  it('POST / 400s without name/content', async () => {
    await request(app(deps())).post('/api/tags').send({ name: 'x' }).expect(400);
  });
  it('POST / 409s on duplicate name', async () => {
    await request(app(deps({ id: 't0', name: 'rules' }))).post('/api/tags').send({ name: 'rules', content: 'hi' }).expect(409);
  });
});
