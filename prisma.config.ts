import { defineConfig } from 'prisma/config';
import 'dotenv/config';

export default defineConfig({
  // Required to use `tables.external` below.
  experimental: { externalTables: true },
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
  // The `session` table is created and owned by connect-pg-simple (the
  // express-session store), NOT by Prisma. Mark it external so `prisma db push`
  // leaves it alone instead of trying to drop it (which crashed the deploy).
  tables: {
    external: ['public.session'],
  },
});
