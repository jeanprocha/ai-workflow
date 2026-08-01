import { createContext, Script } from "node:vm";
import type { NodeDefinition, NodeLogLevel } from "../types.js";
import { codeMeta, type CodeConfig } from "./code.meta.js";

const CONSOLE_LINE_LIMIT = 100;
const CONSOLE_BYTE_LIMIT = 16_384;
const OUTPUT_BYTE_LIMIT = 1_000_000;

function stringifyConsoleArg(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "[valor nao serializavel no console]";
  }
}

/**
 * console.{log,warn,error} do codigo do usuario, encaminhado pro `ctx.log`
 * real (fire-and-forget ate o host, engine.service.ts:recordLog -> INSERT +
 * SSE). Sem cap, um loop de console derrubaria o banco de logs — 100 linhas
 * / 16KB e generoso pra debug e curto pra abuso.
 */
function createConsoleShim(log: (event: string, payload?: unknown, level?: NodeLogLevel) => void) {
  let lines = 0;
  let bytes = 0;
  let truncated = false;

  function emit(level: NodeLogLevel, args: unknown[]) {
    if (truncated) return;
    if (lines >= CONSOLE_LINE_LIMIT || bytes >= CONSOLE_BYTE_LIMIT) {
      truncated = true;
      log("code.console", { text: "[console truncado]" }, "warn");
      return;
    }
    const text = args.map(stringifyConsoleArg).join(" ");
    lines += 1;
    bytes += Buffer.byteLength(text);
    log("code.console", { text }, level);
  }

  return {
    log: (...args: unknown[]) => emit("info", args),
    warn: (...args: unknown[]) => emit("warn", args),
    error: (...args: unknown[]) => emit("error", args),
  };
}

/** undefined -> null; cap de 1MB; erro claro em vez de estourar no postMessage do worker. */
function serializeOutput(raw: unknown): unknown {
  if (raw === undefined) return null;
  let json: string | undefined;
  try {
    json = JSON.stringify(raw);
  } catch {
    throw new Error(
      "Retorno nao serializavel (referencia circular, BigInt ou similar).",
    );
  }
  if (json === undefined) return null; // funcao/simbolo no topo do retorno
  if (Buffer.byteLength(json) > OUTPUT_BYTE_LIMIT) {
    throw new Error("Retorno excede o limite de 1MB.");
  }
  return JSON.parse(json);
}

/** Diff raso: so chaves alteradas/adicionadas entram no patch — a engine so mescla, nunca remove (deletar $vars.x nao propaga). */
function diffVars(
  next: Record<string, unknown>,
  original: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) continue;
    if (JSON.stringify(next[key]) !== JSON.stringify(original[key])) {
      patch[key] = next[key];
    }
  }
  return patch;
}

export const codeNode: NodeDefinition<CodeConfig> = {
  ...codeMeta,
  execute: async (ctx) => {
    const { code, timeoutMs } = ctx.config;
    const consoleShim = createConsoleShim(ctx.log);

    // Clone: o codigo muta $vars livremente; o diff no fim compara contra
    // ctx.vars (intacto) pra derivar o varsPatch que a engine mescla.
    const varsClone = structuredClone(ctx.vars);

    // Nao injetar JSON/Math/Date: ja existem nativos no contexto vm, com o
    // prototype DESSE contexto. Injetar a referencia do host so adicionaria
    // gadgets (fn.constructor aponta pro Function do host). URL/TextEncoder/
    // etc. nao sao nativos do contexto — tem que ser a referencia do host,
    // sem alternativa.
    const sandbox = {
      $input: ctx.input,
      $vars: varsClone,
      console: consoleShim,
      URL,
      URLSearchParams,
      TextEncoder,
      TextDecoder,
      atob,
      btoa,
      structuredClone,
    };

    // codeGeneration.strings:false e a barreira real (ADR-005): sem isso,
    // `this.constructor.constructor("return process")()` ou `eval(...)`
    // escapam do contexto e alcancam o realm do host. NAO remover.
    const context = createContext(sandbox, {
      codeGeneration: { strings: false, wasm: false },
    });

    let script: Script;
    try {
      // Wrapper de 1 linha antes do codigo do usuario: erros de sintaxe
      // reportam numero de linha +1 em relacao ao que o usuario escreveu.
      script = new Script(
        `(async ($input, $vars, console) => {\n${code}\n})($input, $vars, console)`,
        { filename: "logic.code" },
      );
    } catch (error) {
      throw new Error(
        `Erro de sintaxe no codigo: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    let pending: unknown;
    try {
      // runInContext com timeout so pega loop SINCRONO (ERR_SCRIPT_EXECUTION_TIMEOUT).
      // Um loop async (`while(true){ await 0 }`) escapa daqui e e pego pelo
      // backstop do worker (node-sandbox-runner.ts, terminate + timeout do
      // sandbox inteiro) — mensagem diferente, documentada no spec.
      pending = script.runInContext(context, { timeout: timeoutMs });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorCode = (error as { code?: string } | null)?.code;
      if (errorCode === "ERR_SCRIPT_EXECUTION_TIMEOUT" || /timed out/i.test(message)) {
        throw new Error(`Codigo excedeu o timeout de ${timeoutMs}ms.`);
      }
      throw new Error(`Erro ao executar o codigo: ${message}`);
    }

    let raw: unknown;
    try {
      raw = await pending;
    } catch (error) {
      throw new Error(
        `Erro ao executar o codigo: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const output = serializeOutput(raw);
    const varsPatch = diffVars(varsClone, ctx.vars);

    return { output, varsPatch };
  },
};
