import { z } from "zod";

/**
 * Schema/metadata do node HTTP Request — browser-safe (sem node:crypto nem
 * qualquer dependencia nativa), importado direto por catalog.ts pro bundle
 * do web. O execute (com a assinatura HMAC) mora em http-request.ts,
 * server-only, no mesmo split que redis-command.meta.ts/redis-command.ts ja
 * usa.
 *
 * `credential`/`query`/`signature` sao o que torna este node "white-label"
 * pra ERPs com autenticacao assinada (ex.: Rein) sem nenhum node dedicado —
 * ver docs/integracoes/rein.md. Todo campo novo tem default: um fluxo salvo
 * antes desta mudanca continua identico (sem credential, sem assinatura).
 */
const signatureConfigSchema = z.object({
  enabled: z.boolean().default(false),
  algorithm: z.enum(["sha256", "sha1", "sha512"]).default("sha256"),
  encoding: z.enum(["hex", "base64"]).default("hex"),
  /** Expressao pro segredo — normalmente `{{ $auth.clientSecret }}`. */
  secret: z.string().default(""),
  /** Expressao pra string assinada — ex.: `{{ $sig.path }}.{{ $auth.database }}.{{ $sig.timestamp }}`. */
  template: z.string().default(""),
  /** Somado ao timestamp atual antes de gerar `$sig.timestamp` — absorve deriva de clock. */
  timestampOffsetSec: z.number().int().default(0),
});
export type SignatureConfig = z.infer<typeof signatureConfigSchema>;

export const httpRequestConfigSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  url: z.string().min(1, "Informe uma URL."),
  // Valor `string | undefined` (nao so `string`): uma expressao tipo
  // `{{ $vars.termo }}` que ainda nao foi setada resolve pra `undefined`
  // antes de chegar aqui — legitimo, nao e erro de shape de config. Quem
  // decide o que fazer com undefined e o execute (query omite a chave; ver
  // http-request.ts), nao o parse.
  headers: z.record(z.string(), z.string().optional()).default({}),
  /** Vira query string na URL final — separado de `url` pra poder referenciar `{{ $auth.* }}`/`{{ $sig.* }}` com encoding correto (new URL() + URLSearchParams). */
  query: z.record(z.string(), z.string().optional()).default({}),
  body: z.unknown().optional(),
  timeoutMs: z.number().int().positive().default(10_000),
  /** Nome de uma Conexao (Configuracoes -> Conexoes) — habilita `{{ $auth.* }}`. JSON na credencial vira objeto; string simples vira `{ value: <string> }`. */
  credential: z.string().default(""),
  signature: signatureConfigSchema.default({
    enabled: false,
    algorithm: "sha256",
    encoding: "hex",
    secret: "",
    template: "",
    timestampOffsetSec: 0,
  }),
});
export type HttpRequestConfig = z.infer<typeof httpRequestConfigSchema>;

export const httpRequestMeta = {
  type: "api.httpRequest",
  category: "api",
  label: "HTTP Request",
  description: "Faz uma requisicao HTTP e retorna status, headers e body da resposta.",
  icon: "Globe",
  outputs: ["default"],
  configSchema: httpRequestConfigSchema,
  defaultConfig: {
    method: "GET",
    url: "",
    headers: {},
    query: {},
    timeoutMs: 10_000,
    credential: "",
    signature: {
      enabled: false,
      algorithm: "sha256",
      encoding: "hex",
      secret: "",
      template: "",
      timestampOffsetSec: 0,
    },
  } as HttpRequestConfig,
} as const;
