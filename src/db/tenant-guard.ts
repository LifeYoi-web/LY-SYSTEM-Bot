// Defense-in-depth (2026-06-04 spec §6.7): a tenant-scoped bulk query that forgets
// its guildId filter fails CLOSED at the client layer instead of leaking another
// guild's rows. Unique-key single-row ops are exempt (handlers fetch by PK obtained
// from an already-scoped read); registry/global models are exempt by name.

const BULK_OPS = new Set([
  'findMany',
  'findFirst',
  'count',
  'updateMany',
  'deleteMany',
  'groupBy',
  'aggregate',
]);

/**
 * Models that are themselves the tenant registry, global config, or child-relation
 * tables with no guildId column of their own — never tenant-filtered by guildId.
 *
 * GuildSettings  — guildId IS the PK; it IS the per-tenant settings row. Bulk reads
 *                  are registry-level operations (e.g. "find all guilds"). Safe.
 * Subscription   — guildId IS the PK; the SaaS subscription registry. Bulk reads are
 *                  lifecycle sweeps (e.g. find all expiring subs). Safe.
 * ApplicationQuestion — child relation keyed by formId only; no guildId column exists
 *                  on this model. Queries always go through the parent ApplicationForm
 *                  which IS tenant-scoped. Cannot carry guildId — must be exempt.
 */
export const TENANT_EXEMPT_MODELS: ReadonlySet<string> = new Set([
  'Subscription',
  'GuildSettings',
  'ApplicationQuestion', // child-relation model — no guildId column; keyed by formId
]);

function hasGuildFilter(where: Record<string, unknown> | undefined): boolean {
  if (!where) return false;
  if (typeof where.guildId === 'string') return true;
  // Compound unique key e.g. DailyStat @@unique([guildId, date])
  const compound = where.guildId_date as { guildId?: unknown } | undefined;
  if (compound && typeof compound.guildId === 'string') return true;
  // AND-composed filters still count if any branch carries the guildId.
  const and = where.AND as
    | Array<Record<string, unknown>>
    | Record<string, unknown>
    | undefined;
  if (Array.isArray(and)) return and.some((w) => hasGuildFilter(w));
  if (and) return hasGuildFilter(and);
  return false;
}

export function assertTenantScoped(
  model: string,
  operation: string,
  args: { where?: Record<string, unknown> } | undefined,
): void {
  if (!BULK_OPS.has(operation)) return;
  if (TENANT_EXEMPT_MODELS.has(model)) return;
  if (hasGuildFilter(args?.where)) return;
  throw new Error(
    `tenant guard: ${model}.${operation} without a guildId filter (fail closed)`,
  );
}
