import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionsService } from './executions.service';

interface ErrorWorkflowPayload {
  workflowId: string;
  workflowName: string;
  executionId: string;
  error: string;
  failedNodeId: string | null;
  triggerType: string;
  timestamp: string;
}

/**
 * H2-05: dispara o `Workflow.errorWorkflowId` de um fluxo que acabou de
 * falhar. Chamado dos 3 pontos onde uma execucao pode ser fechada como
 * failed: engine.service.ts (caminho normal), executions.processor.ts (rede
 * de segurança H2-04) e worker/orphan-recovery.service.ts (worker morto).
 */
@Injectable()
export class ErrorWorkflowService {
  private readonly logger = new Logger(ErrorWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executions: ExecutionsService,
  ) {}

  /**
   * Fire-and-forget auto-protegido (mesmo contrato do AlertsService): nunca
   * propaga erro pro chamador. De proposito SEM o throttle de
   * alerts.service.ts — falha de execucao disparar o tratador nao e a mesma
   * coisa que notificar um humano, e um nao deve limitar o outro.
   */
  async dispatchForFailedExecution(
    executionId: string,
    opts: { failedNodeId?: string | null } = {},
  ): Promise<void> {
    try {
      const execution = await this.prisma.execution.findUnique({
        where: { id: executionId },
        select: {
          id: true,
          error: true,
          traceId: true,
          triggerType: true,
          workflow: {
            select: { id: true, name: true, errorWorkflowId: true },
          },
        },
      });
      if (!execution || !execution.workflow.errorWorkflowId) return;

      // Anti-recursao: uma execucao 'event' (ja e ela mesma um tratamento de
      // erro) nunca dispara outro error workflow — a cadeia tem profundidade
      // maxima 1 por construcao, mesmo se A e B apontarem um pro outro.
      if (execution.triggerType === 'event') return;
      // Defesa extra (o PATCH ja rejeita isso na origem, ver workflows.service.ts).
      if (execution.workflow.errorWorkflowId === execution.workflow.id) return;

      const handler = await this.prisma.workflow.findUnique({
        where: { id: execution.workflow.errorWorkflowId },
        select: { id: true, status: true, currentVersionId: true },
      });
      if (!handler || handler.status === 'archived' || !handler.currentVersionId) {
        return;
      }

      const payload: ErrorWorkflowPayload = {
        workflowId: execution.workflow.id,
        workflowName: execution.workflow.name,
        executionId: execution.id,
        error: execution.error ?? 'Erro desconhecido.',
        failedNodeId: opts.failedNodeId ?? null,
        triggerType: execution.triggerType,
        timestamp: new Date().toISOString(),
      };

      await this.executions.triggerErrorWorkflow(
        handler.id,
        handler.currentVersionId,
        payload,
        {
          parentExecutionId: execution.id,
          traceId: execution.traceId ?? execution.id,
        },
      );
    } catch (error) {
      this.logger.warn(
        `Falha ao disparar o error workflow da execucao ${executionId}: ${String(error)}`,
      );
    }
  }
}
