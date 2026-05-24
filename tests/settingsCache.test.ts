import { describe, it, expect, vi, beforeEach } from 'vitest';

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock('../src/db/prisma', () => ({
  prisma: { guildSettings: { upsert } },
}));

import { ensureGuildSettings, getSettings, invalidateSettings } from '../src/db/settingsCache';

const row = { guildId: 'g1', logChannelId: null, staffRoleIds: [], createdAt: new Date(), updatedAt: new Date() };

beforeEach(() => {
  upsert.mockReset().mockResolvedValue(row);
  invalidateSettings('g1');
});

describe('settingsCache', () => {
  it('ensures (upserts) and caches a row', async () => {
    const result = await ensureGuildSettings('g1');
    expect(result.guildId).toBe('g1');
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('getSettings serves from cache without a second db call', async () => {
    await ensureGuildSettings('g1');
    await getSettings('g1');
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('invalidate forces a reload', async () => {
    await ensureGuildSettings('g1');
    invalidateSettings('g1');
    await getSettings('g1');
    expect(upsert).toHaveBeenCalledTimes(2);
  });
});
