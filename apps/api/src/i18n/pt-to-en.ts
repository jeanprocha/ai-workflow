/**
 * Traducao pt-BR -> en das mensagens de excecao HTTP. O catalogo pt-BR
 * continua sendo o texto literal jogado direto no `throw new XException(...)`
 * em cada service (nao mudamos nenhum throw-site) — este arquivo so mapeia
 * essas strings pra ingles quando o LangExceptionFilter (./lang.filter.ts)
 * ve `x-lang: en` na request.
 *
 * Isso mantem pt-BR como comportamento default byte-identico ao que ja
 * existia (nenhum teste ou contrato quebra) e evita threading de locale por
 * toda a cadeia de chamadas de service — a traducao acontece so na borda,
 * depois que a excecao ja foi lancada.
 */

export type Locale = 'pt' | 'en';

/** Mensagens estaticas (sem interpolacao) — lookup exato. */
export const STATIC_TRANSLATIONS: Record<string, string> = {
  'Template nao encontrado.': 'Template not found.',
  'Sugestao invalida para aplicacao.': 'Invalid suggestion to apply.',
  'Informe a credencial do provider de IA.':
    'Provide the AI provider credential.',
  'Execucao nao encontrada.': 'Execution not found.',
  'A IA nao retornou nenhuma sugestao.':
    'The AI did not return any suggestion.',
  'Sugestao nao encontrada.': 'Suggestion not found.',
  'Fluxo nao encontrado.': 'Flow not found.',
  'Versao nao encontrada.': 'Version not found.',
  'Servidor MCP nao encontrado.': 'MCP server not found.',
  'Conexao nao encontrada.': 'Connection not found.',
  'Usuario nao autenticado.': 'User not authenticated.',
  'Header x-workspace-id e obrigatorio.': 'x-workspace-id header is required.',
  'Voce nao tem acesso a este workspace.':
    "You don't have access to this workspace.",
  'Agente nao encontrado.': 'Agent not found.',
  'Variavel nao encontrada.': 'Variable not found.',
  'Base de conhecimento nao encontrada.': 'Knowledge base not found.',
  'Documento nao encontrado.': 'Document not found.',
  'O arquivo nao contem texto extraivel.': 'The file has no extractable text.',
  'Falha ao gerar embedding da busca.': 'Failed to generate search embedding.',
  'Fluxo sem versao atual.': 'Flow has no current version.',
  'Webhook nao encontrado.': 'Webhook not found.',
  'Ja existe uma conta com este email.':
    'An account with this email already exists.',
  'Email ou senha invalidos.': 'Invalid email or password.',
  'Refresh token invalido ou expirado.': 'Invalid or expired refresh token.',
  'Usuario nao encontrado.': 'User not found.',
  'So e possivel diagnosticar execucoes que falharam.':
    'Only failed executions can be diagnosed.',
  'Execucao marcada como failed, mas nenhum step com erro foi encontrado.':
    'Execution marked as failed, but no step with an error was found.',
  'A IA nao retornou um diagnostico em formato valido. Tente novamente.':
    'The AI did not return a diagnosis in a valid format. Please try again.',
  'Esta sugestao nao pode ser aplicada automaticamente.':
    'This suggestion cannot be applied automatically.',
  'Ja existe uma variavel com esta chave neste workspace.':
    'A variable with this key already exists in this workspace.',
  'Este fluxo ainda nao tem uma versao salva.':
    'This flow does not have a saved version yet.',
  'Configure a credencial do provider de embeddings na base de conhecimento.':
    'Set the embeddings provider credential on the knowledge base.',
  'Grafo invalido.': 'Invalid graph.',
};

/** Mensagens com valor interpolado (nome, id, erro concatenado) — regex + template. */
export const DYNAMIC_TRANSLATIONS: Array<{
  pattern: RegExp;
  translate: (match: RegExpMatchArray) => string;
}> = [
  {
    pattern: /^Node "(.+)" nao encontrado no grafo desta execucao\.$/,
    translate: (m) => `Node "${m[1]}" not found in this execution's graph.`,
  },
  {
    pattern: /^Credencial "(.+)" nao encontrada neste workspace\.$/,
    translate: (m) => `Credential "${m[1]}" not found in this workspace.`,
  },
  {
    pattern:
      /^Nao foi possivel gerar um workflow valido a partir da descricao\. Ultimo erro: ([\s\S]+)$/,
    translate: (m) =>
      `Could not generate a valid workflow from the description. Last error: ${m[1]}`,
  },
  {
    pattern: /^Expressao cron invalida: ([\s\S]+)$/,
    translate: (m) => `Invalid cron expression: ${m[1]}`,
  },
  {
    pattern: /^Nao foi possivel extrair texto do arquivo: ([\s\S]+)$/,
    translate: (m) => `Could not extract text from the file: ${m[1]}`,
  },
  {
    pattern:
      /^O node "(.+)" nao foi executado na execucao original — nao ha o que reaproveitar\.$/,
    translate: (m) =>
      `Node "${m[1]}" was not executed in the original run — there's nothing to reuse.`,
  },
];

/** Traduz uma mensagem pt-BR pra en; sem match conhecido, devolve a original (degrada com graca). */
export function translateMessage(message: string): string {
  const staticHit = STATIC_TRANSLATIONS[message];
  if (staticHit) return staticHit;

  for (const { pattern, translate } of DYNAMIC_TRANSLATIONS) {
    const match = message.match(pattern);
    if (match) return translate(match);
  }

  return message;
}
