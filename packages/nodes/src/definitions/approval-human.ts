import nodemailer from "nodemailer";
import type { NodeDefinition } from "../types.js";
import { requireCredentialObject } from "../credential-payload.js";
import type { SmtpCredential } from "./email-send.meta.js";
import { approvalHumanMeta, type ApprovalHumanConfig } from "./approval-human.meta.js";

/** Formato de ctx.resumeData nesta execucao — decidido pelo endpoint/sweeper de aprovacoes (apps/api). */
interface ApprovalDecisionData {
  approved: boolean;
  comment: string | null;
  decidedBy: string | null;
  decidedAt: string;
}

export const approvalHumanNode: NodeDefinition<ApprovalHumanConfig> = {
  ...approvalHumanMeta,
  execute: async (ctx) => {
    if (ctx.resumeData === undefined) {
      const { approvalId, url } = await ctx.requestApproval({
        title: ctx.config.title,
        timeoutHours: ctx.config.timeoutHours,
        onTimeout: ctx.config.onTimeout,
      });

      // Decisao de produto (H2-06): o NODE envia o e-mail, nao a plataforma —
      // nada depois dele roda ate a decisao chegar, entao quem avisa tem que
      // ser quem pausou. Credencial do workspace (nao um mailer de sistema
      // compartilhado), mesmo molde de communication.email.
      const raw = await ctx.getCredential(ctx.config.credential);
      const smtp = requireCredentialObject(
        raw,
        ctx.config.credential,
        "host, port, user, pass",
      ) as unknown as SmtpCredential;
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure ?? smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.pass },
      });
      await transporter.sendMail({
        from: smtp.from ?? smtp.user,
        to: ctx.config.recipients,
        subject: `Aprovacao pendente: ${ctx.config.title}`,
        text: `${ctx.config.message ? `${ctx.config.message}\n\n` : ""}Decida em: ${url}`,
      });

      ctx.log("approval.requested", {
        approvalId,
        recipients: ctx.config.recipients,
      });
      return {
        // Passthrough: o resto do fluxo so ve o input de novo na retomada,
        // com approved/comment/decidedBy/decidedAt anexados (ver abaixo).
        output: ctx.input,
        suspend: {
          reason: "approval",
          ref: approvalId,
          label: ctx.config.title,
        },
      };
    }

    const decision = ctx.resumeData as ApprovalDecisionData;
    ctx.log("approval.decided", {
      approved: decision.approved,
      decidedBy: decision.decidedBy,
    });
    return {
      output: {
        input: ctx.input,
        approved: decision.approved,
        comment: decision.comment,
        decidedBy: decision.decidedBy,
        decidedAt: decision.decidedAt,
      },
      branches: [decision.approved ? "approved" : "rejected"],
    };
  },
};
