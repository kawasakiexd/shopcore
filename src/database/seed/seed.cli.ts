import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { runSeed } from './seed.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
try {
  await runSeed(prisma, { now: new Date() });
  console.log('Seed complete');
} finally {
  await prisma.$disconnect();
}
