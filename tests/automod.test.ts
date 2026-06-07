import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { getAutoMod, updateAutoMod } = vi.hoisted(() => ({
  getAutoMod: vi.fn(),
  updateAutoMod: vi.fn(),
}));
vi.mock('../src/db/automod', async (importOriginal) => {
  const actual = (await importOriginal()) as object;
  return { ...actual, getAutoMod, updateAutoMod };
});

import { createAutoModRouter } from '../src/api/routes/automod';

const base = {
  guildId: 'g1',
  enabled: false,
  antiSpam: false,
  antiInvite: false,
  antiLink: false,
  bannedWords: [] as string[],
  maxMentions: 5,
  actionOnViolation: 'delete',
  muteSeconds: 300,
  ignoredChannelIds: [] as string[],
  ignoredRoleIds: [] as string[],
};

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { (req as any).tenant = { guildId: 'g1' }; next(); });
  a.use('/api/automod', createAutoModRouter({ config: { guildId: 'g1' } } as any));
  return a;
}

beforeEach(() => {
  getAutoMod.mockReset().mockResolvedValue(base);
  updateAutoMod.mockReset().mockImplementation((_g: string, data: any) => Promise.resolve({ ...base, ...data }));
});

describe('automod route', () => {
  it('GET / returns the config', async () => {
    const res = await request(app()).get('/api/automod').expect(200);
    expect(res.body.guildId).toBe('g1');
  });

  it('PUT / normalizes banned words (lowercase + dedupe) and toggles', async () => {
    const res = await request(app())
      .put('/api/automod')
      .send({ enabled: true, antiInvite: 1, bannedWords: ['Spam', 'spam', ' BadWord '] })
      .expect(200);
    expect(updateAutoMod).toHaveBeenCalledWith('g1', {
      enabled: true,
      antiInvite: true,
      bannedWords: ['spam', 'badword'],
    });
    expect(res.body.enabled).toBe(true);
  });

  it('PUT / rejects an out-of-range maxMentions', async () => {
    await request(app()).put('/api/automod').send({ maxMentions: 0 }).expect(400);
    await request(app()).put('/api/automod').send({ maxMentions: 999 }).expect(400);
  });

  it('PUT / rejects an unknown action', async () => {
    await request(app()).put('/api/automod').send({ actionOnViolation: 'explode' }).expect(400);
  });
});
