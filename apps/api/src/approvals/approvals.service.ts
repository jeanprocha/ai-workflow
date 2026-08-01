import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import type { ApprovalDecisionValue, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionsService } from '../executions/executions.service';

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function webUrl(): string {
  return process.env.WEB_URL ?? 'http://localhost:3000';
}

export interface ApprovalDecisionData {
  approved: boolean;
  comment: string | null;
  decidedBy: string | null;
  decidedAt: string;
}

const LIST_SELECT = {
  id: true,
  executionId: true,
  nodeId: true,
  title: true,
  expiresAt: true,
  onTimeout: true,
  decidedAt: true,
  decision: true,
  decidedBy: true,
  comment: true,
  createdAt: true,
} satisfies Prisma.ApprovalSelect;

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executions: ExecutionsService,
  ) {}

  /**
   * Chamado pelo RPC ctx.requestApproval (EngineService, dentro do worker).
   * Upsert em vez de create: se o sandbox morrer DEPOIS do RPC criar a linha
   * mas ANTES do node terminar (crash/OOM), a proxima tentativa de retry cai
   * no mesmo par [executionId, nodeId] e ROTACIONA o token — nao duplica (a
   * unique constraint impediria create()) nem falha o node. "So o ultimo
   * link vale" e o preco: se o primeiro e-mail chegou a sair antes do crash,
   * aquele link para de valer.
   */
  async create(params: {
    executionId: string;
    workspaceId: string;
    nodeId: string;
    title: string;
    timeoutHours: number;
    onTimeout: 'approve' | 'reject';
  }): Promise<{ approvalId: string; url: string }> {
    const raw = randomBytes(32).toString('hex');
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + params.timeoutHours * 3_600_000);

    const approval = await this.prisma.approval.upsert({
      where: {
        executionId_nodeId: {
          executionId: params.executionId,
          nodeId: params.nodeId,
        },
      },
      create: {
        executionId: params.executionId,
        workspaceId: params.workspaceId,
        nodeId: params.nodeId,
        title: params.title,
        tokenHash,
        expiresAt,
        onTimeout: params.onTimeout,
      },
      update: {
        title: params.title,
        tokenHash,
        expiresAt,
        onTimeout: params.onTimeout,
        decidedAt: null,
        decision: null,
        decidedBy: null,
        comment: null,
        resumeEnqueuedAt: null,
        resumeAttempts: 0,
      },
      select: { id: true },
    });

    return { approvalId: approval.id, url: `${webUrl()}/approve/${raw}` };
  }

  /** Estado publico por token — usado pela pagina /approve/[token] (C3). */
  async findByToken(rawToken: string) {
    const approval = await this.prisma.approval.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      select: {
        id: true,
        title: true,
        expiresAt: true,
        decidedAt: true,
        decision: true,
        comment: true,
      },
    });
    if (!approval) {
      throw new NotFoundException('Link de aprovacao invalido.');
    }
    return approval;
  }

  /** POST /approve/:token/decide — sem conta, o token e a prova de posse do link. */
  async decideByToken(
    rawToken: string,
    decision: 'approved' | 'rejected',
    comment: string | undefined,
  ): Promise<void> {
    const approval = await this.prisma.approval.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      select: { id: true },
    });
    if (!approval) {
      throw new NotFoundException('Link de aprovacao invalido.');
    }
    await this.consumeDecision(approval.id, decision, comment, null, 'not-expired');
  }

  /** POST /approvals/:id/approve|reject — autenticado, escopado ao workspace. */
  async decideById(
    workspaceId: string,
    approvalId: string,
    decision: 'approved' | 'rejected',
    comment: string | undefined,
    decidedBy: string,
  ): Promise<void> {
    const approval = await this.prisma.approval.findFirst({
      where: { id: approvalId, workspaceId },
      select: { id: true },
    });
    if (!approval) {
      throw new NotFoundException('Aprovacao nao encontrada.');
    }
    await this.consumeDecision(approval.id, decision, comment, decidedBy, 'not-expired');
  }

  /**
   * Sweeper (1a varredura, ApprovalsSweepProcessor) — timeout aplicado como
   * decisao do sistema. `false` = perdeu a corrida pra uma decisao humana
   * que acabou de chegar (esperado, nao e erro); o guard de expiracao aqui e
   * o OPOSTO do de consumeDecision via decide*(): so aplica se JA venceu o
   * prazo.
   */
  async applyTimeout(
    approvalId: string,
    onTimeout: 'approve' | 'reject',
  ): Promise<boolean> {
    try {
      await this.consumeDecision(
        approvalId,
        onTimeout === 'approve' ? 'approved' : 'rejected',
        undefined,
        'system:timeout-sweeper',
        'expired',
      );
      return true;
    } catch (error) {
      if (error instanceof ConflictException) return false;
      throw error;
    }
  }

  list(workspaceId: string) {
    return this.prisma.approval.findMany({
      where: { workspaceId },
      select: LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Consumo atomico: humano (decideByToken/decideById) e o sweeper (timeout)
   * disputam a MESMA linha sem transacao distribuida — o `where` com
   * `decidedAt: null` e o predicado de corrida (molde ApiKeysService.revoke).
   * count===0 cobre "ja decidida" e "expirou" com a mesma resposta: quem
   * chama nao precisa (nem deve) distinguir os dois pra agir diferente.
   */
  private async consumeDecision(
    approvalId: string,
    decision: 'approved' | 'rejected',
    comment: string | undefined,
    decidedBy: string | null,
    expiryGuard: 'not-expired' | 'expired',
  ): Promise<void> {
    const decidedAt = new Date();
    const { count } = await this.prisma.approval.updateMany({
      where: {
        id: approvalId,
        decidedAt: null,
        expiresAt:
          expiryGuard === 'not-expired' ? { gt: decidedAt } : { lte: decidedAt },
      },
      data: {
        decidedAt,
        decision,
        comment: comment ?? null,
        decidedBy,
      },
    });
    if (count === 0) {
      throw new ConflictException(
        'Esta aprovacao ja foi decidida ou expirou.',
      );
    }
    await this.enqueueResume(approvalId, {
      approved: decision === 'approved',
      comment: comment ?? null,
      decidedBy,
      decidedAt: decidedAt.toISOString(),
    });
  }

  /**
   * Extraido pra ser reaproveitado pelo sweeper (2a varredura: decididas mas
   * nunca enfileiradas, ver ApprovalsSweepProcessor) sem duplicar a logica
   * de resumeEnqueuedAt/resumeAttempts.
   */
  async enqueueResume(
    approvalId: string,
    data: ApprovalDecisionData,
  ): Promise<void> {
    const approval = await this.prisma.approval.findUniqueOrThrow({
      where: { id: approvalId },
      select: { executionId: true, nodeId: true },
    });
    await this.executions.enqueueResume(
      approval.executionId,
      approval.nodeId,
      data,
    );
    await this.prisma.approval.update({
      where: { id: approvalId },
      data: {
        resumeEnqueuedAt: new Date(),
        resumeAttempts: { increment: 1 },
      },
    });
  }

  /** Sweeper (1a varredura) — aprovacoes vencidas ainda sem decisao. */
  findExpiredUndecided(limit = 100) {
    return this.prisma.approval.findMany({
      where: { decidedAt: null, expiresAt: { lte: new Date() } },
      select: { id: true, onTimeout: true },
      take: limit,
    });
  }

  /**
   * Sweeper (2a varredura) — decididas mas cujo enqueueResume nunca rodou
   * (worker morreu entre o updateMany da decisao e o queue.add). Reconstroi
   * o ApprovalDecisionData a partir das colunas ja gravadas.
   */
  findDecidedNotEnqueued(maxAttempts: number, limit = 100) {
    return this.prisma.approval.findMany({
      where: {
        decidedAt: { not: null },
        resumeEnqueuedAt: null,
        resumeAttempts: { lt: maxAttempts },
      },
      select: {
        id: true,
        decision: true,
        comment: true,
        decidedBy: true,
        decidedAt: true,
      },
      take: limit,
    });
  }

  /** Sweeper — esgotaram as tentativas de reenfileirar (worker seguiu indisponivel). */
  findExhaustedResumes(maxAttempts: number, limit = 100) {
    return this.prisma.approval.findMany({
      where: {
        decidedAt: { not: null },
        resumeEnqueuedAt: null,
        resumeAttempts: { gte: maxAttempts },
      },
      select: { id: true, executionId: true },
      take: limit,
    });
  }

  /**
   * Chamado nos 3 caminhos terminais de uma execucao (engine.service.ts,
   * markStuckExecutionAsFailed, orphan recovery): sem isso, uma aprovacao
   * aberta continuaria com um link vivo na caixa de alguem depois da
   * execucao ja ter morrido por outro motivo. `void` nunca enfileira resume
   * (a execucao ja terminou) — so fecha a pendencia.
   */
  async voidOpenApprovals(executionId: string): Promise<void> {
    await this.prisma.approval.updateMany({
      where: { executionId, decidedAt: null },
      data: {
        decidedAt: new Date(),
        decision: 'void' satisfies ApprovalDecisionValue,
      },
    });
  }
}
