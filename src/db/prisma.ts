import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { assertTenantScoped } from './tenant-guard';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const base = new PrismaClient({ adapter });

// Wrap with the tenant guard: any bulk operation on a tenant-scoped model that omits
// a guildId filter will throw immediately rather than silently reading cross-tenant rows.
// The cast to PrismaClient keeps the exported type stable for the ~40 importing modules —
// the extension adds no API surface we use, only a query interceptor. NOTE: the cast
// deliberately DISCARDS the extended client type (not just a rename) — if a future
// extension adds methods/narrowed returns we rely on, re-export the extended type instead.
export const prisma = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        assertTenantScoped(
          model,
          operation,
          args as { where?: Record<string, unknown> },
        );
        return query(args);
      },
    },
  },
}) as unknown as PrismaClient;
