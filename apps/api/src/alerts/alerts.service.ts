import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { MailerService } from '../mailer/mailer.service';

const THROTTLE_WINDOW_SECONDS =
  Number(process.env.ALERT_THROTTLE_MINUTES ?? 10) * 60;
const WEBHOOK_TIMEOUT_MS = 5_000;

export interface FailureAlertParams {
  workspaceId: string;
  workflowId: string;
  workflowName: string;
  executionId: string;
  error: string;
}

/**
 * Alerting de falhas de execucao (H1.6). Chamado no ponto unico de
 * finalizacao com falha do engine (worker) — nunca deve derrubar a
 * execucao por causa de um alerta que falhou, por isso todo o dispatch
 * roda protegido em `notifyExecutionFailed`.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly mailer: MailerService,
  ) {}

  async notifyExecutionFailed(params: FailureAlertParams): Promise<void> {
    try {
      await this.dispatch(params);
    } catch (error) {
      this.logger.warn(
        `Falha ao disparar alerta de execucao: ${String(error)}`,
      );
    }
  }

  private async dispatch(params: FailureAlertParams): Promise<void> {
    // Anti-spam: no maximo 1 alerta por workflow a cada N minutos — get+set
    // nao e atomico, mas isso e throttle de UX, nao controle de seguranca;
    // uma corrida rara disparando 2 alertas em vez de 1 e aceitavel.
    const throttleKey = `alert-throttle:${params.workflowId}`;
    const throttled = await this.cache.get(throttleKey);
    if (throttled) return;
    await this.cache.set(throttleKey, '1', THROTTLE_WINDOW_SECONDS);

    const settings = await this.prisma.workspaceAlertSetting.findUnique({
      where: { workspaceId: params.workspaceId },
    });
    // Sem linha ainda (workspace nunca mexeu na config) = email habilitado
    // por padrao, sem webhook — mesmo default do schema.
    const emailEnabled = settings?.emailEnabled ?? true;
    const webhookUrl = settings?.webhookUrl;

    if (!emailEnabled && !webhookUrl) return;

    const executionUrl = `${this.webUrl}/executions/${params.executionId}`;

    await Promise.allSettled([
      emailEnabled
        ? this.sendEmailAlert(params, executionUrl)
        : Promise.resolve(),
      webhookUrl
        ? this.sendWebhookAlert(params, executionUrl, webhookUrl)
        : Promise.resolve(),
    ]);
  }

  private async sendEmailAlert(
    params: FailureAlertParams,
    executionUrl: string,
  ): Promise<void> {
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: params.workspaceId },
      include: { user: true },
    });
    await Promise.allSettled(
      members.map((member) =>
        this.mailer.send({
          to: member.user.email,
          subject: `Falha na execucao de "${params.workflowName}"`,
          html:
            `<p>O fluxo <strong>${params.workflowName}</strong> falhou.</p>` +
            `<p>Erro: ${escapeHtml(params.error)}</p>` +
            `<p><a href="${executionUrl}">Ver execucao</a></p>`,
          text: `Fluxo "${params.workflowName}" falhou: ${params.error}\n${executionUrl}`,
        }),
      ),
    );
  }

  private async sendWebhookAlert(
    params: FailureAlertParams,
    executionUrl: string,
    webhookUrl: string,
  ): Promise<void> {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'execution.failed',
        workflowId: params.workflowId,
        workflowName: params.workflowName,
        executionId: params.executionId,
        error: params.error,
        url: executionUrl,
      }),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
  }

  /**
   * Botao "enviar teste" do Settings — sempre dispara na hora (sem throttle
   * anti-spam) e so pro email de quem clicou, nao pro workspace inteiro.
   */
  async sendTest(params: {
    workspaceId: string;
    toEmail: string;
    webhookUrl?: string;
  }): Promise<void> {
    await Promise.allSettled([
      this.mailer.send({
        to: params.toEmail,
        subject: 'Teste de alerta — Workflow AI',
        html: '<p>Este e um email de teste dos alertas de falha de execucao. Se voce recebeu isso, o canal de email esta funcionando.</p>',
        text: 'Este e um email de teste dos alertas de falha de execucao.',
      }),
      params.webhookUrl
        ? fetch(params.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'alert.test',
              workspaceId: params.workspaceId,
            }),
            signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
          })
        : Promise.resolve(),
    ]);
  }

  private get webUrl(): string {
    return process.env.WEB_URL ?? 'http://localhost:3000';
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
