import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createMembersRouter } from '../src/api/routes/members';

function member(id: string, username: string, bot = false) {
  return { id, displayName: username, user: { username, bot, displayAvatarURL: () => `https://cdn/${id}.png` } };
}

function fakeDeps(withGuild = true) {
  const cache = new Map([
    ['1', member('1', 'Ahmed')],
    ['2', member('2', 'Sara')],
    ['3', member('3', 'TestBot', true)],
  ]);
  const guild = { members: { cache } };
  return {
    client: { guilds: { cache: { get: (id: string) => (withGuild && id === 'g1' ? guild : undefined) } } },
    config: { guildId: 'g1' },
  } as any;
}

function app(deps: any) {
  const a = express();
  a.use('/api/members', createMembersRouter(deps));
  return a;
}

describe('members router', () => {
  it('returns mapped members with a total', async () => {
    const res = await request(app(fakeDeps())).get('/api/members').expect(200);
    expect(res.body.total).toBe(3);
    expect(res.body.members[0]).toHaveProperty('avatarUrl');
    expect(res.body.members[0]).toHaveProperty('isBot');
  });

  it('filters by case-insensitive search', async () => {
    const res = await request(app(fakeDeps())).get('/api/members?search=sar').expect(200);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].username).toBe('Sara');
  });

  it('503s when the guild is unavailable', async () => {
    await request(app(fakeDeps(false))).get('/api/members').expect(503);
  });
});
