import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// --- Prisma mock (needed by getPlan inside settings.ts + leveling.ts) ---
const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: {
    subscription: { findUnique: vi.fn() },
  },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

// --- settingsCache mock (needed by settings.ts) ---
const { getSettings, updateSettings } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));
vi.mock('../src/db/settingsCache', () => ({ getSettings, updateSettings }));

// --- welcomeCard mock (avoids @napi-rs/canvas dependency) ---
vi.mock('../src/bot/welcomeCard', () => ({
  WELCOME_CARD_STYLE_KEYS: ['classic', 'neon-hud', 'calligraphy-gold', 'aurora-glass', 'islamic-star', 'vip-ticket', 'constellation', 'synthwave', 'liquid-gold'],
}));

// --- leveling db mock (needed by leveling.ts) ---
const { getLevelConfig, updateLevelConfig } = vi.hoisted(() => ({
  getLevelConfig: vi.fn(),
  updateLevelConfig: vi.fn(),
}));
vi.mock('../src/db/leveling', async (importOriginal) => {
  const actual = (await importOriginal()) as object;
  return { ...actual, getLevelConfig, updateLevelConfig };
});

import { createSettingsRouter } from '../src/api/routes/settings';
import { createLevelingRouter } from '../src/api/routes/leveling';
import { _resetPlans } from '../src/db/subscriptions';

// --- Shared fakes ---
const settingsRow = { guildId: 'g1', logChannelId: null, staffRoleIds: [] as string[] };
const levelCfg = {
  guildId: 'g1', enabled: false, xpPerMessage: 18, cooldownSeconds: 60, multiplier: 1,
  levelUpEnabled: true, levelUpChannelId: null, levelUpMessage: null, stackRewards: false,
  voiceXpEnabled: false,
};

function settingsApp() {
  const a = express();
  a.use(express.json());
  a.use('/api/settings', createSettingsRouter({ config: { guildId: 'g1' } } as any));
  return a;
}

function levelingApp() {
  const a = express();
  a.use(express.json());
  a.use('/api/leveling', createLevelingRouter({
    config: { guildId: 'g1' },
    prisma: {
      levelRoleReward: { findMany: vi.fn().mockResolvedValue([]) },
      memberLevel: { findMany: vi.fn().mockResolvedValue([]) },
    } as any,
  }));
  return a;
}

beforeEach(() => {
  _resetPlans();
  // Default: free guild (no subscription row)
  fakePrisma.subscription.findUnique.mockResolvedValue(null);
  getSettings.mockReset().mockResolvedValue(settingsRow);
  updateSettings.mockReset().mockImplementation((_g: string, data: any) =>
    Promise.resolve({ ...settingsRow, ...data }),
  );
  getLevelConfig.mockReset().mockResolvedValue(levelCfg);
  updateLevelConfig.mockReset().mockImplementation((_g: string, d: any) =>
    Promise.resolve({ ...levelCfg, ...d }),
  );
});

// ---------------------------------------------------------------------------
// Settings: welcome style / bg gates (free guild)
// ---------------------------------------------------------------------------
describe('settings welcome gates (free guild)', () => {
  it('PUT with non-classic welcomeCardStyle → 403 upgrade', async () => {
    const res = await request(settingsApp())
      .put('/api/settings')
      .send({ welcomeCardStyle: 'neon-hud' })
      .expect(403);
    expect(res.body.upgrade).toBe(true);
    expect(res.body.feature).toBe('welcomeStyles');
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('PUT with welcomeCardBg → 403 upgrade', async () => {
    const res = await request(settingsApp())
      .put('/api/settings')
      .send({ welcomeCardBg: 'data:image/png;base64,AAAA' })
      .expect(403);
    expect(res.body.upgrade).toBe(true);
    expect(res.body.feature).toBe('welcomeCustomBg');
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('PUT with classic style (free default) → not 403', async () => {
    const res = await request(settingsApp())
      .put('/api/settings')
      .send({ welcomeCardStyle: 'classic' })
      ;
    expect(res.status).not.toBe(403);
    expect(updateSettings).toHaveBeenCalled();
  });

  it('PUT without any gated fields → not 403', async () => {
    const res = await request(settingsApp())
      .put('/api/settings')
      .send({ logChannelId: 'c1' })
      ;
    expect(res.status).not.toBe(403);
    expect(updateSettings).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Settings: welcome style / bg gates (premium guild)
// ---------------------------------------------------------------------------
describe('settings welcome gates (premium guild)', () => {
  beforeEach(() => {
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
  });

  it('PUT with non-classic welcomeCardStyle → not 403 for premium', async () => {
    const res = await request(settingsApp())
      .put('/api/settings')
      .send({ welcomeCardStyle: 'synthwave' })
      ;
    expect(res.status).not.toBe(403);
    expect(updateSettings).toHaveBeenCalled();
  });

  it('PUT with welcomeCardBg → not 403 for premium', async () => {
    const res = await request(settingsApp())
      .put('/api/settings')
      .send({ welcomeCardBg: 'data:image/png;base64,AAAA' })
      ;
    expect(res.status).not.toBe(403);
    expect(updateSettings).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Leveling: voiceXp gate (free guild)
// ---------------------------------------------------------------------------
describe('leveling voiceXp gate (free guild)', () => {
  it('PUT enabling voiceXpEnabled → 403 upgrade', async () => {
    const res = await request(levelingApp())
      .put('/api/leveling')
      .send({ voiceXpEnabled: true })
      .expect(403);
    expect(res.body.upgrade).toBe(true);
    expect(res.body.feature).toBe('voiceXp');
    expect(updateLevelConfig).not.toHaveBeenCalled();
  });

  it('PUT with voiceXpEnabled: false → not 403 (disabling is always allowed)', async () => {
    const res = await request(levelingApp())
      .put('/api/leveling')
      .send({ voiceXpEnabled: false })
      ;
    expect(res.status).not.toBe(403);
    expect(updateLevelConfig).toHaveBeenCalled();
  });

  it('PUT without voiceXp fields → not 403', async () => {
    const res = await request(levelingApp())
      .put('/api/leveling')
      .send({ xpPerMessage: 20 })
      ;
    expect(res.status).not.toBe(403);
    expect(updateLevelConfig).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Leveling: voiceXp gate (premium guild)
// ---------------------------------------------------------------------------
describe('leveling voiceXp gate (premium guild)', () => {
  beforeEach(() => {
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
  });

  it('PUT enabling voiceXpEnabled → not 403 for premium', async () => {
    const res = await request(levelingApp())
      .put('/api/leveling')
      .send({ voiceXpEnabled: true })
      ;
    expect(res.status).not.toBe(403);
    expect(updateLevelConfig).toHaveBeenCalled();
  });
});
