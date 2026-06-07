import { describe, it, expect, vi } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { isStaff, discoverManageableGuilds } from '../src/api/auth-utils';

function member(opts: { admin?: boolean; manage?: boolean; roleIds?: string[] }) {
  return {
    permissions: {
      has: (flag: bigint) =>
        (flag === PermissionFlagsBits.Administrator && !!opts.admin) ||
        (flag === PermissionFlagsBits.ManageGuild && !!opts.manage),
    },
    roles: { cache: { some: (fn: (r: any) => boolean) => (opts.roleIds ?? []).map((id) => ({ id })).some(fn) } },
  } as any;
}

describe('isStaff', () => {
  it('allows administrators', () => {
    expect(isStaff(member({ admin: true }), [])).toBe(true);
  });
  it('allows Manage Guild', () => {
    expect(isStaff(member({ manage: true }), [])).toBe(true);
  });
  it('allows a configured staff role', () => {
    expect(isStaff(member({ roleIds: ['r1'] }), ['r1'])).toBe(true);
  });
  it('rejects a plain member', () => {
    expect(isStaff(member({ roleIds: ['r9'] }), ['r1'])).toBe(false);
  });
});

describe('discoverManageableGuilds', () => {
  function fakeClient(guilds: Array<{ id: string; member: any | null; staffRoleIds?: string[] }>) {
    return {
      guilds: {
        cache: new Map(
          guilds.map((g) => [
            g.id,
            {
              id: g.id,
              name: `name-${g.id}`,
              iconURL: () => null,
              members: { fetch: vi.fn(() => (g.member ? Promise.resolve(g.member) : Promise.reject(new Error('unknown member')))) },
            },
          ]),
        ),
      },
    } as any;
  }
  const admin = { permissions: { has: () => true }, roles: { cache: { some: () => false } } };
  const pleb = { permissions: { has: () => false }, roles: { cache: { some: () => false } } };

  it('returns only guilds where the user is staff', async () => {
    const client = fakeClient([
      { id: 'gA', member: admin },
      { id: 'gB', member: pleb },
      { id: 'gC', member: null }, // not a member at all
    ]);
    const getStaffRoleIds = vi.fn().mockResolvedValue([]);
    const result = await discoverManageableGuilds(client, 'u1', getStaffRoleIds);
    expect(result.map((g) => g.id)).toEqual(['gA']);
    expect(result[0].name).toBe('name-gA');
  });

  it('a guild whose settings read fails is skipped (never blocks login)', async () => {
    const client = fakeClient([{ id: 'gA', member: admin }]);
    const getStaffRoleIds = vi.fn().mockRejectedValue(new Error('db down'));
    // admin bypasses staff roles, so a settings failure must not exclude an admin:
    const result = await discoverManageableGuilds(client, 'u1', getStaffRoleIds);
    expect(result.map((g) => g.id)).toEqual(['gA']);
  });
});
