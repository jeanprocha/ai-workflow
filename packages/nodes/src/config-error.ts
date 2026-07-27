import type { ZodError } from "zod";

/** Traduz o `code` de um issue do zod pra uma frase curta, sem o jargao interno. */
function describeIssue(issue: {
  code: string;
  message: string;
  expected?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
}): string {
  switch (issue.code) {
    case "invalid_type":
      return `esperado ${issue.expected ?? "outro tipo"}, valor ausente ou do tipo errado`;
    case "too_small":
      return `abaixo do minimo permitido (${issue.minimum})`;
    case "too_big":
      return `acima do maximo permitido (${issue.maximum})`;
    case "invalid_value":
    case "invalid_enum_value":
      return "valor nao permitido para este campo";
    default:
      return issue.message;
  }
}

/**
 * Traduz um ZodError (da config JA resolvida de um node — sem `{{ }}`) pra
 * uma mensagem legivel, em vez do JSON multi-linha cru que o zod devolve por
 * padrao. A tela de Execucoes ja identifica qual node falhou (pelo nodeId do
 * step); esta mensagem so precisa dizer qual campo e por que.
 */
export function formatConfigError(nodeType: string, error: ZodError): string {
  const parts = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(config)";
    return `campo "${path}" — ${describeIssue(issue)}`;
  });
  return `Configuracao invalida em "${nodeType}": ${parts.join("; ")}.`;
}
