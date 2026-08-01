const sendMail = jest.fn().mockResolvedValue({ messageId: 'msg-1' });
const createTransport = jest.fn().mockReturnValue({ sendMail });
jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: (...args: unknown[]) => createTransport(...args) },
}));
// approval-human.meta.ts importa APPROVAL_NODE_TYPE de @workflow/shared em
// runtime — pacote ESM puro (dist "type":"module"), incompativel com o
// ts-jest deste pacote rodando em CJS (mesma familia de mock usada em varios
// specs de apps/api, ex. engine.service.spec.ts).
jest.mock("@workflow/shared", () => ({ APPROVAL_NODE_TYPE: "approval.human" }));

import { approvalHumanNode } from "./approval-human.js";
import type { ApprovalHumanConfig } from "./approval-human.meta.js";
import type { NodeExecutionContext, NodeLogLevel } from "../types.js";

const SMTP_CREDENTIAL = JSON.stringify({
  host: "smtp.example.com",
  port: 587,
  user: "bot@example.com",
  pass: "secret",
});

function buildCtx(overrides: {
  config?: Partial<ApprovalHumanConfig>;
  input?: unknown;
  resumeData?: unknown;
  requestApproval?: NodeExecutionContext<ApprovalHumanConfig>["requestApproval"];
} = {}) {
  const logs: Array<{ event: string; payload?: unknown; level?: NodeLogLevel }> = [];
  const notUsed = () => {
    throw new Error("RPC nao usado por este node neste teste.");
  };
  const ctx: NodeExecutionContext<ApprovalHumanConfig> = {
    config: {
      title: "Aprovar desconto",
      credential: "smtp-workspace",
      recipients: "gestor@example.com",
      message: "",
      timeoutHours: 24,
      onTimeout: "reject",
      ...overrides.config,
    },
    input: overrides.input ?? { valor: 100 },
    vars: {},
    log: (event, payload, level) => {
      logs.push({ event, payload, level });
    },
    getCredential: async () => SMTP_CREDENTIAL,
    callAgent: notUsed,
    searchKnowledge: notUsed,
    callMcpTool: notUsed,
    sendChatMessage: notUsed,
    requestApproval:
      overrides.requestApproval ??
      (async () => ({ approvalId: "appr-1", url: "http://localhost:3000/approve/tok" })),
    resumeData: overrides.resumeData,
  };
  return { ctx, logs };
}

describe("approval.human", () => {
  beforeEach(() => {
    sendMail.mockClear();
    createTransport.mockClear();
  });

  it("primeira passada (sem resumeData): pede a aprovacao via RPC, manda o e-mail e devolve suspend", async () => {
    const requestApproval = jest
      .fn()
      .mockResolvedValue({ approvalId: "appr-1", url: "http://localhost:3000/approve/tok" });
    const { ctx } = buildCtx({ requestApproval });

    const result = await approvalHumanNode.execute(ctx);

    expect(requestApproval).toHaveBeenCalledWith({
      title: "Aprovar desconto",
      timeoutHours: 24,
      onTimeout: "reject",
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "gestor@example.com",
        subject: expect.stringContaining("Aprovar desconto"),
        text: expect.stringContaining("http://localhost:3000/approve/tok"),
      }),
    );
    // Passthrough: quem espera o output antes da decisao ve o input original.
    expect(result.output).toEqual({ valor: 100 });
    expect(result.suspend).toEqual({
      reason: "approval",
      ref: "appr-1",
      label: "Aprovar desconto",
    });
    expect(result.branches).toBeUndefined();
  });

  it("retomada aprovada (resumeData presente): roteia pelo branch 'approved' com os metadados da decisao", async () => {
    const { ctx } = buildCtx({
      resumeData: {
        approved: true,
        comment: "ok, pode mandar",
        decidedBy: "ana@example.com",
        decidedAt: "2026-08-01T12:00:00.000Z",
      },
    });

    const result = await approvalHumanNode.execute(ctx);

    expect(result.branches).toEqual(["approved"]);
    expect(result.output).toEqual({
      input: { valor: 100 },
      approved: true,
      comment: "ok, pode mandar",
      decidedBy: "ana@example.com",
      decidedAt: "2026-08-01T12:00:00.000Z",
    });
  });

  it("retomada rejeitada: roteia pelo branch 'rejected'", async () => {
    const { ctx } = buildCtx({
      resumeData: {
        approved: false,
        comment: null,
        decidedBy: null,
        decidedAt: "2026-08-01T12:00:00.000Z",
      },
    });

    const result = await approvalHumanNode.execute(ctx);

    expect(result.branches).toEqual(["rejected"]);
    expect(result.output).toMatchObject({ approved: false });
  });

  it("na retomada, NAO chama requestApproval de novo (o RPC so acontece na 1a passada)", async () => {
    const requestApproval = jest.fn();
    const { ctx } = buildCtx({
      requestApproval,
      resumeData: {
        approved: true,
        comment: null,
        decidedBy: null,
        decidedAt: "2026-08-01T12:00:00.000Z",
      },
    });

    await approvalHumanNode.execute(ctx);

    expect(requestApproval).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
});
