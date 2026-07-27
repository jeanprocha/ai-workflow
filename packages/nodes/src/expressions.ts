/**
 * Resolucao de expressoes {{ }} nos configs dos nodes (ver ADR-004).
 * Suporta: {{ $input.a.b }}, {{ $vars.KEY }}, {{ $node.<nodeId>.<path> }}.
 * Sem eval() — apenas travessia segura de caminho.
 */

export interface ExpressionContext {
  input: unknown;
  vars: Record<string, unknown>;
  nodeOutputs: Record<string, unknown>;
  /**
   * Raizes extras alem de $input/$vars/$node — chave SEM "$" (ex.:
   * `{ auth: {...} }` habilita `{{ $auth.clientId }}`). Usado por nodes que
   * precisam expor dado que so existe dentro do proprio execute (ex.: o node
   * HTTP resolve `$auth`/`$sig` depois de ler a credencial — ver
   * http-request.ts), rodando `resolveExpressions` de novo por dentro.
   */
  extraRoots?: Record<string, unknown>;
  /**
   * Raizes cujas expressoes NAO devem ser resolvidas nesta passada — o texto
   * `{{ $auth.x }}` e devolvido literal, pra uma segunda chamada (com
   * `extraRoots` preenchido) resolver depois. Sem isso, a primeira passada
   * (no thread principal do engine, antes do node existir) apagaria
   * `{{ $auth.x }}` -> `undefined` -> string vazia, antes do node ver.
   */
  preserveRoots?: readonly string[];
  /**
   * Ids de node que existem no grafo desta execucao. Quando presente,
   * `{{ $node.<id> }}` com um id AUSENTE daqui lanca erro nomeando o id —
   * normalmente um typo. Um id presente mas cujo node ainda nao executou
   * (branch nao tomada, node a frente no grafo) continua resolvendo pra
   * `undefined` normalmente, que e legitimo. Omitir o campo (ex.: na segunda
   * passada de $auth/$sig dentro do http-request.ts) preserva o
   * comportamento antigo, sem essa checagem.
   */
  knownNodeIds?: ReadonlySet<string>;
}

/** Erro de expressao com id de node que nao existe no grafo — ver `knownNodeIds`. */
export class UnknownNodeIdError extends Error {
  constructor(public readonly nodeId: string) {
    super(`Node "${nodeId}" nao existe neste fluxo — confira a expressao.`);
    this.name = "UnknownNodeIdError";
  }
}

const EXPRESSION_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

/**
 * Travessia de caminho por ponto — usada tanto na resolucao de `{{ }}`
 * quanto pelo node `logic.transformList` (ver transform-list.ts) pra extrair
 * campos de cada item de uma lista. Indexa objeto e array do mesmo jeito
 * (`"items.0.nome"` funciona), por isso e reaproveitada em vez de duplicada.
 */
export function getPath(root: unknown, path: string): unknown {
  if (path === "") return root;
  const segments = path.split(".").filter(Boolean);
  let current = root;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Raiz de uma expressao (`"$auth.clientId"` -> `"$auth"`), pra decidir preserveRoots. */
function exprRoot(expr: string): string {
  const trimmed = expr.trim();
  const dotIndex = trimmed.indexOf(".");
  return dotIndex === -1 ? trimmed : trimmed.slice(0, dotIndex);
}

function isPreservedRoot(expr: string, preserveRoots: readonly string[] | undefined): boolean {
  return !!preserveRoots && preserveRoots.includes(exprRoot(expr));
}

function evaluateExpression(expr: string, ctx: ExpressionContext): unknown {
  const trimmed = expr.trim();

  if (trimmed === "$input") return ctx.input;
  if (trimmed.startsWith("$input.")) return getPath(ctx.input, trimmed.slice("$input.".length));

  if (trimmed === "$vars") return ctx.vars;
  if (trimmed.startsWith("$vars.")) return getPath(ctx.vars, trimmed.slice("$vars.".length));

  if (trimmed.startsWith("$node.")) {
    const rest = trimmed.slice("$node.".length);
    const dotIndex = rest.indexOf(".");
    const nodeId = dotIndex === -1 ? rest : rest.slice(0, dotIndex);
    const path = dotIndex === -1 ? "" : rest.slice(dotIndex + 1);
    if (ctx.knownNodeIds && !ctx.knownNodeIds.has(nodeId)) {
      throw new UnknownNodeIdError(nodeId);
    }
    return getPath(ctx.nodeOutputs[nodeId], path);
  }

  if (ctx.extraRoots) {
    for (const [name, root] of Object.entries(ctx.extraRoots)) {
      const prefix = `$${name}`;
      if (trimmed === prefix) return root;
      if (trimmed.startsWith(`${prefix}.`)) return getPath(root, trimmed.slice(prefix.length + 1));
    }
  }

  return undefined;
}

function resolveString(value: string, ctx: ExpressionContext): unknown {
  const matches = [...value.matchAll(EXPRESSION_RE)];
  const singleMatch = matches[0];
  if (matches.length === 0 || !singleMatch) return value;

  if (matches.length === 1 && singleMatch[0] === value.trim()) {
    const expr = singleMatch[1] ?? "";
    if (isPreservedRoot(expr, ctx.preserveRoots)) return value;
    return evaluateExpression(expr, ctx);
  }

  return value.replace(EXPRESSION_RE, (full, expr: string) => {
    if (isPreservedRoot(expr, ctx.preserveRoots)) return full;
    const resolved = evaluateExpression(expr, ctx);
    if (resolved === undefined || resolved === null) return "";
    return typeof resolved === "string" ? resolved : JSON.stringify(resolved);
  });
}

export function resolveExpressions(value: unknown, ctx: ExpressionContext): unknown {
  if (typeof value === "string") return resolveString(value, ctx);
  if (Array.isArray(value)) return value.map((item) => resolveExpressions(item, ctx));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = resolveExpressions(val, ctx);
    }
    return result;
  }
  return value;
}

/** true se `value` (apos resolveExpressions) ainda contem algum `{{ ... }}` nao resolvido. */
export function hasUnresolvedExpression(value: unknown): string | null {
  if (typeof value === "string") {
    const match = value.match(EXPRESSION_RE);
    return match ? match[0] : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = hasUnresolvedExpression(item);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const val of Object.values(value)) {
      const found = hasUnresolvedExpression(val);
      if (found) return found;
    }
    return null;
  }
  return null;
}
