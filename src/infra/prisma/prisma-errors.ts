import { Prisma } from '../../generated/prisma/client.js';

export function isUniqueViolation(error: unknown, target: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const metaTarget = error.meta?.target;
  if (Array.isArray(metaTarget)) return metaTarget.includes(target);
  if (typeof metaTarget === 'string') return metaTarget.includes(target);
  return false;
}

export function isPrismaNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}
