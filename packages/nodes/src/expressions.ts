/**
 * Resolucao de expressoes {{ }} nos configs dos nodes (ver ADR-004).
 * Suporta: {{ $input.a.b }}, {{ $vars.KEY }}, {{ $node.<nodeId>.<path> }}.
 * Sem eval() — apenas travessia segura de caminho.
 */

export interface ExpressionContext {
  input: unknown;
  vars: Record<string, unknown>;
  nodeOutputs: Record<string, unknown>;
}

const EXPRESSION_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

function getPath(root: unknown, path: string): unknown {
  if (path === "") return root;
  const segments = path.split(".").filter(Boolean);
  let current = root;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
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
    return getPath(ctx.nodeOutputs[nodeId], path);
  }

  return undefined;
}

function resolveString(value: string, ctx: ExpressionContext): unknown {
  const matches = [...value.matchAll(EXPRESSION_RE)];
  const singleMatch = matches[0];
  if (matches.length === 0 || !singleMatch) return value;

  if (matches.length === 1 && singleMatch[0] === value.trim()) {
    return evaluateExpression(singleMatch[1] ?? "", ctx);
  }

  return value.replace(EXPRESSION_RE, (_full, expr: string) => {
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
