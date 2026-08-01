import type { APIRequestContext } from "@playwright/test";
import { API_URL, type AuthTokens } from "./auth";
import { workspaceHeaders, createCredentialViaApi } from "./settings";

/**
 * Credencial SMTP apontando pro Mailpit local (docker-compose.dev.yml,
 * porta 1025) — mesmo servidor que o SMTP_HOST/PORT da plataforma usa pro
 * reset de senha (helpers/mailpit.ts), so que aqui como uma Conexao de
 * WORKSPACE multi-campo (kind: "fields"), que e o formato que
 * requireCredentialObject() exige pro node approval.human/communication.email.
 *
 * Devolve `name` (nao so `id`): `config.credential` do node e resolvido por
 * NOME (EngineService.getCredential faz `findFirst({workspaceId, name})`),
 * nao pelo id da linha — mesma convencao de todo node com CredentialField
 * no config panel (apps/web/src/components/editor/config-panel.tsx).
 */
export async function createSmtpCredentialViaApi(
  request: APIRequestContext,
  tokens: AuthTokens,
  workspaceId: string,
  name = "smtp-e2e",
): Promise<{ id: string; name: string }> {
  const credential = await createCredentialViaApi(request, tokens, workspaceId, {
    provider: "smtp",
    name,
    kind: "fields",
    fields: [
      // 127.0.0.1, NAO "localhost": nesta maquina de dev, Node tenta ::1
      // primeiro e leva ~10s pra falhar antes de cair pro IPv4 — nodemailer
      // herda esse delay por chamada (ver dev_env_lan_ip na memoria do
      // projeto, mesmo quirk de DNS).
      { key: "host", value: "127.0.0.1", type: "text" },
      { key: "port", value: "1025", type: "number" },
      { key: "user", value: "e2e", type: "text" },
      { key: "pass", value: "e2e", type: "text" },
    ],
  });
  return { id: credential.id, name };
}

/** trigger.manual -> approval.human -> (approved: logic.log | rejected: logic.log), branches distinguiveis. */
export function approvalGraph(options: {
  credential: string;
  recipients: string;
  title?: string;
  timeoutHours?: number;
  onTimeout?: "approve" | "reject";
}) {
  return {
    nodes: [
      {
        id: "n1",
        type: "trigger.manual",
        category: "trigger",
        label: "Manual Trigger",
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: "n2",
        type: "approval.human",
        category: "logic",
        label: "Aprovacao humana",
        position: { x: 320, y: 0 },
        config: {
          title: options.title ?? "Aprovar desconto (e2e)",
          credential: options.credential,
          recipients: options.recipients,
          message: "",
          timeoutHours: options.timeoutHours ?? 24,
          onTimeout: options.onTimeout ?? "reject",
        },
      },
      {
        id: "n3",
        type: "logic.log",
        category: "logic",
        label: "Log",
        position: { x: 640, y: -80 },
        config: { message: "aprovado" },
      },
      {
        id: "n4",
        type: "logic.log",
        category: "logic",
        label: "Log",
        position: { x: 640, y: 80 },
        config: { message: "rejeitado" },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3", sourceHandle: "approved" },
      { id: "e3", source: "n2", target: "n4", sourceHandle: "rejected" },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/**
 * H2-06 regressao critica: Parallel com um lado suspenso (approval.human) e
 * outro que completa normalmente, os dois alimentando o mesmo Merge. Sem o
 * guard `suspendedAll.size === 0` no flush de merge (engine.service.ts), o
 * merge rodaria so com o lado B assim que a onda "esvaziasse", terminando a
 * execucao como success com a aprovacao ainda pendente.
 */
export function approvalParallelMergeGraph(options: {
  credential: string;
  recipients: string;
}) {
  return {
    nodes: [
      {
        id: "n1",
        type: "trigger.manual",
        category: "trigger",
        label: "Manual Trigger",
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: "n2",
        type: "logic.parallel",
        category: "logic",
        label: "Parallel",
        position: { x: 320, y: 0 },
        config: {},
      },
      {
        id: "n3",
        type: "approval.human",
        category: "logic",
        label: "Aprovacao humana",
        position: { x: 640, y: -80 },
        config: {
          title: "Aprovar desconto (e2e parallel)",
          credential: options.credential,
          recipients: options.recipients,
          message: "",
          timeoutHours: 24,
          onTimeout: "reject",
        },
      },
      {
        id: "n4",
        type: "logic.log",
        category: "logic",
        label: "Log",
        position: { x: 640, y: 80 },
        config: { message: "lado-b" },
      },
      {
        id: "n5",
        type: "logic.merge",
        category: "logic",
        label: "Merge",
        position: { x: 960, y: 0 },
        config: {},
      },
      {
        id: "n6",
        type: "logic.log",
        category: "logic",
        label: "Log",
        position: { x: 1280, y: 0 },
        config: { message: "merged" },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3", sourceHandle: "1" },
      { id: "e3", source: "n2", target: "n4", sourceHandle: "2" },
      { id: "e4", source: "n3", target: "n5" },
      { id: "e5", source: "n4", target: "n5" },
      { id: "e6", source: "n5", target: "n6" },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

export interface PublicApprovalEnvelope {
  id?: string;
  title?: string;
  expiresAt?: string;
  decidedAt?: string | null;
  decision?: string | null;
  comment?: string | null;
  message?: string;
}

export async function getApprovalStatus(
  request: APIRequestContext,
  token: string,
): Promise<{ status: number; body: PublicApprovalEnvelope }> {
  const response = await request.get(`${API_URL}/approve/${token}`);
  return { status: response.status(), body: await response.json() };
}

export async function decideApprovalByToken(
  request: APIRequestContext,
  token: string,
  decision: "approved" | "rejected",
  comment?: string,
): Promise<{ status: number; body: PublicApprovalEnvelope }> {
  const response = await request.post(`${API_URL}/approve/${token}/decide`, {
    data: { decision, comment },
  });
  // ApprovePublicController.decide() nao devolve corpo no caminho feliz
  // (void) — so no erro (409/404) o Nest manda um JSON de verdade.
  // response.json() lanca em corpo vazio, mesma pegadinha documentada em
  // apps/web/src/lib/api-client.ts pros DELETEs sem corpo.
  const text = await response.text();
  return { status: response.status(), body: text ? JSON.parse(text) : {} };
}

export interface ApprovalListItem {
  id: string;
  executionId: string;
  nodeId: string;
  title: string;
  decidedAt: string | null;
  decision: string | null;
  [key: string]: unknown;
}

export async function listApprovalsViaApi(
  request: APIRequestContext,
  tokens: AuthTokens,
  workspaceId: string,
): Promise<ApprovalListItem[]> {
  const response = await request.get(`${API_URL}/approvals`, {
    headers: workspaceHeaders(tokens, workspaceId),
  });
  if (!response.ok()) {
    throw new Error(`listApprovalsViaApi falhou (${response.status()})`);
  }
  return response.json() as Promise<ApprovalListItem[]>;
}
