import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: { subscription: { findUnique: vi.fn() } },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

const { getSettings, updateSettings } = vi.hoisted(() => ({ getSettings: vi.fn(), updateSettings: vi.fn() }));
vi.mock('../src/db/settingsCache', () => ({ getSettings, updateSettings }));

import { createSettingsRouter } from '../src/api/routes/settings';
import { _resetPlans } from '../src/db/subscriptions';

const row = { guildId: 'g1', logChannelId: null, staffRoleIds: [] as string[] };

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/settings', createSettingsRouter({ config: { guildId: 'g1' } } as any));
  return a;
}

beforeEach(() => {
  _resetPlans();
  fakePrisma.subscription.findUnique.mockResolvedValue(null); // free by default
  getSettings.mockReset().mockResolvedValue(row);
  updateSettings.mockReset().mockImplementation((_g: string, data: any) => Promise.resolve({ ...row, ...data }));
});

describe('settings router', () => {
  it('GET / returns the settings', async () => {
    const res = await request(app()).get('/api/settings').expect(200);
    expect(res.body.guildId).toBe('g1');
  });

  it('PUT / updates log channel and staff roles', async () => {
    const res = await request(app())
      .put('/api/settings')
      .send({ logChannelId: 'c9', staffRoleIds: ['r1', 'r2'] })
      .expect(200);
    expect(updateSettings).toHaveBeenCalledWith('g1', { logChannelId: 'c9', staffRoleIds: ['r1', 'r2'] });
    expect(res.body.staffRoleIds).toEqual(['r1', 'r2']);
  });

  it('PUT / 400s when staffRoleIds is not an array', async () => {
    await request(app()).put('/api/settings').send({ staffRoleIds: 'r1' }).expect(400);
  });

  it('PUT / persists welcome config and clears empty ids to null', async () => {
    const res = await request(app())
      .put('/api/settings')
      .send({ welcomeEnabled: true, welcomeChannelId: 'wc1', welcomeMessage: 'أهلًا {user}', autoRoleId: '' })
      .expect(200);
    expect(updateSettings).toHaveBeenCalledWith('g1', {
      welcomeEnabled: true,
      welcomeChannelId: 'wc1',
      welcomeMessage: 'أهلًا {user}',
      autoRoleId: null,
    });
    expect(res.body.welcomeEnabled).toBe(true);
  });

  it('PUT / 400s on an unsupported language', async () => {
    await request(app()).put('/api/settings').send({ language: 'fr' }).expect(400);
  });

  it('PUT / passes the embed toggles through as booleans', async () => {
    await request(app())
      .put('/api/settings')
      .send({ welcomeEmbedEnabled: false, goodbyeEmbedEnabled: true })
      .expect(200);
    expect(updateSettings).toHaveBeenCalledWith('g1', { welcomeEmbedEnabled: false, goodbyeEmbedEnabled: true });
  });

  it('PUT / accepts a valid welcomeCardStyle for a premium guild', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
    await request(app()).put('/api/settings').send({ welcomeCardStyle: 'vip-ticket' }).expect(200);
    expect(updateSettings).toHaveBeenCalledWith('g1', { welcomeCardStyle: 'vip-ticket' });
  });

  it('PUT / 400s on an unknown welcomeCardStyle', async () => {
    await request(app()).put('/api/settings').send({ welcomeCardStyle: 'comic-sans' }).expect(400);
  });
});
