import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { xpForNextLevel, totalXpForLevel, levelFromXp, progressInLevel } from '../src/shared/leveling';

describe('leveling curve', () => {
  it('starts at level 0 and advances monotonically', () => {
    expect(levelFromXp(0)).toBe(0);
    expect(levelFromXp(xpForNextLevel(0))).toBe(1);
    expect(levelFromXp(totalXpForLevel(5))).toBe(5);
    expect(levelFromXp(totalXpForLevel(5) - 1)).toBe(4);
  });
  it('progress reports percent within the current level', () => {
    expect(progressInLevel(0)).toMatchObject({ level: 0, into: 0, pct: 0 });
    const p = progressInLevel(totalXpForLevel(2) + 10);
    expect(p.level).toBe(2);
    expect(p.into).toBe(10);
    expect(p.pct).toBeGreaterThan(0);
  });
});

const { getLevelConfig, updateLevelConfig } = vi.hoisted(() => ({ getLevelConfig: vi.fn(), updateLevelConfig: vi.fn() }));
vi.mock('../src/db/leveling', async (importOriginal) => {
  const actual = (await importOriginal()) as object;
  return { ...actual, getLevelConfig, updateLevelConfig };
});
import { createLevelingRouter } from '../src/api/routes/leveling';

const cfg = {
  guildId: 'g1', enabled: false, xpPerMessage: 18, cooldownSeconds: 60, multiplier: 1,
  levelUpEnabled: true, levelUpChannelId: null, levelUpMessage: null, stackRewards: false,
};
function deps() {
  return {
    config: { guildId: 'g1' },
    prisma: {
      levelRoleReward: { findMany: vi.fn().mockResolvedValue([]) },
      memberLevel: { findMany: vi.fn().mockResolvedValue([{ userId: 'u1', xp: 500, level: 3 }]) },
    },
  } as any;
}
function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { (req as any).tenant = { guildId: 'g1' }; next(); });
  a.use('/api/leveling', createLevelingRouter(deps()));
  return a;
}
beforeEach(() => {
  getLevelConfig.mockReset().mockResolvedValue(cfg);
  updateLevelConfig.mockReset().mockImplementation((_g: string, d: any) => Promise.resolve({ ...cfg, ...d }));
});

describe('leveling route', () => {
  it('GET / returns config + rewards', async () => {
    const res = await request(app()).get('/api/leveling').expect(200);
    expect(res.body.config.guildId).toBe('g1');
    expect(res.body.rewards).toEqual([]);
  });
  it('PUT / validates xpPerMessage range', async () => {
    await request(app()).put('/api/leveling').send({ xpPerMessage: 0 }).expect(400);
    const ok = await request(app()).put('/api/leveling').send({ xpPerMessage: 25, enabled: true }).expect(200);
    expect(ok.body.xpPerMessage).toBe(25);
  });
  it('GET /leaderboard maps rank + progress', async () => {
    const res = await request(app()).get('/api/leveling/leaderboard').expect(200);
    expect(res.body.leaderboard[0]).toMatchObject({ rank: 1, userId: 'u1' });
    expect(res.body.leaderboard[0].progress).toHaveProperty('pct');
  });
});
