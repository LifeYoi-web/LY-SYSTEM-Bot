import type { Guild, GuildMember } from 'discord.js';
import type { PrismaClient, ShopItem } from '@prisma/client';
import { getBalance, addCoins } from './economy';

export type BuyError = 'notfound' | 'disabled' | 'stock' | 'level' | 'balance' | 'owned' | 'role';

/** Purchase a shop item: validate, grant the role, debit the wallet, record the purchase. */
export async function buyItem(
  guild: Guild,
  prisma: PrismaClient,
  member: GuildMember,
  itemId: string,
): Promise<{ ok: true; item: ShopItem } | { ok: false; reason: BuyError }> {
  const item = await prisma.shopItem.findUnique({ where: { id: itemId } });
  if (!item || item.guildId !== guild.id) return { ok: false, reason: 'notfound' };
  if (!item.enabled) return { ok: false, reason: 'disabled' };
  if (item.stock === 0) return { ok: false, reason: 'stock' };
  if (item.requiredLevel != null) {
    const lvl = await prisma.memberLevel.findUnique({ where: { guildId_userId: { guildId: guild.id, userId: member.id } } });
    if ((lvl?.level ?? 0) < item.requiredLevel) return { ok: false, reason: 'level' };
  }
  if (member.roles.cache.has(item.roleId) && !item.durationHours) return { ok: false, reason: 'owned' };
  const bal = await getBalance(prisma, guild.id, member.id);
  if (bal < item.price) return { ok: false, reason: 'balance' };

  try {
    await member.roles.add(item.roleId, 'Role shop purchase');
  } catch {
    return { ok: false, reason: 'role' };
  }
  await addCoins(prisma, guild.id, member.id, -item.price, `shop:${item.id}`);
  if (item.stock > 0) await prisma.shopItem.update({ where: { id: item.id }, data: { stock: { decrement: 1 } } }).catch(() => undefined);
  const expiresAt = item.durationHours ? new Date(Date.now() + item.durationHours * 3_600_000) : null;
  await prisma.shopPurchase
    .create({ data: { guildId: guild.id, userId: member.id, itemId: item.id, roleId: item.roleId, expiresAt } })
    .catch(() => undefined);
  return { ok: true, item };
}

/** Remove roles whose temp-purchase has expired. Called by the scheduler. */
export async function expireDueRoles(guild: Guild, prisma: PrismaClient, now: Date = new Date()): Promise<number> {
  const due = await prisma.shopPurchase.findMany({ where: { guildId: guild.id, expiresAt: { not: null, lte: now } } });
  for (const p of due) {
    const m = await guild.members.fetch(p.userId).catch(() => null);
    await m?.roles.remove(p.roleId, 'Role shop rental expired').catch(() => undefined);
    await prisma.shopPurchase.delete({ where: { id: p.id } }).catch(() => undefined);
  }
  return due.length;
}

export const BUY_ERRORS: Record<BuyError, string> = {
  notfound: '❌ هذا العنصر غير موجود.',
  disabled: '❌ هذا العنصر غير متاح حاليًا.',
  stock: '❌ نفدت الكمية من هذا العنصر.',
  level: '❌ مستواك غير كافٍ لشراء هذا العنصر.',
  balance: '❌ رصيدك لا يكفي.',
  owned: '❌ تملك هذه الرتبة بالفعل.',
  role: '❌ تعذّر منح الرتبة — تأكد أن رتبة البوت أعلى منها.',
};
