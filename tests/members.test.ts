import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createMembersRouter } from '../src/api/routes/members';

function role(id: string, name: string, color = 0, position = 1) {
  return { id, name, color, position };
}

function member(id: string, username: string, bot = false, joinedTimestamp = 1000, roles: any[] = []) {
  return {
    id,
    displayName: username,
    joinedTimestamp,
    user: {
      username,
      bot,
      globalName: username,
      createdTimestamp: 1700000000000,
      displayAvatarURL: () => `https://cdn.discordapp.com/${id}.png`,
    },
    roles: { cache: { values: () => roles.values() } },
  };
}

function fakeDeps(withGuild = true) {
  const cache = new Map<string, any>([
    ['1', member('1', 'Ahmed', false, 3000, [role('r1', 'VIP', 0xf57c00, 5)])],
    ['2', member('2', 'Sara', false, 2000)],
    ['3', member('3', 'TestBot', true, 1000)],
  ]);
  const guild = {
    id: 'g1',
    members: {
      cache,
      fetch: (id: string) => (cache.has(id) ? Promise.resolve(cache.get(id)) : Promise.reject(new Error('nope'))),
    },
  };
  const prisma = {
    moderationCase: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'c1', type: 'warn', active: true },
        { id: 'c2', type: 'ban', active: false },
      ]),
    },
  };
  return {
    client: { guilds: { cache: { get: (id: string) => (withGuild && id === 'g1' ? guild : undefined) } } },
    prisma,
    config: { guildId: 'g1' },
  } as any;
}

function app(deps: any) {
  const a = express();
  a.use((req, _res, next) => { (req as any).tenant = { guildId: 'g1' }; next(); });
  a.use('/api/members', createMembersRouter(deps));
  return a;
}

describe('members router', () => {
  it('returns rich members sorted by join date (newest first) with a total', async () => {
    const res = await request(app(fakeDeps())).get('/api/members').expect(200);
    expect(res.body.total).toBe(3);
    expect(res.body.members[0]).toMatchObject({ id: '1', displayName: 'Ahmed', roleCount: 1 });
    expect(res.body.members[0].roles[0]).toMatchObject({ name: 'VIP', color: '#f57c00' });
  });

  it('filters to humans only', async () => {
    const res = await request(app(fakeDeps())).get('/api/members?filter=humans').expect(200);
    expect(res.body.members.every((m: any) => !m.isBot)).toBe(true);
    expect(res.body.total).toBe(2);
  });

  it('filters by case-insensitive search', async () => {
    const res = await request(app(fakeDeps())).get('/api/members?search=sar').expect(200);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].username).toBe('Sara');
  });

  it('paginates with limit + offset', async () => {
    const res = await request(app(fakeDeps())).get('/api/members?limit=1&offset=1').expect(200);
    expect(res.body.members).toHaveLength(1);
    expect(res.body).toMatchObject({ limit: 1, offset: 1, total: 3 });
  });

  it('GET /:id returns the member with case history + stats', async () => {
    const res = await request(app(fakeDeps())).get('/api/members/1').expect(200);
    expect(res.body.member.id).toBe('1');
    expect(res.body.cases).toHaveLength(2);
    expect(res.body.stats).toMatchObject({ total: 2, active: 1, byType: { warn: 1, ban: 1 } });
  });

  it('GET /:id 404s for an unknown member', async () => {
    await request(app(fakeDeps())).get('/api/members/999').expect(404);
  });

  it('lazy-warms a cold member cache (non-owner guild) before listing', async () => {
    const deps = fakeDeps();
    const guild = deps.client.guilds.cache.get('g1');
    guild.memberCount = 100; // cache holds 3 << 50% of 100 → clearly cold
    const fetchSpy = vi.fn().mockResolvedValue(new Map());
    guild.members.fetch = fetchSpy;
    await request(app(deps)).get('/api/members').expect(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT re-fetch when the cache is already warm', async () => {
    const deps = fakeDeps();
    const guild = deps.client.guilds.cache.get('g1');
    guild.memberCount = 3; // cache.size === memberCount → warm
    const fetchSpy = vi.fn();
    guild.members.fetch = fetchSpy;
    await request(app(deps)).get('/api/members').expect(200);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('503s when the guild is unavailable', async () => {
    await request(app(fakeDeps(false))).get('/api/members').expect(503);
  });
});
