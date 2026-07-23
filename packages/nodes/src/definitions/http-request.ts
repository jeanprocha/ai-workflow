import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  url: z.string().min(1, "Informe uma URL."),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.unknown().optional(),
  timeoutMs: z.number().int().positive().default(10_000),
});
type Config = z.infer<typeof configSchema>;

export const httpRequestNode: NodeDefinition<Config> = {
  type: "api.httpRequest",
  category: "api",
  label: "HTTP Request",
  description: "Faz uma requisicao HTTP e retorna status, headers e body da resposta.",
  icon: "Globe",
  outputs: ["default"],
  configSchema,
  defaultConfig: { method: "GET", url: "", headers: {}, timeoutMs: 10_000 },
  execute: async (ctx) => {
    const { method, url, headers, body, timeoutMs } = ctx.config;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined && method !== "GET" ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const contentType = response.headers.get("content-type") ?? "";
      const responseBody = contentType.includes("application/json")
        ? await response.json().catch(() => null)
        : await response.text();

      ctx.log("http.response", { status: response.status, url });

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
