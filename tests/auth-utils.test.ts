import { describe, it, expect } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { isStaff } from '../src/api/auth-utils';

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
