import { describe, it, expect, vi } from 'vitest';
import { buyItem } from '../src/bot/shop';

const guild = { id: 'g' } as any;
const member = (owns = false) =>
  ({ id: 'u', roles: { cache: { has: () => owns }, add: vi.fn().mockResolvedValue(undefined) } }) as any;

const baseItem = { id: 'i', guildId: 'g', roleId: 'r', enabled: true, stock: -1, price: 100, durationHours: null, requiredLevel: null };

function prismaWith(item: unknown, balance: number) {
  return {
    shopItem: { findUnique: vi.fn().mockResolvedValue(item), update: vi.fn().mockResolvedValue({}) },
    memberLevel: { findUnique: vi.fn().mockResolvedValue({ level: 10 }) },
    wallet: { findUnique: vi.fn().mockResolvedValue({ balance }), upsert: vi.fn().mockResolvedValue({ balance }) },
    economyTransaction: { create: vi.fn().mockResolvedValue({}) },
    shopPurchase: { create: vi.fn().mockResolvedValue({}) },
  } as any;
}

describe('buyItem', () => {
  it('fails when the item does not exist', async () => {
    const prisma = { shopItem: { findUnique: vi.fn().mockResolvedValue(null) } } as any;
    expect(await buyItem(guild, prisma, member(), 'x')).toEqual({ ok: false, reason: 'notfound' });
  });
  it('fails when out of stock', async () => {
    expect(await buyItem(guild, prismaWith({ ...baseItem, stock: 0 }, 1000), member(), 'i')).toEqual({ ok: false, reason: 'stock' });
  });
  it('fails when the required level is not met', async () => {
    const prisma = prismaWith({ ...baseItem, requiredLevel: 50 }, 1000);
    expect(await buyItem(guild, prisma, member(), 'i')).toEqual({ ok: false, reason: 'level' });
  });
  it('fails when the balance is insufficient', async () => {
    expect(await buyItem(guild, prismaWith(baseItem, 50), member(), 'i')).toEqual({ ok: false, reason: 'balance' });
  });
  it('fails when the member already owns a permanent role', async () => {
    expect(await buyItem(guild, prismaWith(baseItem, 1000), member(true), 'i')).toEqual({ ok: false, reason: 'owned' });
  });
  it('grants the role, debits the wallet, and records the purchase on success', async () => {
    const prisma = prismaWith(baseItem, 1000);
    const m = member();
    const res = await buyItem(guild, prisma, m, 'i');
    expect(res.ok).toBe(true);
    expect(m.roles.add).toHaveBeenCalledWith('r', expect.anything());
    expect(prisma.shopPurchase.create).toHaveBeenCalledOnce();
  });
});
