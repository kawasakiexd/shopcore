import type { Request } from 'express';
import type { Role } from '../../generated/prisma/client.js';

export type AuthUser = {
  id: string;
  role: Role;
  sessionId: string;
};

export type AuthenticatedRequest = Request & {
  user: AuthUser;
  id?: string;
};
