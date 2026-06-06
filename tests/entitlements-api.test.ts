import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: { subscription: { findUnique: vi.fn() } },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { requireFeature, planLimit } from '../src/api/middleware/entitlements';
import { createEntitlementsRouter } from '../src/api/routes/entitlements';
import { _resetPlans } from '../src/db/subscriptions';

beforeEach(() => {
  _resetPlans();
  fakePrisma.subscription.findUnique.mockReset();
});

function appWith(mw: any, guildId = 'g1') {
  const a = express();
  a.use('/gated', mw, (_req: any, res: any) => res.json({ ok: true }));
  a.use('/api/entitlements', createEntitlementsRouter({ config: { guildId } } as any));
  return a;
}

describe('requireFeature middleware', () => {
  it('403 + upgrade flag for a free guild', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue(null);
    const res = await request(appWith(requireFeature('music', () => 'g1'))).get('/gated').expect(403);
    expect(res.body.upgrade).toBe(true);
    expect(res.body.feature).toBe('music');
  });
  it('passes a premium guild through', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
    await request(appWith(requireFeature('music', () => 'g1'))).get('/gated').expect(200);
  });
});

describe('planLimit', () => {
  it('returns the free cap and Infinity for premium', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue(null);
    expect(await planLimit('g1', 'tags')).toBe(10);
    _resetPlans();
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
    expect(await planLimit('g1', 'tags')).toBe(Infinity);
  });
});

describe('GET /api/entitlements', () => {
  it('returns plan + feature booleans + JSON-safe limits (Infinity → null)', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue(null);
    const res = await request(appWith(requireFeature('music', () => 'g1'))).get('/api/entitlements').expect(200);
    expect(res.body.plan).toBe('free');
    expect(res.body.features.music).toBe(false);
    expect(res.body.limits.tags).toBe(10);
    _resetPlans();
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
    const res2 = await request(appWith(requireFeature('music', () => 'g1'))).get('/api/entitlements').expect(200);
    expect(res2.body.features.music).toBe(true);
    expect(res2.body.limits.tags).toBeNull(); // Infinity is not JSON — null = unlimited
  });
});
