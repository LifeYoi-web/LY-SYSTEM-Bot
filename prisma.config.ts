import { defineConfig } from 'prisma/config';
import 'dotenv/config';

export default defineConfig({
  earlyAccess: true,
  schema: 'prisma/schema.prisma',
  migrate: {
    adapter: async () => {
      const { PrismaPg } = await import('@prisma/adapter-pg');
      const { Pool } = await import('pg');
      const connectionString = process.env.DATABASE_URL ?? '';
      const pool = new Pool({ connectionString });
      return new PrismaPg(pool);
    },
  },
});
