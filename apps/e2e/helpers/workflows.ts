import type { APIRequestContext } from "@playwright/test";
import { API_URL, type AuthTokens } from "./auth";
import { workspaceHeaders } from "./settings";

export interface WorkflowSummary {
  id: string;
  name: string;
  status: "draft" | "active" | "archived";
  currentVersionId: string | null;
}

/**
 * O label do node exibido no canvas vem do proprio JSON do grafo (nao e
 * re-derivado do catalogo pelo editor — ver flow-editor.tsx graphToFlow) —
 * por isso os labels aqui casam com os do catalogo real (@workflow/nodes),
 * pra bater com o texto que a Fase 04 (editor) espera ver na tela.
 */

/** Grafo minimo valido: so um trigger manual — o suficiente pra rodar sem falhar no worker. */
export const MINIMAL_GRAPH = {
  nodes: [
    {
      id: "n1",
      type: "trigger.manual",
      category: "trigger",
      label: "Manual Trigger",
      position: { x: 0, y: 0 },
      config: {},
    },
  ],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

/** trigger.manual (n1) -> logic.log (n2), conectados — base pro editor (config panel, autosave, delete). */
export const TWO_NODE_GRAPH = {
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
      type: "logic.log",
      category: "logic",
      label: "Log",
      position: { x: 320, y: 0 },
      config: { message: "" },
    },
  ],
  edges: [{ id: "e1", source: "n1", target: "n2" }],
  viewport: { x: 0, y: 0, zoom: 1 },
};

