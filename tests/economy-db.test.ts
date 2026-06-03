import { describe, it, expect, vi } from 'vitest';
import { transfer, claimDaily, getBalance } from '../src/bot/economy';

const ecoCfg = (o: Record<string, unknown> = {}) =>
  ({
    guildId: 'g', enabled: true, currencyName: 'عملة', currencyEmoji: '🪙',
    perMessage: 5, cooldownSeconds: 60, dailyAmount: 200, streakBonus: 50, maxStreakBonus: 500, ...o,
  }) as any;

describe('transfer', () => {
  it('rejects non-positive amounts', async () => {
    expect(await transfer({} as any, 'g', 'a', 'b', 0)).toEqual({ ok: false, reason: 'amount' });
  });
  it('rejects self-transfer', async () => {
    expect(await transfer({} as any, 'g', 'a', 'a', 10)).toEqual({ ok: false, reason: 'self' });
  });
  it('rejects when the sender balance is insufficient', async () => {
    const prisma = { wallet: { findUnique: vi.fn().mockResolvedValue({ balance: 5 }) } } as any;
    expect(await transfer(prisma, 'g', 'a', 'b', 10)).toEqual({ ok: false, reason: 'balance' });
  });
  it('moves funds atomically on success', async () => {
    const prisma = {
      wallet: { findUnique: vi.fn().mockResolvedValue({ balance: 100 }), update: vi.fn(), upsert: vi.fn() },
      $transaction: vi.fn().mockResolvedValue([]),
      economyTransaction: { createMany: vi.fn().mockResolvedValue({}) },
    } as any;
    expect(await transfer(prisma, 'g', 'a', 'b', 30)).toEqual({ ok: true });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});

describe('claimDaily', () => {
  it('rejects a same-day re-claim', async () => {
    const now = new Date('2026-06-03T12:00:00Z');
    const prisma = {
      wallet: { findUnique: vi.fn().mockResolvedValue({ balance: 100, lastDaily: new Date('2026-06-03T01:00:00Z'), streak: 2 }) },
    } as any;
    const r = await claimDaily(prisma, 'g', 'u', ecoCfg(), now);
    expect(r.claimed).toBe(false);
    expect(r.balance).toBe(100);
  });
  it('grants the base + streak bonus and persists on a fresh day', async () => {
    const now = new Date('2026-06-03T12:00:00Z');
    const prisma = {
      wallet: {
        findUnique: vi.fn().mockResolvedValue({ balance: 100, lastDaily: new Date('2026-06-02T12:00:00Z'), streak: 1 }),
        upsert: vi.fn().mockResolvedValue({ balance: 350 }),
      },
      economyTransaction: { create: vi.fn().mockResolvedValue({}) },
    } as any;
    const r = await claimDaily(prisma, 'g', 'u', ecoCfg(), now);
    expect(r.claimed).toBe(true);
    expect(r.streak).toBe(2);
    expect(r.amount).toBe(250); // 200 + (2-1)*50
    expect(prisma.wallet.upsert).toHaveBeenCalledOnce();
  });
});

describe('getBalance', () => {
  it('returns 0 when there is no wallet', async () => {
    const prisma = { wallet: { findUnique: vi.fn().mockResolvedValue(null) } } as any;
    expect(await getBalance(prisma, 'g', 'u')).toBe(0);
  });
});
