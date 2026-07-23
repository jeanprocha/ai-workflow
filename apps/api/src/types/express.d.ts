import type { WorkspaceRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      workspaceId?: string;
      workspaceRole?: WorkspaceRole;
    }
  }
}

export {};