/** Dois nodes SEM edge — pra testar a criacao de conexao arrastando de handle a handle. */
export const DISCONNECTED_GRAPH = {
  nodes: TWO_NODE_GRAPH.nodes,
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

/** trigger.manual -> logic.delay (visivel por tempo suficiente pra pegar o status "running" via SSE) -> logic.log. */
export const DELAY_GRAPH = {
  nodes: [
    ...TWO_NODE_GRAPH.nodes.slice(0, 1),
    {
      id: "n2",
      type: "logic.delay",
      category: "logic",
      label: "Delay",
      position: { x: 320, y: 0 },
      config: { ms: 3000 },
    },
    {
      id: "n3",
      type: "logic.log",
      category: "logic",
      label: "Log",
      position: { x: 640, y: 0 },
      config: { message: "concluido" },
    },
  ],
  edges: [
    { id: "e1", source: "n1", target: "n2" },
    { id: "e2", source: "n2", target: "n3" },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
};

/** trigger.manual -> api.httpRequest pra uma porta discard (connection refused em ~5ms) — unica forma deterministica de produzir execucao "failed". */
export const FAILING_GRAPH = {
  nodes: [
    ...TWO_NODE_GRAPH.nodes.slice(0, 1),
    {
      id: "n2",
      type: "api.httpRequest",
      category: "api",
      label: "HTTP Request",
      position: { x: 320, y: 0 },
      config: { method: "GET", url: "http://127.0.0.1:9", headers: {}, timeoutMs: 3000 },
    },
  ],
  edges: [{ id: "e1", source: "n1", target: "n2" }],
  viewport: { x: 0, y: 0, zoom: 1 },
};

/** trigger.cron -> logic.log — usado pra testar o config panel do node Cron e o scheduler (Fase 11). */
export function cronGraph(cronExpression: string, enabled = true) {
  return {
    nodes: [
      {
        id: "n1",
        type: "trigger.cron",
        category: "trigger",
        label: "Schedule",
        position: { x: 0, y: 0 },
        config: { cronExpression, timezone: "UTC", enabled },
      },
      {
        id: "n2",
        type: "logic.log",
        category: "logic",
        label: "Log",
        position: { x: 320, y: 0 },
        config: { message: "disparado pelo cron" },
      },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

export interface ExecutionSummary {
  id: string;
  workflowId: string;
  versionId: string;
  status: "queued" | "running" | "success" | "failed" | "canceled";
  triggerType: string;
  parentExecutionId: string | null;
  [key: string]: unknown;
}

export async function runWorkflowViaApi(
  request: APIRequestContext,
  tokens: AuthTokens,
  workspaceId: string,
  workflowId: string,
  input: Record<string, unknown> = {},
): Promise<ExecutionSummary> {
  const response = await request.post(`${API_URL}/workflows/${workflowId}/run`, {
    headers: workspaceHeaders(tokens, workspaceId),
    data: { input },
  });
  if (!response.ok()) {
    throw new Error(`runWorkflowViaApi falhou (${response.status()})`);
  }
  return response.json() as Promise<ExecutionSummary>;
}

export async function waitForExecutionStatus(
  request: APIRequestContext,
  tokens: AuthTokens,
  workspaceId: string,
  executionId: string,
  status: ExecutionSummary["status"],
  // Generoso de proposito: a fila de execucoes roda com concurrency=5
  // (EXECUTIONS_CONCURRENCY), e a suite completa dispara dezenas de
  // execucoes em paralelo (4 workers do Playwright) — sob essa contencao um
  // job pode ficar mais de 15s na fila antes do worker pegar, mesmo sendo
  // rapido pra processar.
  timeoutMs = 30_000,
): Promise<ExecutionSummary> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const response = await request.get(`${API_URL}/executions/${executionId}`, {
      headers: workspaceHeaders(tokens, workspaceId),
    });
    if (!response.ok()) {
      throw new Error(`waitForExecutionStatus falhou (${response.status()})`);
    }
    const execution = (await response.json()) as ExecutionSummary;
    if (execution.status === status) return execution;
    if (Date.now() > deadline) {
      throw new Error(
        `waitForExecutionStatus timeout: esperava "${status}", ultimo status foi "${execution.status}"`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

export async function createWorkflowViaApi(
  request: APIRequestContext,
  tokens: AuthTokens,
  workspaceId: string,
  name: string,
): Promise<WorkflowSummary> {
  const response = await request.post(`${API_URL}/workflows`, {
    headers: workspaceHeaders(tokens, workspaceId),
    data: { name },
  });
  if (!response.ok()) {
    throw new Error(`createWorkflowViaApi falhou (${response.status()})`);
  }
  return response.json() as Promise<WorkflowSummary>;
}

export interface SavedWorkflow {
  id: string;
  currentVersionId: string;
  webhookId: string | null;
  chatToken: string | null;
  inboxToken: string | null;
  [key: string]: unknown;
}

export async function saveGraphViaApi(
  request: APIRequestContext,
  tokens: AuthTokens,
  workspaceId: string,
  workflowId: string,
  graph: unknown = MINIMAL_GRAPH,
): Promise<SavedWorkflow> {
  const response = await request.put(`${API_URL}/workflows/${workflowId}/graph`, {
    headers: workspaceHeaders(tokens, workspaceId),
    data: { graph },
  });
  if (!response.ok()) {
    throw new Error(`saveGraphViaApi falhou (${response.status()})`);
  }
  return response.json() as Promise<SavedWorkflow>;
}

/** trigger.chat -> chat.reply — grafo base do canal de chat publico (Fase Chat). */
export function chatGraph(options: {
  welcomeMessage?: string;
  errorMessage?: string;
  replyMessage?: string;
} = {}) {
  return {
    nodes: [
      {
        id: "n1",
        type: "trigger.chat",
        category: "trigger",
        label: "Chat",
        position: { x: 0, y: 0 },
        config: {
          chatToken: "",
          inboxToken: "",
          welcomeMessage: options.welcomeMessage ?? "",
          errorMessage: options.errorMessage ?? "",
        },
      },
      {
        id: "n2",
        type: "chat.reply",
        category: "communication",
        label: "Responder no chat",
        position: { x: 320, y: 0 },
        config: { message: options.replyMessage ?? "Você disse: {{ $input.message }}" },
      },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/**
 * trigger.chat -> chat.reply (mostra a mensagem ANTERIOR, antes de setVariables
 * atualizar) -> logic.setVariables (grava a mensagem atual) — prova que $vars
 * sobrevive entre mensagens (seed/persist em engine.service.ts).
 */
export function chatStatefulGraph() {
  return {
    nodes: [
      {
        id: "n1",
        type: "trigger.chat",
        category: "trigger",
        label: "Chat",
        position: { x: 0, y: 0 },
        config: { chatToken: "", inboxToken: "", welcomeMessage: "", errorMessage: "" },
      },
      {
        id: "n2",
        type: "chat.reply",
        category: "communication",
        label: "Responder no chat",
        position: { x: 320, y: 0 },
        config: { message: "Sua mensagem anterior foi: [{{ $vars.lastMessage }}]" },
      },
      {
        id: "n3",
        type: "logic.setVariables",
        category: "logic",
        label: "Set Variables",
        position: { x: 640, y: 0 },
        config: { assignments: [{ key: "lastMessage", value: "{{ $input.message }}" }] },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/**
 * trigger.chat -> chat.reply referenciando um id de node que NAO existe no
 * grafo (so tem n1/n2) — reproduz o bug real: `{{ $node.idErrado }}` virando
 * `undefined` em silencio fazia o chat.reply gravar mensagem vazia e
 * estourar um erro cru do Prisma na tela do visitante. Com knownNodeIds
 * (engine.service.ts), isso agora falha ANTES do execute do node, com
 * errorMessage configurada — nunca mais chega no Prisma.
 */
export function chatWrongNodeIdGraph(errorMessage: string) {
  return {
    nodes: [
      {
        id: "n1",
        type: "trigger.chat",
        category: "trigger",
        label: "Chat",
        position: { x: 0, y: 0 },
        config: { chatToken: "", inboxToken: "", welcomeMessage: "", errorMessage },
      },
      {
        id: "n2",
        type: "chat.reply",
        category: "communication",
        label: "Responder no chat",
        position: { x: 320, y: 0 },
        config: { message: "{{ $node.n9NaoExiste.value }}" },
      },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/** trigger.chat -> api.httpRequest pra porta discard (connection refused) — dispara o caminho de falha/errorMessage. */
export function chatFailingGraph(errorMessage: string) {
  return {
    nodes: [
      {
        id: "n1",
        type: "trigger.chat",
        category: "trigger",
        label: "Chat",
        position: { x: 0, y: 0 },
        config: { chatToken: "", inboxToken: "", welcomeMessage: "", errorMessage },
      },
      {
        id: "n2",
        type: "api.httpRequest",
        category: "api",
        label: "HTTP Request",
        position: { x: 320, y: 0 },
        config: { method: "GET", url: "http://127.0.0.1:9", headers: {}, timeoutMs: 3000 },
      },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/**
 * trigger.manual -> api.httpRequest com o config passado inteiro (sem
 * defaults aplicados de proposito) — usado pelos testes de $auth/$sig/
 * assinatura HMAC do node HTTP e pelo teste de regressao de "config legado"
 * (grafo salvo antes de query/signature/credential existirem: graph.schema.ts
 * so valida node.type, nunca o shape do config de cada node — ver
 * apps/api/src/workflows/graph.schema.ts).
 */
/**
 * trigger.manual -> api.httpRequest (POST `items` pro /debug/echo, que
 * devolve o corpo tal e qual recebeu) -> logic.transformList lendo
 * `$node.n2.body.body` — prova o valor do node: uma lista grande e crua vira
 * poucos itens enxutos antes de seguir adiante (ex.: pro prompt de um agente
 * de IA), sem custar uma chamada de IA a mais so pra isso.
 */
export function transformListGraph(options: {
  echoUrl: string;
  items: unknown[];
  offset?: number;
  limit: number;
  fields: Array<{ as: string; path: string }>;
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
        type: "api.httpRequest",
        category: "api",
        label: "HTTP Request",
        position: { x: 320, y: 0 },
        config: {
          method: "POST",
          url: options.echoUrl,
          headers: { "Content-Type": "application/json" },
          body: options.items,
          timeoutMs: 5000,
        },
      },
      {
        id: "n3",
        type: "logic.transformList",
        category: "logic",
        label: "Transformar lista",
        position: { x: 640, y: 0 },
        config: {
          source: "{{ $node.n2.body.body }}",
          offset: options.offset ?? 0,
          limit: options.limit,
          fields: options.fields,
        },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/**
 * trigger.manual -> api.httpRequest (falha deterministica contra porta
 * discard por padrao, ou sucesso se `url` apontar pro /debug/echo) -> dois
 * logic.log: "normal" (edge sem handle, n3) e "erro" (edge
 * sourceHandle:"error", n4). Usado pra testar o caminho de erro
 * (onError:'branch') da engine.
 */
export function errorBranchGraph(
  options: {
    onError?: "branch";
    url?: string;
    wireErrorEdge?: boolean;
  } = {},
) {
  const edges: Array<{ id: string; source: string; target: string; sourceHandle?: string }> = [
    { id: "e1", source: "n1", target: "n2" },
    { id: "e2", source: "n2", target: "n3" },
  ];
  if (options.wireErrorEdge ?? true) {
    edges.push({ id: "e3", source: "n2", target: "n4", sourceHandle: "error" });
  }
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
        type: "api.httpRequest",
        category: "api",
        label: "HTTP Request",
        position: { x: 320, y: 0 },
        config: {
          method: "GET",
          url: options.url ?? "http://127.0.0.1:9",
          headers: {},
          timeoutMs: 3000,
        },
        ...(options.onError ? { onError: options.onError } : {}),
      },
      {
        id: "n3",
        type: "logic.log",
        category: "logic",
        label: "Log",
        position: { x: 640, y: -80 },
        config: { message: "caminho normal" },
      },
      {
        id: "n4",
        type: "logic.log",
        category: "logic",
        label: "Log",
        position: { x: 640, y: 80 },
        config: { message: "tratado: {{ $input.error }}" },
      },
    ],
    edges,
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/**
 * trigger.chat -> api.httpRequest (falha, onError:'branch') -> chat.reply no
 * caminho de erro. Prova que uma falha tratada NAO injeta a errorMessage do
 * trigger e AINDA assim persiste o estado da conversa (execucao termina
 * success).
 */
export function chatErrorBranchGraph(errorMessage: string) {
  return {
    nodes: [
      {
        id: "n1",
        type: "trigger.chat",
        category: "trigger",
        label: "Chat",
        position: { x: 0, y: 0 },
        config: { chatToken: "", inboxToken: "", welcomeMessage: "", errorMessage },
      },
      {
        id: "n2",
        type: "api.httpRequest",
        category: "api",
        label: "HTTP Request",
        position: { x: 320, y: 0 },
        config: { method: "GET", url: "http://127.0.0.1:9", headers: {}, timeoutMs: 3000 },
        onError: "branch",
      },
      {
        id: "n3",
        type: "chat.reply",
        category: "communication",
        label: "Responder no chat",
        position: { x: 640, y: 0 },
        config: { message: "Tive um problema, mas contornei." },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3", sourceHandle: "error" },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

export function httpRequestGraph(nodeConfig: Record<string, unknown>) {
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
        type: "api.httpRequest",
        category: "api",
        label: "HTTP Request",
        position: { x: 320, y: 0 },
        config: nodeConfig,
      },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
