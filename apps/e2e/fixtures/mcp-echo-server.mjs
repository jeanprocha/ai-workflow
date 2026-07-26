#!/usr/bin/env node
/**
 * Servidor MCP minimo (stdio, JSON-RPC por linha) para a Fase 08 de testes.
 * Zero dependencias — so precisa de `node` no PATH, sem npx/rede/porta.
 * Duas tools: "echo" (devolve o texto recebido) e "soma" (soma dois numeros).
 * Nunca escreve nada no stdout que nao seja uma mensagem JSON-RPC valida.
 */
import readline from "node:readline";

const PROTOCOL_VERSION = "2025-03-26";

const TOOLS = [
  {
    name: "echo",
    description: "Devolve o texto recebido.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
  },
  {
    name: "soma",
    description: "Soma dois numeros.",
    inputSchema: {
      type: "object",
      properties: { a: { type: "number" }, b: { type: "number" } },
      required: ["a", "b"],
    },
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function handleRequest({ id, method, params }) {
  if (method === "initialize") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "e2e-echo-fixture", version: "1.0.0" },
      },
    });
    return;
  }

  if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    return;
  }

  if (method === "tools/call") {
    const { name, arguments: args = {} } = params ?? {};
    if (name === "echo") {
      send({
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: String(args.text ?? "") }] },
      });
      return;
    }
    if (name === "soma") {
      const total = Number(args.a ?? 0) + Number(args.b ?? 0);
      send({
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: String(total) }] },
      });
      return;
    }
    send({ jsonrpc: "2.0", id, error: { code: -32602, message: `Tool desconhecida: ${name}` } });
    return;
  }

  send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Metodo nao suportado: ${method}` } });
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return;
  }

  // Notificacoes (sem id, ex.: notifications/initialized) nao tem resposta.
  if (message.id === undefined) return;
  handleRequest(message);
});
