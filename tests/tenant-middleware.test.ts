import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { tenantContext, tenantGuildId } from '../src/api/middleware/tenant';
import { requireOwner } from '../src/api/middleware/requireOwner';

function appWith(session: Record<string, unknown>, config = { guildId: 'g-owner', ownerDiscordId: 'u-owner' }) {
  const a = express();
  a.use((req, _res, next) => {
    (req as any).session = session;
    next();
  });
  a.use('/t', tenantContext(config as any), (req, res) => res.json({ guildId: tenantGuildId(req) }));
  a.use('/o', requireOwner(config as any), (_req, res) => res.json({ ok: true }));
  return a;
}

describe('tenantContext', () => {
  it('attaches the selected guild when it is in the session list', async () => {
    const res = await request(appWith({ user: { authorized: true }, guildIds: ['g1', 'g2'], guildId: 'g2' })).get('/t').expect(200);
    expect(res.body.guildId).toBe('g2');
  });

  it('403s a selected guild that is NOT in the session list', async () => {
    await request(appWith({ user: { authorized: true }, guildIds: ['g1'], guildId: 'g-evil' })).get('/t').expect(403);
  });

  it('legacy session (no guildIds) falls back to the owner guild — same access it had pre-A2b', async () => {
    const res = await request(appWith({ user: { authorized: true } })).get('/t').expect(200);
    expect(res.body.guildId).toBe('g-owner');
  });

  it('tenantGuildId throws (500) when tenantContext never ran — fail closed', async () => {
    const a = express();
    a.get('/raw', (req, res) => res.json({ guildId: tenantGuildId(req) }));
    await request(a).get('/raw').expect(500);
  });
});

describe('requireOwner', () => {
  it('passes the configured owner through', async () => {
    await request(appWith({ user: { authorized: true, id: 'u-owner' } })).get('/o').expect(200);
  });
  it('403s any other staff user', async () => {
    await request(appWith({ user: { authorized: true, id: 'u-staff' } })).get('/o').expect(403);
  });
  it('403s everyone when OWNER_DISCORD_ID is unset (fail closed)', async () => {
    await request(appWith({ user: { authorized: true, id: 'u-owner' } }, { guildId: 'g-owner' } as any)).get('/o').expect(403);
  });
});
