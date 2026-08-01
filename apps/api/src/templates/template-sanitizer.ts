import type { WorkflowGraph, WorkflowNode } from '@workflow/shared';

/**
 * Tokens de capability (webhookId/chatToken/inboxToken) nunca podem ser
 * herdados do template: alem de vazar a URL publica do fluxo de origem, o
 * ensure* preserva valor nao-vazio (workflows.service.ts:33-35,64-73) — a
 * segunda instanciacao do mesmo template colidiria com os @unique de
 * workflows.webhook_id/chat_token/inbox_token (P2002). Remover aqui forca um
 * token novo por fluxo instanciado.
 */
const INHERITED_TOKEN_KEYS = ['webhookId', 'chatToken', 'inboxToken'] as const;

export function stripInheritedTokens(graph: WorkflowGraph): WorkflowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const config = { ...node.config };
      let touched = false;
      for (const key of INHERITED_TOKEN_KEYS) {
        if (key in config) {
          delete config[key];
          touched = true;
        }
      }
      return touched ? { ...node, config } : node;
    }),
  };
}

/**
 * Ids de recursos do workspace de origem (agente, base de conhecimento,
 * servidor MCP) — nao fazem sentido cruzar workspace, mesmo sendo intra-
 * workspace hoje (templates podem virar compartilhaveis no futuro). Zerar
 * (`''`) e o estado "nao configurado" que a UI ja usa pra esses campos.
 */
const WORKSPACE_RESOURCE_ID_KEYS = [
  'agentId',
  'knowledgeBaseId',
  'mcpServerId',
] as const;

// ── Politicas de sanitizacao (decisao de produto — trocar aqui, uma linha) ──
/**
 * `config.credential` guarda o NOME da conexao (resolvida por
 * workspaceId+name na engine — nunca o segredo em si, ver
 * engine.service.ts:getCredential). Templates hoje sao intra-workspace: o
 * nome resolve certo no fluxo instanciado, entao 'keep' faz o fluxo nascer
 * ja funcionando (mesma convencao dos seeds, ex. 'anthropic-default').
 * Quando templates puderem ser compartilhados entre workspaces, isso vira
 * 'clear'.
 */
export const CREDENTIAL_POLICY: 'clear' | 'keep' = 'keep';

/**
 * Valores de records livres (`headers`/`query` do node HTTP, `headers` do
 * GraphQL) — podem carregar segredo colado a mao (ex.: `Authorization:
 * Bearer ...`) ou dado inocuo (`Content-Type`). 'sensitive-keys' zera so o
 * que parece segredo pela chave, preservando o resto; 'all' zera tudo.
 */
export const RECORD_POLICY: 'all' | 'sensitive-keys' = 'sensitive-keys';

const SENSITIVE_KEY_RE = /authorization|api[-_]?key|secret|token|password/i;
// ─────────────────────────────────────────────────────────────────────────

/**
 * So sanitiza objeto plano — `query`/`headers` sao records nesse formato so
 * em alguns nodes (api.httpRequest, api.graphql); no knowledge.search
 * `query` e a STRING de busca, e em database.postgres/mysql e SQL. Sem esse
 * guard, o sanitizador corrompe esses nodes.
 */
function sanitizeRecord(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    out[key] =
      RECORD_POLICY === 'all' || SENSITIVE_KEY_RE.test(key)
        ? ''
        : record[key];
  }
  return out;
}

function sanitizeNodeConfig(node: WorkflowNode): Record<string, unknown> {
  const config: Record<string, unknown> = { ...node.config };

  for (const key of INHERITED_TOKEN_KEYS) delete config[key];
  for (const key of WORKSPACE_RESOURCE_ID_KEYS) {
    if (key in config) config[key] = '';
  }
  if (CREDENTIAL_POLICY === 'clear' && 'credential' in config) {
    config.credential = '';
  }
  if ('headers' in config) config.headers = sanitizeRecord(config.headers);
  if ('query' in config) config.query = sanitizeRecord(config.query);

  const signature = config.signature;
  if (signature && typeof signature === 'object' && !Array.isArray(signature)) {
    config.signature = { ...(signature as Record<string, unknown>), secret: '' };
  }

  return config;
}

/**
 * LIMITACAO conhecida, documentada e nao resolvida aqui: `url` e `body`
 * (api.httpRequest) podem carregar segredo embutido (querystring, basic-auth
 * na URL, token no corpo) — sanitiza-los quebraria o template na maioria dos
 * casos legitimos. Fica por conta de quem publica o template revisar isso.
 */
export function sanitizeTemplateGraph(graph: WorkflowGraph): WorkflowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      config: sanitizeNodeConfig(node),
    })),
  };
}
