/**
 * Integration tests for Task 3 (multiguild A2b): tenantContext wired into every
 * staff route in server.ts, and /api/bot gated by requireOwner.
 *
 * Testing strategy:
 *
 * (a) tenantContext semantics — already thoroughly covered by tenant-middleware.test.ts
 *     (Task 1). Here we rely on that coverage and only verify the wiring through the
 *     real createApp.
 *
 * (b) Guild-not-in-list → 403 via createApp: build the real app with a MemoryStore,
 *     pre-seed a session whose guildId is NOT in guildIds, then hit any tenant-mounted
 *     route (GET /api/tags). The tenant middleware must return 403 before the router runs.
 *
 * (c) /api/bot owner-gate: same real-app approach — a non-owner authorized session 403s;
 *     the owner session passes. (The tags router would 404 for an unimplemented route —
 *     we use /api/bot which is the route under test.)
 *
 * Session injection: we use express-session's MemoryStore, pre-seeding a known session
 * record with MemoryStore#set(), then send the matching connect.sid cookie. This mirrors
 * how the real session flow works and requires no server.ts modification.
 */
import { describe, it, expect } from 'vitest';
import session from 'express-session';
import request from 'supertest';
import { createApp } from '../src/api/server';

// ── Shared fakes ─────────────────────────────────────────────────────────────

const BASE_CONFIG = {
  clientId: 'c',
  clientSecret: 's',
  guildId: 'g-owner',
  sessionSecret: 'test-secret',
  dashboardUrl: 'http://localhost:5173',
  oauthRedirectUri: 'http://localhost:3000/api/auth/callback',
  discordToken: 't',
  databaseUrl: 'd',
  port: 3000,
  isProd: false,
} as const;

const OWNER_CONFIG = { ...BASE_CONFIG, ownerDiscordId: 'u-owner' } as any;

function fakeClient() {
  return { guilds: { cache: { get: () => undefined } } } as any;
}

/**
 * Build the real app + a MemoryStore with a pre-seeded session.
 * Returns `{ app, sid }` — pass sid as Cookie: connect.sid=s%3A<sid>.<sig>.
 * Because we are using a MemoryStore (not real cookies), we bypass cookie signing
 * by directly calling MemoryStore#set and injecting a raw (unsigned) session id
 * via a fake signed-cookie. The simplest approach: use the session middleware's
 * MemoryStore directly and compute the signed cookie value ourselves.
 *
 * Actually the easiest approach: use supertest's agent + a /api/health hit to get
 * a session cookie, then patch the store directly. But MemoryStore.set takes a
 * sid (the raw, unsign'd value that the session middleware computed internally).
 *
 * Cleanest approach with no sign/unsign: inject a middleware BEFORE the session
 * middleware that sets req.session directly — but that's not possible post-construction.
 *
 * Working approach: use MemoryStore's public `set(sid, session, cb)` API,
 * then craft the cookie manually. express-session signs cookies with
 * `signature.sign(sid, secret)`. We replicate that.
 */

import { sign } from 'cookie-signature';

type SessionData = {
  user?: { id: string; username: string; avatar: null; authorized: boolean };
  guildIds?: string[];
  guildId?: string;
};

function buildApp(config: any, sessionData: SessionData) {
  const store = new session.MemoryStore();
  const app = createApp({
    client: fakeClient(),
    prisma: {} as any,
    config,
    sessionStore: store,
  });

  const rawSid = 'test-session-id-' + Math.random().toString(36).slice(2);
  // express-session stores with the raw sid internally; the cookie value is
  // "s:" + sign(rawSid, secret).
  const signedSid = 's:' + sign(rawSid, config.sessionSecret);

  // Pre-seed the session into the store.
  const fullSession: any = {
    cookie: { originalMaxAge: null, expires: null, httpOnly: true, path: '/' },
    ...sessionData,
  };
  store.set(rawSid, fullSession, () => {});

  return { app, cookie: `connect.sid=${encodeURIComponent(signedSid)}` };
}

// ── (b) Guild not in list → 403 on a tenant-mounted route ────────────────────

