import { z } from "zod";

/**
 * Schema/metadata do node de codigo — browser-safe (sem node:vm), importado
 * direto por catalog.ts pro bundle do web. O execute (com o vm isolado) mora
 * em code.ts, server-only, no mesmo split que http-request.meta.ts/
 * http-request.ts ja usa.
 *
 * `code` NAO passa pela resolucao de expressoes `{{ }}` da engine (skip
 * dedicado em engine.service.ts, call site de resolveExpressions) — o campo
 * e JS literal do usuario, e a regex de expressoes e cega a chaves: um
 * `{{ raiz-desconhecida }}` dentro do codigo viraria string vazia em
 * silencio, e `if (a) {{ x = 1 }}` casa com o padrao. O codigo recebe
 * `$input`/`$vars` como globals do contexto vm, nao por interpolacao.
 */
export const codeConfigSchema = z.object({
  code: z
    .string()
    .min(1, "Informe o codigo.")
    .max(50_000, "Codigo excede o limite de 50000 caracteres."),
  /** Timeout do vm (loop sincrono) — o timeout do sandbox (worker inteiro) e maior, ver sandboxTimeoutFor na engine. */
  timeoutMs: z.number().int().min(100).max(30_000).default(5_000),
});
export type CodeConfig = z.infer<typeof codeConfigSchema>;

export const codeMeta = {
  type: "logic.code",
  category: "logic",
  label: "Código",
  description:
    "Roda JavaScript do usuario num contexto isolado — sem rede, sem acesso a arquivos/processos. Recebe $input e $vars, devolve o valor de return.",
  icon: "Code",
  outputs: ["default"],
  configSchema: codeConfigSchema,
  defaultConfig: {
    code: "return $input;",
    timeoutMs: 5_000,
  } as CodeConfig,
} as const;
