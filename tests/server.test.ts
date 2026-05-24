import { describe, it, expect } from 'vitest';
import session from 'express-session';
import request from 'supertest';
import { createApp } from '../src/api/server';

const config = {
  clientId: 'c', clientSecret: 's', guildId: 'g1', sessionSecret: 'x',
  dashboardUrl: 'http://localhost:5173', oauthRedirectUri: 'http://localhost:3000/api/auth/callback',
  discordToken: 't', databaseUrl: 'd', port: 3000, isProd: false,
} as any;

describe('createApp', () => {
  it('serves /api/health', async () => {
    const app = createApp({
      client: { guilds: { cache: { get: () => undefined } } } as any,
      prisma: {} as any,
      config,
      sessionStore: new session.MemoryStore(),
    });
    await request(app).get('/api/health').expect(200, { ok: true });
  });
});
