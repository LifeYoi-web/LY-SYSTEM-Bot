import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { ChannelType } from 'discord.js';
import { createServerRouter } from '../src/api/routes/server';

function fakeDeps(withGuild = true) {
  const channels = [
    { id: 'c1', name: 'general', type: ChannelType.GuildText, parentId: null, rawPosition: 1 },
    { id: 'c2', name: 'voice', type: ChannelType.GuildVoice, parentId: null, rawPosition: 0 },
    { id: 'c3', name: 'cat', type: ChannelType.GuildCategory, parentId: null, rawPosition: 2 },
  ];
  const roles = [
    { id: 'g1', name: '@everyone', color: 0, position: 0 },
    { id: 'r1', name: 'Admin', color: 0xf57c00, position: 5, managed: false },
    { id: 'r2', name: 'Member', color: 0, position: 1, managed: false },
  ];
  const guild = {
    id: 'g1',
    name: 'My Server',
    memberCount: 100,
    iconURL: () => 'https://cdn.discordapp.com/icon.png',
    premiumTier: 3,
    premiumSubscriptionCount: 14,
    ownerId: 'owner1',
    createdTimestamp: 1600000000000,
    channels: { cache: { values: () => channels.values(), size: channels.length } },
    roles: { cache: { values: () => roles.values(), size: roles.length } },
    emojis: { cache: { size: 8 } },
  };
  return {
    client: { guilds: { cache: { get: (id: string) => (withGuild && id === 'g1' ? guild : undefined) } } },
    config: { guildId: 'g1' },
  } as any;
}

function app(deps: any) {
  const a = express();
  a.use((req, _res, next) => { (req as any).tenant = { guildId: 'g1' }; next(); });
  a.use('/api/server', createServerRouter(deps));
  return a;
}

describe('server route', () => {
  it('GET / returns rich server info with channel type counts', async () => {
    const res = await request(app(fakeDeps())).get('/api/server').expect(200);
    expect(res.body).toMatchObject({
      name: 'My Server',
      memberCount: 100,
      roleCount: 3,
      emojiCount: 8,
      boostLevel: 3,
      boostCount: 14,
    });
    expect(res.body.channelsByType).toMatchObject({ text: 1, voice: 1, category: 1 });
  });

  it('GET /channels returns channels sorted by position with a kind label', async () => {
    const res = await request(app(fakeDeps())).get('/api/server/channels').expect(200);
    expect(res.body.channels[0]).toMatchObject({ id: 'c2', kind: 'voice', position: 0 });
    expect(res.body.channels.find((c: any) => c.id === 'c1').kind).toBe('text');
  });

  it('GET /roles excludes @everyone and sorts by position desc', async () => {
    const res = await request(app(fakeDeps())).get('/api/server/roles').expect(200);
    expect(res.body.roles.map((r: any) => r.id)).toEqual(['r1', 'r2']);
    expect(res.body.roles[0]).toMatchObject({ name: 'Admin', color: '#f57c00' });
  });

  it('503s when the guild is unavailable', async () => {
    await request(app(fakeDeps(false))).get('/api/server').expect(503);
  });
});
