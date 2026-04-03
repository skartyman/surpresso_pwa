import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

let prisma = null;

function createPrismaAdapter() {
  return new PrismaPg({
    connectionString: process.env.DATABASE_URL,
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
