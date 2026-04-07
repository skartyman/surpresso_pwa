import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { normalizeDatabaseUrl } from '../../utils/databaseUrl.js';

let prisma = null;

function createPrismaAdapter() {
  return new PrismaPg({
    connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL),
  });
}

export function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      adapter: createPrismaAdapter(),
    });
  }
  return prisma;
}
