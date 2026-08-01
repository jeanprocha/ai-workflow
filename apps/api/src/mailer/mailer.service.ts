import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Email de sistema (H1.5): transporte SMTP generico via env — diferente das
 * credenciais SMTP por workspace do node `email.send` (packages/nodes).
 * Sem `SMTP_HOST`, fica em modo no-op com aviso no log: dev/test local sem
 * Mailpit no ar nao quebra, so nao manda email de verdade.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor() {
    const host = process.env.SMTP_HOST;
    this.from = process.env.EMAIL_FROM ?? 'no-reply@workflow.local';

    if (!host) {
      this.logger.warn(
        'SMTP_HOST nao configurada — envio de email desabilitado (no-op). ' +
          'Ver docs/deploy/railway.md.',
      );
      this.transporter = null;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }

  async send(params: SendEmailParams): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        `Email para ${params.to} nao enviado (SMTP desabilitado) — assunto: ${params.subject}`,
      );
      return;
    }
    await this.transporter.sendMail({
      from: this.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
  }
}
