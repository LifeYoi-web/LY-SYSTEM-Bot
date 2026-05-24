import { describe, it, expect, vi, beforeEach } from 'vitest';

const { upsert, update } = vi.hoisted(() => ({ upsert: vi.fn(), update: vi.fn() }));
vi.mock('../src/db/prisma', () => ({
  prisma: { guildSettings: { upsert, update } },
}));

import {
  ensureGuildSettings,
  getSettings,
  invalidateSettings,
  updateSettings,
} from '../src/db/settingsCache';

const row = { guildId: 'g1', logChannelId: null, staffRoleIds: [], createdAt: new Date(), updatedAt: new Date() };

beforeEach(() => {
  upsert.mockReset().mockResolvedValue(row);
  update.mockReset().mockResolvedValue({ ...row, logChannelId: 'c9' });
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

  it('updateSettings writes through and refreshes the cache', async () => {
    await ensureGuildSettings('g1');
    const updated = await updateSettings('g1', { logChannelId: 'c9' });
    expect(updated.logChannelId).toBe('c9');
    expect(update).toHaveBeenCalledWith({ where: { guildId: 'g1' }, data: { logChannelId: 'c9' } });
    const cached = await getSettings('g1');
    expect(cached.logChannelId).toBe('c9');
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
