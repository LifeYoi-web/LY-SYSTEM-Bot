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
