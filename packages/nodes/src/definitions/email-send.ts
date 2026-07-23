import nodemailer from "nodemailer";
import type { NodeDefinition } from "../types.js";
import { emailSendMeta, type EmailSendConfig, type SmtpCredential } from "./email-send.meta.js";

export const emailSendNode: NodeDefinition<EmailSendConfig> = {
  ...emailSendMeta,
  execute: async (ctx) => {
    const raw = await ctx.getCredential(ctx.config.credential);
    const smtp = JSON.parse(raw) as SmtpCredential;

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure ?? smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    const info = await transporter.sendMail({
      from: smtp.from ?? smtp.user,
      to: ctx.config.to,
      subject: ctx.config.subject,
      text: ctx.config.body,
    });

    ctx.log("email.sent", { to: ctx.config.to, messageId: info.messageId });
    return { output: { messageId: info.messageId } };
  },
};
