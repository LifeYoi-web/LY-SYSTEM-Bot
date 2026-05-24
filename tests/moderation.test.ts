import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createModerationRouter } from '../src/api/routes/moderation';

function fakeDeps(withGuild = true) {
  const member = { timeout: vi.fn().mockResolvedValue(undefined) };
  const guild = {
    members: {
      ban: vi.fn().mockResolvedValue(undefined),
      kick: vi.fn().mockResolvedValue(undefined),
      unban: vi.fn().mockResolvedValue(undefined),
      fetch: vi.fn().mockResolvedValue(member),
    },
  };
  const prisma = {
    moderationCase: {
      create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'c1', ...data })),
      update: vi.fn().mockImplementation(({ where, data }: any) => Promise.resolve({ id: where.id, ...data })),
      findUnique: vi.fn().mockResolvedValue({ id: 'c1', guildId: 'g1', targetUserId: 'u1', type: 'ban', active: true }),
      findMany: vi.fn().mockResolvedValue([{ id: 'c1', type: 'warn' }]),
    },
    logEntry: { create: vi.fn().mockResolvedValue(undefined) },
  };
  return {
    client: { guilds: { cache: { get: (id: string) => (withGuild && id === 'g1' ? guild : undefined) } } },
    prisma,
    config: { guildId: 'g1' },
  } as any;
}

function app(deps: any) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).session = { user: { id: 'mod1', authorized: true } };
    next();
  });
  a.use('/api/moderation', createModerationRouter(deps));
  return a;
}

describe('moderation router', () => {
  it('POST /ban performs the ban and returns 201 with a case', async () => {
    const deps = fakeDeps();
    const res = await request(app(deps)).post('/api/moderation/ban').send({ userId: 'u1', reason: 'spam' }).expect(201);
    expect(res.body.type).toBe('ban');
    expect(deps.client.guilds.cache.get('g1').members.ban).toHaveBeenCalled();
  });

  it('POST /ban 400s without userId', async () => {
    await request(app(fakeDeps())).post('/api/moderation/ban').send({ reason: 'x' }).expect(400);
  });

  it('POST /mute 400s on a non-positive duration', async () => {
    await request(app(fakeDeps())).post('/api/moderation/mute').send({ userId: 'u1', seconds: 0 }).expect(400);
  });

  it('POST /mute 201s with a valid duration', async () => {
    await request(app(fakeDeps())).post('/api/moderation/mute').send({ userId: 'u1', seconds: 600 }).expect(201);
  });

  it('GET /cases returns the list', async () => {
    const res = await request(app(fakeDeps())).get('/api/moderation/cases?userId=u1').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('DELETE /cases/:id lifts the case', async () => {
    const res = await request(app(fakeDeps())).delete('/api/moderation/cases/c1').expect(200);
    expect(res.body.active).toBe(false);
  });

  it('503s when the guild is unavailable', async () => {
    await request(app(fakeDeps(false))).post('/api/moderation/ban').send({ userId: 'u1' }).expect(503);
  });
});
