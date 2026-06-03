import type { PrismaClient, EconomyConfig } from '@prisma/client';
import { computeDaily } from '../shared/economy';

// Per-user earn cooldown (in memory), mirroring the XP cooldown so chatting earns
// currency at most once per window without a DB write on every message.
const earnCooldown = new Map<string, number>();

export async function awardMessageCoins(
  prisma: PrismaClient,
  guildId: string,
  userId: string,
  cfg: EconomyConfig,
  now = Date.now(),
): Promise<number> {
  const gain = Math.max(0, cfg.perMessage);
  if (gain <= 0) return 0;
  const key = `${guildId}:${userId}`;
  const last = earnCooldown.get(key) ?? 0;
  if (now - last < cfg.cooldownSeconds * 1000) return 0;
  earnCooldown.set(key, now);
  if (earnCooldown.size > 20_000) {
    for (const [k, t] of earnCooldown) if (now - t > 3_600_000) earnCooldown.delete(k);
  }
  await prisma.wallet.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId, balance: gain },
    update: { balance: { increment: gain } },
  });
  return gain;
}

export async function getBalance(prisma: PrismaClient, guildId: string, userId: string): Promise<number> {
  const w = await prisma.wallet.findUnique({ where: { guildId_userId: { guildId, userId } } });
  return w?.balance ?? 0;
}

/** Credit (positive) or debit (negative) a wallet and log the transaction. Returns the new balance. */
export async function addCoins(
  prisma: PrismaClient,
  guildId: string,
  userId: string,
  amount: number,
  reason: string,
): Promise<number> {
  const w = await prisma.wallet.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId, balance: Math.max(0, amount) },
    update: { balance: { increment: amount } },
  });
  await prisma.economyTransaction.create({ data: { guildId, userId, amount, reason } }).catch(() => undefined);
  return w.balance;
}

export interface DailyClaim {
  claimed: boolean;
  amount: number;
  streak: number;
  balance: number;
}

export async function claimDaily(
  prisma: PrismaClient,
  guildId: string,
  userId: string,
  cfg: EconomyConfig,
  now: Date = new Date(),
): Promise<DailyClaim> {
  const w = await prisma.wallet.findUnique({ where: { guildId_userId: { guildId, userId } } });
  const res = computeDaily(w?.lastDaily ?? null, w?.streak ?? 0, cfg, now);
  if (!res.claimed) return { ...res, balance: w?.balance ?? 0 };
  const updated = await prisma.wallet.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId, balance: res.amount, lastDaily: now, streak: res.streak },
    update: { balance: { increment: res.amount }, lastDaily: now, streak: res.streak },
  });
  await prisma.economyTransaction.create({ data: { guildId, userId, amount: res.amount, reason: 'daily' } }).catch(() => undefined);
  return { ...res, balance: updated.balance };
}

export type TransferError = 'amount' | 'self' | 'balance';

/** Move currency between two members atomically. */
export async function transfer(
  prisma: PrismaClient,
  guildId: string,
  fromId: string,
  toId: string,
  amount: number,
): Promise<{ ok: true } | { ok: false; reason: TransferError }> {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: 'amount' };
  if (fromId === toId) return { ok: false, reason: 'self' };
  const from = await prisma.wallet.findUnique({ where: { guildId_userId: { guildId, userId: fromId } } });
  if (!from || from.balance < amount) return { ok: false, reason: 'balance' };
  await prisma.$transaction([
    prisma.wallet.update({ where: { guildId_userId: { guildId, userId: fromId } }, data: { balance: { decrement: amount } } }),
    prisma.wallet.upsert({
      where: { guildId_userId: { guildId, userId: toId } },
      create: { guildId, userId: toId, balance: amount },
      update: { balance: { increment: amount } },
    }),
  ]);
  await prisma.economyTransaction
    .createMany({
      data: [
        { guildId, userId: fromId, amount: -amount, reason: 'transfer_out' },
        { guildId, userId: toId, amount, reason: 'transfer_in' },
      ],
    })
    .catch(() => undefined);
  return { ok: true };
}

export function _resetEarnCooldown(): void {
  earnCooldown.clear();
}
