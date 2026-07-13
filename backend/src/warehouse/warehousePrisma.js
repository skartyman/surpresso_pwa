import 'dotenv/config';
import prismaClientPkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { normalizeDatabaseUrl } from '../utils/databaseUrl.js';

const { PrismaClient } = prismaClientPkg;

let prisma = null;

export function getWarehousePrisma() {
  if (!prisma) {
    const url = normalizeDatabaseUrl(process.env.DATABASE_URL);
    const adapter = new PrismaPg({ connectionString: url });
    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}
