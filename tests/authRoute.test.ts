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
});
