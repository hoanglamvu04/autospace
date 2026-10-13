import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export * from './generated/prisma/enums';
export type { Prisma } from './generated/prisma/client';

export function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
