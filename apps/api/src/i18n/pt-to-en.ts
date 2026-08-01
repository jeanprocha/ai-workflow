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
  'Template invalido ou incompativel com a versao atual.':
    'Invalid template or incompatible with the current version.',
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
  'Base de conhecimento nao encontrada neste workspace.':
    'Knowledge base not found in this workspace.',
  'Documento nao encontrado.': 'Document not found.',
  'O arquivo nao contem texto extraivel.': 'The file has no extractable text.',
  'Falha ao gerar embedding da busca.': 'Failed to generate search embedding.',
  'Fluxo sem versao atual.': 'Flow has no current version.',
  'Webhook nao encontrado.': 'Webhook not found.',
  'Ja existe uma conta com este email.':
    'An account with this email already exists.',
  'Email ou senha invalidos.': 'Invalid email or password.',
  'Refresh token invalido ou expirado.': 'Invalid or expired refresh token.',
  'Token invalido ou expirado.': 'Invalid or expired token.',
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
  'Ja existe uma conexao com este nome neste workspace.':
    'A connection with this name already exists in this workspace.',
  'Este fluxo ainda nao tem uma versao salva.':
    'This flow does not have a saved version yet.',
  'Configure a credencial do provider de embeddings na base de conhecimento.':
    'Set the embeddings provider credential on the knowledge base.',
  'Grafo invalido.': 'Invalid graph.',
  'Envie um arquivo no campo "file".': 'Send a file in the "file" field.',
  'Nao foi possivel conectar ao servidor MCP.':
    'Could not connect to the MCP server.',
  'Link de chat invalido ou expirado.': 'Invalid or expired chat link.',
  'Link de inbox invalido ou expirado.': 'Invalid or expired inbox link.',
  'Conversa nao encontrada.': 'Conversation not found.',
  'Muitas mensagens em pouco tempo. Aguarde um instante.':
    'Too many messages in a short time. Please wait a moment.',
  'Predefinicao nao encontrada.': 'Preset not found.',
  'Informe pelo menos um campo nesta conexao.':
    'Add at least one field to this connection.',
  'Todo campo precisa de um nome.': 'Every field needs a name.',
  'Informe o valor desta conexao.': "Provide this connection's value.",
  'Ja existe uma predefinicao com este nome para este tipo de node.':
    'A preset with this name already exists for this node type.',
  'Ja existe um template com este nome neste workspace.':
    'A template with this name already exists in this workspace.',
  // H2-04 — publicar fluxo como API (guard/controller de v1/flows/*).
  'Chave de API invalida ou revogada.': 'Invalid or revoked API key.',
  'Este fluxo nao esta ativo. Ative-o no editor para publicar como API.':
    'This flow is not active. Activate it in the editor to publish it as an API.',
  'Limite de requisicoes desta chave excedido. Tente novamente em instantes.':
    'This key has exceeded its request limit. Please try again shortly.',
  'Chave de API nao encontrada.': 'API key not found.',
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
    // (.*) e nao (.+): o caso mais comum e a credencial VAZIA (agente criado
    // sem preencher o campo fica com credential: ""), e com (.+) essa
    // mensagem escapava sem traducao mesmo com x-lang: en.
    pattern: /^Credencial "(.*)" nao encontrada neste workspace\.$/,
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
  {
    pattern: /^Tool "(.+)" nao encontrada neste servidor MCP\.$/,
    translate: (m) => `Tool "${m[1]}" not found on this MCP server.`,
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
