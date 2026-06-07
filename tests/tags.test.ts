import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// planLimit calls getPlan which reads the singleton prisma.subscription — mock it
// so this test stays isolated. plan: 'custom' → Infinity → count check always passes.
const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: { subscription: { findUnique: vi.fn().mockResolvedValue({ plan: 'custom' }) } },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { createTagsRouter } from '../src/api/routes/tags';

function deps(existing: unknown = null) {
  return {
    config: { guildId: 'g1' },
    prisma: {
      tag: {
        findMany: vi.fn().mockResolvedValue([{ id: 't1', name: 'rules', content: 'be nice' }]),
        findUnique: vi.fn().mockResolvedValue(existing),
        create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 't1', ...data })),
        count: vi.fn().mockResolvedValue(0),
      },
    },
  } as any;
}
function app(d: any) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { (req as any).tenant = { guildId: 'g1' }; next(); });
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
