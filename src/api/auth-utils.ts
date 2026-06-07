import { PermissionFlagsBits } from 'discord.js';

export interface StaffCheckMember {
  permissions: { has: (flag: bigint) => boolean };
  roles: { cache: { some: (fn: (r: { id: string }) => boolean) => boolean } };
}

export function isStaff(member: StaffCheckMember, staffRoleIds: string[]): boolean {
  if (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  ) {
    return true;
  }
  return member.roles.cache.some((r) => staffRoleIds.includes(r.id));
}

export interface ManageableGuild {
  id: string;
  name: string;
  icon: string | null;
}

/**
 * Every mutual guild where the user is staff. Per-guild failures (uncached member,
 * settings read error) skip that guild's staff-role check but never block login —
 * admins resolve from permissions alone.
 * NOTE: member fetches run SEQUENTIALLY (one REST roundtrip per uncached guild) —
 * fine at current fleet size; batch with Promise.allSettled if logins get slow at scale.
 */
export async function discoverManageableGuilds(
  client: { guilds: { cache: Map<string, any> } },
  userId: string,
  getStaffRoleIds: (guildId: string) => Promise<string[]>,
): Promise<ManageableGuild[]> {
  const out: ManageableGuild[] = [];
  for (const guild of client.guilds.cache.values()) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) continue;
    const staffRoleIds = await getStaffRoleIds(guild.id).catch(() => [] as string[]);
    if (!isStaff(member, staffRoleIds)) continue;
    out.push({ id: guild.id, name: guild.name, icon: guild.iconURL?.() ?? null });
  }
  return out;
}
