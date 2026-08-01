import { codeNode } from "./code.js";
import type { NodeExecutionContext, NodeLogLevel } from "../types.js";

interface TestConfig {
  code: string;
  timeoutMs: number;
}

function buildCtx(overrides: {
  code?: string;
  timeoutMs?: number;
  input?: unknown;
  vars?: Record<string, unknown>;
} = {}) {
  const logs: Array<{ event: string; payload?: unknown; level?: NodeLogLevel }> = [];
  const notUsed = () => {
    throw new Error("RPC nao usado pelo node de codigo neste teste.");
  };
  const ctx: NodeExecutionContext<TestConfig> = {
    config: {
      code: overrides.code ?? "return $input;",
      timeoutMs: overrides.timeoutMs ?? 5_000,
    },
    input: overrides.input ?? null,
    vars: overrides.vars ?? {},
    log: (event, payload, level) => {
      logs.push({ event, payload, level });
    },
    getCredential: notUsed,
    callAgent: notUsed,
    searchKnowledge: notUsed,
    callMcpTool: notUsed,
    sendChatMessage: notUsed,
    requestApproval: notUsed,
  };
  return { ctx, logs };
}

describe("logic.code", () => {
  it("happy path: transforma $input e devolve no output", async () => {
    const { ctx } = buildCtx({ code: "return { x: $input.n * 2 };", input: { n: 21 } });
    const result = await codeNode.execute(ctx);
    expect(result.output).toEqual({ x: 42 });
  });

  it("$vars: diff raso vira varsPatch, so chaves alteradas entram", async () => {
    const { ctx } = buildCtx({
      code: "$vars.count = ($vars.count || 0) + 1; $vars.untouched = 'igual'; return null;",
      vars: { count: 1, untouched: "igual" },
    });
    const result = await codeNode.execute(ctx);
    expect(result.varsPatch).toEqual({ count: 2 });
  });

  it("retorno com referencia circular: erro claro, nao estoura cru", async () => {
    const { ctx } = buildCtx({
      code: "const o = {}; o.self = o; return o;",
    });
    await expect(codeNode.execute(ctx)).rejects.toThrow(/nao serializavel/);
  });

  it("retorno com BigInt: erro claro", async () => {
    const { ctx } = buildCtx({ code: "return 10n;" });
    await expect(codeNode.execute(ctx)).rejects.toThrow(/nao serializavel/);
  });

  it("retorno acima de 1MB: erro de limite", async () => {
    const { ctx } = buildCtx({ code: "return 'x'.repeat(1_100_000);" });
    await expect(codeNode.execute(ctx)).rejects.toThrow(/1MB/);
  });

  it("isolamento: process/require/fetch/Buffer/setTimeout sao undefined dentro do codigo", async () => {
    const { ctx } = buildCtx({
      code: `return {
        p: typeof process,
        r: typeof require,
        f: typeof fetch,
        b: typeof Buffer,
        st: typeof setTimeout,
      };`,
    });
    const result = await codeNode.execute(ctx);
    expect(result.output).toEqual({
      p: "undefined",
      r: "undefined",
      f: "undefined",
      b: "undefined",
      st: "undefined",
    });
  });

  it("escape bloqueado: eval() lanca (codeGeneration.strings:false)", async () => {
    const { ctx } = buildCtx({ code: "return eval('1+1');" });
    await expect(codeNode.execute(ctx)).rejects.toThrow(/Erro ao executar o codigo/);
  });

  it("escape bloqueado: new Function(...) lanca (codeGeneration.strings:false)", async () => {
    const { ctx } = buildCtx({ code: "return new Function('return 1')();" });
    await expect(codeNode.execute(ctx)).rejects.toThrow(/Erro ao executar o codigo/);
  });

  it("loop sincrono infinito: timeout do vm, mensagem clara, nao trava o teste", async () => {
    const { ctx } = buildCtx({ code: "while (true) {}", timeoutMs: 200 });
    await expect(codeNode.execute(ctx)).rejects.toThrow(/excedeu o timeout de 200ms/);
  });

  it("codigo async com await funciona", async () => {
    const { ctx } = buildCtx({ code: "return await Promise.resolve($input.v);", input: { v: 7 } });
    const result = await codeNode.execute(ctx);
    expect(result.output).toBe(7);
  });

  it("console: linhas dentro do cap viram ctx.log; acima do cap trunca", async () => {
    const { ctx, logs } = buildCtx({
      code: "for (let i = 0; i < 150; i++) { console.log('linha', i); } return null;",
    });
    await codeNode.execute(ctx);
    const consoleLogs = logs.filter((l) => l.event === "code.console");
    expect(consoleLogs.length).toBe(101); // 100 linhas + 1 aviso de truncamento
    expect(consoleLogs[100]?.payload).toEqual({ text: "[console truncado]" });
  });

  it("console.log de valor circular nao derruba o node", async () => {
    const { ctx, logs } = buildCtx({
      code: "const o = {}; o.self = o; console.log(o); return 'ok';",
    });
    const result = await codeNode.execute(ctx);
    expect(result.output).toBe("ok");
    const consoleLog = logs.find((l) => l.event === "code.console");
    expect(consoleLog?.payload).toEqual({ text: "[valor nao serializavel no console]" });
  });

  it("JSON/Math nativos do contexto funcionam sem injecao do host", async () => {
    const { ctx } = buildCtx({
      code: "return JSON.stringify({ m: Math.max(1, 2) });",
    });
    const result = await codeNode.execute(ctx);
    expect(result.output).toBe('{"m":2}');
  });

  it("erro de sintaxe no codigo: mensagem clara antes de rodar", async () => {
    const { ctx } = buildCtx({ code: "return {{{ isso nao compila" });
    await expect(codeNode.execute(ctx)).rejects.toThrow(/Erro de sintaxe/);
  });
});
