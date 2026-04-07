import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';
import { normalizeDatabaseUrl } from './src/utils/databaseUrl.js';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  engine: 'classic',
  datasource: {
    url: normalizeDatabaseUrl(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/postgres"),
  },
});