describe('tenantContext wiring in server.ts', () => {
  it('(b) returns 403 "guild not accessible" when session.guildId is not in session.guildIds', async () => {
    const { app, cookie } = buildApp(OWNER_CONFIG, {
      user: { id: 'u-staff', username: 'Staff', avatar: null, authorized: true },
      guildIds: ['gA'],
      guildId: 'gB', // NOT in guildIds
    });

    const res = await request(app)
      .get('/api/tags')
      .set('Cookie', cookie)
      .expect(403);

    expect(res.body.error).toBe('guild not accessible');
  });

  it('(b) legacy session (no guildIds) falls through to the router with config.guildId', async () => {
    const { app, cookie } = buildApp(OWNER_CONFIG, {
      user: { id: 'u-staff', username: 'Staff', avatar: null, authorized: true },
      // no guildIds / guildId — legacy session
    });

    // The router will respond (likely 200 or 404/500 from the fake prisma — doesn't matter;
    // what matters is that tenant middleware did NOT 403 it).
    const res = await request(app)
      .get('/api/tags')
      .set('Cookie', cookie);

    expect(res.status).not.toBe(403);
  });

  it('(b) valid guildId in guildIds passes the tenant gate', async () => {
    const { app, cookie } = buildApp(OWNER_CONFIG, {
      user: { id: 'u-staff', username: 'Staff', avatar: null, authorized: true },
      guildIds: ['gA', 'gB'],
      guildId: 'gA', // IS in guildIds
    });

    // Any non-403 response means tenant passed (router may 500 on fake prisma).
    const res = await request(app)
      .get('/api/tags')
      .set('Cookie', cookie);

    expect(res.status).not.toBe(403);
  });
});

// ── (c) /api/bot owner gate ───────────────────────────────────────────────────

describe('/api/bot requireOwner gate', () => {
  it('(c) 403s a non-owner authorized staff user', async () => {
    const { app, cookie } = buildApp(OWNER_CONFIG, {
      user: { id: 'u-staff', username: 'Staff', avatar: null, authorized: true },
      guildIds: ['g-owner'],
      guildId: 'g-owner',
    });

    const res = await request(app)
      .get('/api/bot')
      .set('Cookie', cookie)
      .expect(403);

    expect(res.body.error).toBe('owner only');
  });

  it('(c) passes the configured owner through (to the bot router)', async () => {
    const { app, cookie } = buildApp(OWNER_CONFIG, {
      user: { id: 'u-owner', username: 'Owner', avatar: null, authorized: true },
      guildIds: ['g-owner'],
      guildId: 'g-owner',
    });

    // Bot router may 200 or error depending on fake client — but must NOT 403.
    const res = await request(app)
      .get('/api/bot')
      .set('Cookie', cookie);

    expect(res.status).not.toBe(403);
  });

  it('(c) 403s everyone when OWNER_DISCORD_ID is unset (fail closed)', async () => {
    // Config WITHOUT ownerDiscordId
    const { app, cookie } = buildApp(BASE_CONFIG as any, {
      user: { id: 'u-staff', username: 'Staff', avatar: null, authorized: true },
    });

    const res = await request(app)
      .get('/api/bot')
      .set('Cookie', cookie)
      .expect(403);

    expect(res.body.error).toBe('owner only');
  });

  it('(c) /api/bot has NO tenant middleware (does not 403 on mismatched guild)', async () => {
    // Even if session has guildIds: ['gA'], guildId: 'gB' (which would fail tenant),
    // /api/bot should NOT run tenant — it goes through requireOwner instead.
    const { app, cookie } = buildApp(OWNER_CONFIG, {
      user: { id: 'u-owner', username: 'Owner', avatar: null, authorized: true },
      guildIds: ['gA'],
      guildId: 'gB', // would 403 a tenant route — but /api/bot has no tenant
    });

    const res = await request(app)
      .get('/api/bot')
      .set('Cookie', cookie);

    // Must not be 403 from tenant (may be any other status from the bot router)
    expect(res.status).not.toBe(403);
  });
});

// ── Static structure assertion: every /api/ mount (except auth/health/bot) has tenant ──

describe('server.ts mount structure (static source assertion)', () => {
  it('every non-exempt staff mount in server.ts includes the tenant middleware', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'api', 'server.ts'),
      'utf-8',
    );

    // Strip // line comments first so a comment like "// tenant removed" can't
    // satisfy the later `.includes('tenant')` check with comment text.
    // Then collapse whitespace so multi-line mounts (e.g. /api/moderation,
    // /api/creatorannounce) become single logical statements and are not silently
    // skipped by a line-based filter.
    const stripped = source.replace(/\/\/[^\n]*/g, '');
    const collapsed = stripped.replace(/\s+/g, ' ');
    const mounts = collapsed.match(/app\.use\( ?'\/api\/[^']+'.*?\);/g) ?? [];

    // Routes that are intentionally exempt from tenant middleware.
    const exempt = ["'/api/auth'", "'/api/bot'"];
    const staffMounts = mounts.filter((m) => !exempt.some((e) => m.includes(e)));

    // Sanity-check: every staff route must be present (catches accidental deletion).
    expect(staffMounts.length).toBeGreaterThanOrEqual(39);

    // Every non-exempt mount must include the tenant middleware.
    for (const m of staffMounts) {
      expect(m, `mount missing tenant middleware: ${m.slice(0, 80)}`).toContain('tenant');
    }
  });
});
