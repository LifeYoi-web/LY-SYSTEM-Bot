import { describe, it, expect } from 'vitest';
import { assertTenantScoped, TENANT_EXEMPT_MODELS } from '../src/db/tenant-guard';

describe('assertTenantScoped', () => {
  it('passes bulk reads that carry where.guildId', () => {
    expect(() =>
      assertTenantScoped('Tag', 'findMany', { where: { guildId: 'g1' } }),
    ).not.toThrow();
    expect(() =>
      assertTenantScoped('DailyStat', 'findMany', {
        where: { guildId_date: { guildId: 'g1', date: 'x' } },
      }),
    ).not.toThrow();
  });

  it('passes bulk reads with AND-composed guildId filter', () => {
    expect(() =>
      assertTenantScoped('ModerationCase', 'findMany', {
        where: { AND: [{ guildId: 'g1' }, { active: true }] },
      }),
    ).not.toThrow();
  });

  it('throws on a bulk read missing the tenant filter', () => {
    expect(() =>
      assertTenantScoped('Tag', 'findMany', { where: {} }),
    ).toThrow(/guildId/);
    expect(() => assertTenantScoped('Tag', 'deleteMany', {})).toThrow(
      /guildId/,
    );
    expect(() =>
      assertTenantScoped('MemberLevel', 'count', { where: { userId: 'u1' } }),
    ).toThrow(/guildId/);
  });

  it('exempts non-tenant models and unique single-row ops', () => {
    // Registry models — exempt regardless of args
    expect(() =>
      assertTenantScoped('Subscription', 'findMany', {}),
    ).not.toThrow();
    expect(() =>
      assertTenantScoped('GuildSettings', 'findMany', {}),
    ).not.toThrow();
    // Child-relation model with no guildId column — exempt
    expect(() =>
      assertTenantScoped('ApplicationQuestion', 'findMany', {
        where: { formId: 'f1' },
      }),
    ).not.toThrow();
    // Single-row ops (non-bulk) are never checked
    expect(() =>
      assertTenantScoped('Tag', 'findUnique', { where: { id: 1 } }),
    ).not.toThrow();
    expect(() =>
      assertTenantScoped('Tag', 'update', { where: { id: 1 } }),
    ).not.toThrow();
  });

  it('exempt list is the deliberate registry + global/child-relation set', () => {
    // Schema audit (2026-06-07):
    //   GuildSettings   — guildId IS the PK (tenant registry); bulk ops are registry sweeps
    //   Subscription    — guildId IS the PK (SaaS subscription registry); lifecycle sweeps
    //   ApplicationQuestion — child-relation keyed by formId only; NO guildId column exists
    // All other 48 models carry a guildId field and are tenant-scoped.
    expect([...TENANT_EXEMPT_MODELS].sort()).toEqual(
      ['ApplicationQuestion', 'GuildSettings', 'Subscription'].sort(),
    );
  });
});
