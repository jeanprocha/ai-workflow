import type { WorkspaceRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      workspaceId?: string;
      workspaceRole?: WorkspaceRole;
      /** H2-04: preenchido pelo FlowApiKeyGuard (rotas publicas v1/flows). */
      flowApiKey?: { id: string; workflowId: string };
    }
  }
}

export {};
