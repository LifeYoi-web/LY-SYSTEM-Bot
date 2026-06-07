import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAuthRouter } from '../src/api/routes/auth';

const config = {
  clientId: 'c', clientSecret: 's', guildId: 'g1', sessionSecret: 'x',
  dashboardUrl: 'http://localhost:5173', oauthRedirectUri: 'http://localhost:3000/api/auth/callback',
  discordToken: 't', databaseUrl: 'd', port: 3000, isProd: false,
} as any;

function app() {
  const a = express();
  a.use((req, _res, next) => { (req as any).session = {}; next(); });
  a.use('/api/auth', createAuthRouter({ client: {} as any, config }));
  return a;
}

describe('auth route', () => {
  it('redirects /login to Discord', async () => {
    const res = await request(app()).get('/api/auth/login').expect(302);
    expect(res.headers.location).toContain('discord.com/api/oauth2/authorize');
    expect(res.headers.location).toContain('client_id=c');
  });
  it('401s /me when logged out', async () => {
    await request(app()).get('/api/auth/me').expect(401);
  });

  it('rejects callback with mismatched state', async () => {
    const a = express();
    a.use((req, _res, next) => { (req as any).session = { oauthState: 'right' }; next(); });
    a.use('/api/auth', createAuthRouter({ client: {} as any, config }));
    const res = await request(a).get('/api/auth/callback?code=x&state=wrong').expect(302);
    expect(res.headers.location).toContain('error=badstate');
  });

  it('rejects callback with no state', async () => {
    const res = await request(app()).get('/api/auth/callback?code=x').expect(302);
    expect(res.headers.location).toContain('error=badstate');
  });
});

// ---------------------------------------------------------------------------
// POST /select-guild
// ---------------------------------------------------------------------------

function appWithSession(sessionData: Record<string, unknown>, clientOverride?: any) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { (req as any).session = sessionData; next(); });
  a.use('/api/auth', createAuthRouter({ client: clientOverride ?? ({} as any), config }));
  return a;
}

describe('POST /select-guild', () => {
  it('switches when the guild is in the session list', async () => {
    const session: Record<string, unknown> = {
      user: { authorized: true, id: 'u1', username: 'User', avatar: null },
      guildIds: ['g1', 'g2'],
      guildId: 'g1',
    };
    const res = await request(appWithSession(session))
      .post('/api/auth/select-guild')
      .send({ guildId: 'g2' })
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.guildId).toBe('g2');
    // session must be updated
    expect(session.guildId).toBe('g2');
  });

  it('403s a guild outside the list', async () => {
    const session: Record<string, unknown> = {
      user: { authorized: true, id: 'u1', username: 'User', avatar: null },
      guildIds: ['g1'],
      guildId: 'g1',
    };
    const res = await request(appWithSession(session))
      .post('/api/auth/select-guild')
      .send({ guildId: 'g-evil' })
      .expect(403);
    expect(res.body.error).toBeDefined();
  });

  it('401s when logged out', async () => {
    const res = await request(appWithSession({}))
      .post('/api/auth/select-guild')
      .send({ guildId: 'g1' })
      .expect(401);
    expect(res.body.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// GET /me (multi-guild)
// ---------------------------------------------------------------------------

describe('GET /me (multi-guild)', () => {
  it('returns guilds, selected guildId and isOwner', async () => {
    const ownerConfig = { ...config, ownerDiscordId: 'u-owner' };
    const fakeClient = {
      guilds: {
        cache: new Map([
          ['g1', { name: 'Server One', iconURL: () => 'https://cdn.example.com/icon.png' }],
        ]),
      },
    };
    const session: Record<string, unknown> = {
      user: { authorized: true, id: 'u-owner', username: 'Owner', avatar: null },
      guildIds: ['g1'],
      guildId: 'g1',
    };
    const a = express();
    a.use(express.json());
    a.use((req, _res, next) => { (req as any).session = session; next(); });
    a.use('/api/auth', createAuthRouter({ client: fakeClient as any, config: ownerConfig }));

    const res = await request(a).get('/api/auth/me').expect(200);
    expect(res.body.id).toBe('u-owner');
    expect(res.body.isOwner).toBe(true);
    expect(res.body.guildId).toBe('g1');
    expect(Array.isArray(res.body.guilds)).toBe(true);
    expect(res.body.guilds[0].id).toBe('g1');
    expect(res.body.guilds[0].name).toBe('Server One');
    expect(res.body.guilds[0].icon).toBe('https://cdn.example.com/icon.png');
  });
});
