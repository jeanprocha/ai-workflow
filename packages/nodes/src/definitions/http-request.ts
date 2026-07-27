import { createHmac } from "node:crypto";
import type { NodeDefinition } from "../types.js";
import { resolveExpressions, hasUnresolvedExpression } from "../expressions.js";
import { parseCredentialPayload } from "../credential-payload.js";
import { httpRequestMeta, type HttpRequestConfig } from "./http-request.meta.js";

/**
 * Segunda passada de expressoes, so pra `$auth`/`$sig` — a primeira passada
 * (engine.service.ts, thread principal) ja resolveu `$input`/`$vars`/`$node`
 * e preservou estas duas raizes literais, exatamente pra esta segunda
 * passada resolver aqui dentro, depois que a credencial foi lida e o
 * timestamp calculado.
 */
function resolveAuthSig(
  value: unknown,
  auth: Record<string, unknown>,
  sig: Record<string, unknown>,
): unknown {
  return resolveExpressions(value, {
    input: undefined,
    vars: {},
    nodeOutputs: {},
    extraRoots: { auth, sig },
  });
}

function assertFullyResolved(parts: Record<string, unknown>): void {
  const leftover = hasUnresolvedExpression(parts);
  if (leftover) {
    throw new Error(
      `Expressao "${leftover}" nao foi resolvida — confira a Conexao selecionada e o bloco de assinatura.`,
    );
  }
}

export const httpRequestNode: NodeDefinition<HttpRequestConfig> = {
  ...httpRequestMeta,
  execute: async (ctx) => {
    // O grafo so valida que node.type existe no catalogo (ver
    // apps/api/src/workflows/graph.schema.ts) — o configSchema deste node
    // NUNCA e de fato parseado/aplicado em cima do config salvo. Um fluxo
    // salvo ANTES de query/signature existirem chega aqui sem esses campos
    // (nao com os defaults do zod, ausentes mesmo) — sem este fallback
    // explicito, `Object.entries(undefined)` e `signature.enabled` de
    // `undefined` derrubam a execucao de todo node HTTP legado.
    const defaults = httpRequestMeta.defaultConfig;
    const { method, url, body } = ctx.config;
    const headers = ctx.config.headers ?? defaults.headers;
    const timeoutMs = ctx.config.timeoutMs ?? defaults.timeoutMs;
    const credential = ctx.config.credential ?? defaults.credential;
    const query = ctx.config.query ?? defaults.query;
    const signature = { ...defaults.signature, ...(ctx.config.signature ?? {}) };

    // Gate: "{{ $auth... }}" em algum campo mas nenhuma Conexao selecionada —
    // erro explicito, ANTES de qualquer coisa (nunca sai pra rede com $auth
    // silenciosamente virando string vazia).
    const configForAuthCheck = JSON.stringify({ url, headers, query, body, signature });
    if (!credential && configForAuthCheck.includes("{{ $auth")) {
      throw new Error(
        'Este node usa "{{ $auth... }}" mas nenhuma Conexao foi selecionada no campo Conexao.',
      );
    }

    const auth = credential
      ? parseCredentialPayload(await ctx.getCredential(credential))
      : {};

    // Calculado UMA vez e reusado em tudo — recalcular por campo faria a
    // assinatura divergir do header Timestamp enviado (armadilha real de
    // integracoes assinadas, documentada em docs/integracoes/rein.md).
    const timestamp = Math.floor((Date.now() + (signature.timestampOffsetSec ?? 0) * 1000) / 1000);

    // Etapa 1: URL e query — ainda sem $sig.path/$sig.signature, que so
    // existem depois que a URL final estiver montada.
    const sigStage1 = { method, timestamp };
    const resolvedUrl = resolveAuthSig(url, auth, sigStage1) as string;
    const resolvedQuery = resolveAuthSig(query, auth, sigStage1) as Record<string, string>;

    const finalUrl = new URL(resolvedUrl);
    for (const [key, value] of Object.entries(resolvedQuery)) {
      finalUrl.searchParams.set(key, value);
    }

    // Path que integracoes assinadas costumam usar: sem host, sem query string.
    const sigStage2 = { ...sigStage1, path: finalUrl.pathname, query: resolvedQuery };

    // Corpo: materializa a string ANTES de assinar — e essa string exata que
    // sai no fetch; assinar um recalculo posterior faria payload e
    // assinatura divergirem.
    const resolvedBody = body !== undefined ? resolveAuthSig(body, auth, sigStage2) : undefined;
    const bodyString =
      resolvedBody !== undefined && method !== "GET" ? JSON.stringify(resolvedBody) : undefined;

    const sigStage3 = { ...sigStage2, body: resolvedBody };

    let signatureValue: string | undefined;
    if (signature.enabled) {
      const secretValue = resolveAuthSig(signature.secret, auth, sigStage3);
      const templateValue = resolveAuthSig(signature.template, auth, sigStage3);
      if (typeof secretValue !== "string" || !secretValue) {
        throw new Error(
          "Assinatura habilitada mas o Segredo nao resolveu pra um valor — confira a Conexao e o campo Segredo.",
        );
      }
      if (typeof templateValue !== "string" || !templateValue) {
        throw new Error(
          "Assinatura habilitada mas o Template nao resolveu pra um valor — confira o campo Template.",
        );
      }
      signatureValue = createHmac(signature.algorithm, secretValue)
        .update(templateValue)
        .digest(signature.encoding);
    }

    const sigFinal = { ...sigStage3, signature: signatureValue };
    const resolvedHeaders = resolveAuthSig(headers, auth, sigFinal) as Record<string, string>;

    assertFullyResolved({
      url: resolvedUrl,
      query: resolvedQuery,
      headers: resolvedHeaders,
      body: resolvedBody,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(finalUrl, {
        method,
        headers: resolvedHeaders,
        body: bodyString,
        signal: controller.signal,
      });

      const contentType = response.headers.get("content-type") ?? "";
      const responseBody = contentType.includes("application/json")
        ? await response.json().catch(() => null)
        : await response.text();

      // Nunca loga query string (pode carregar segredo/assinatura/dado de
      // tenant) nem qualquer coisa relacionada a $auth/assinatura.
      ctx.log("http.response", {
        status: response.status,
        url: `${finalUrl.origin}${finalUrl.pathname}`,
      });

      return {
        output: {
          status: response.status,
          ok: response.ok,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseBody,
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  },
};
