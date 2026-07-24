/**
 * Normaliza um JSON Schema para o "modo estrito" exigido por saida estruturada
 * (Anthropic output_config e OpenAI response_format com strict:true): todo
 * schema do tipo "object" precisa declarar additionalProperties explicitamente.
 * Evita que quem escreve o node/config precise lembrar disso manualmente.
 */
export function toStrictJsonSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map((item) => toStrictJsonSchema(item));
  }
  if (schema && typeof schema === "object") {
    const obj = schema as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      next[key] = toStrictJsonSchema(value);
    }
    if (next.type === "object" && next.additionalProperties === undefined) {
      next.additionalProperties = false;
    }
    return next;
  }
  return schema;
}
