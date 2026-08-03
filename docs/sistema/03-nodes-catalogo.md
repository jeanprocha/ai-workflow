# Catálogo de nodes e expressões

> Última revisão: 2026-08-03 · commit `93468bf`

## O que faz

Um node é a unidade de trabalho de um fluxo. Todo node — o que faz uma requisição
HTTP, o que chama um LLM, o que decide um `if` — implementa exatamente o mesmo
contrato, e a engine não sabe nada sobre a semântica de nenhum deles: ela resolve
a configuração, chama o node, recebe um resultado e usa esse resultado para
rotear. Toda a variedade do produto mora dentro das definições; o percurso do
grafo é indiferente a ela.

Uma definição de node declara sua **identidade** (um `type` único em notação
pontuada, a categoria usada pela paleta do editor, rótulo, descrição e o nome de
um ícone `lucide-react`), o **schema da configuração** em zod mais um
`defaultConfig` que o editor usa ao soltar o node no canvas, a lista de **outputs
nomeados** que aparecem como saídas no canvas, e uma função **`execute`**. Nada
além disso — ver `packages/nodes/src/types.ts`.

O `execute` recebe um contexto com a configuração **já resolvida** (sem `{{ }}`),
o `input` vindo do node anterior (ou do payload do trigger), as variáveis de
runtime da execução, uma função de log estruturado e um conjunto de capacidades
que só a plataforma consegue oferecer, injetadas como RPC porque o node roda
isolado num `worker_thread`: ler uma credencial descriptografada do workspace,
conversar com um agente, buscar numa base de conhecimento, invocar uma tool de um
servidor MCP, responder no chat e pedir uma aprovação humana. O retorno é um
`output`, e opcionalmente: quais **branches** disparam (é assim que o `if` escolhe
`true`/`false` e o `parallel` dispara vários ao mesmo tempo), um **patch de
variáveis** que a engine mescla no estado da execução, o **uso** de tokens/custo
que os nodes de IA preenchem, e um **`suspend`** que pausa a execução ali (ver
[Aprovação humana](04-aprovacao-humana.md)).

Duas coisas importantes ficam **fora** da definição, de propósito. Retry e
tratamento de erro (`retry`, `onError`) são propriedades do node **no grafo**, não
do tipo do node: a engine as aplica de forma transversal a qualquer tipo (ver
`packages/shared/src/graph.ts`). E a validação da configuração roda **dentro do
worker**, depois da resolução das expressões, contra o `configSchema` — quem
formata o erro do zod numa frase legível é `packages/nodes/src/config-error.ts`.

Há hoje **51 definições** registradas, agrupadas informalmente em famílias:
triggers (manual, webhook, cron, chat, erro); lógica (if, switch, merge,
parallel, delay, set-variables, transform-list, append-to-list, log e o node de
código); IA (chat, classificação, tradução, sumarização, extração, visão, OCR,
embeddings e o node de agente); conhecimento e MCP; integrações (HTTP
white-label com assinatura HMAC, GraphQL, Postgres, MySQL, MongoDB, Redis, SMTP,
Slack, Discord, Telegram, Teams, WhatsApp, GitHub, Linear, Notion, Stripe, Google
Drive); parsers de arquivo (PDF, DOCX, CSV, TXT, JSON); e os nodes de contrato com
a plataforma (`api.respond`, `chat.reply`, `approval.human`). **A lista
autoritativa é `packages/nodes/src/registry.ts`** — não vale a pena reproduzi-la
aqui. Note que a "família" sugerida pelo prefixo do `type` **não** é a mesma coisa
que a `category`: as categorias são um enum fechado de sete valores
(`trigger`, `logic`, `database`, `api`, `file`, `ai`, `communication`) que existe
para agrupar a paleta, e por isso `integration.github` é categoria `api`,
`knowledge.search` e `mcp.tool` são categoria `ai`, e `approval.human` é `logic`.

Existem **duas listas** de nodes, e isso é intencional. `registry.ts` é
server-only e importa os `execute` de verdade, com todas as dependências nativas
(`pg`, `mysql2`, `mongodb`, `ioredis`, `nodemailer`, `pdf-parse`, `mammoth`);
`catalog.ts` carrega só metadados e é seguro para o bundle do browser, porque o
editor precisa de tipo, categoria, rótulo, ícone, outputs e `defaultConfig` mas
nunca do `execute`. Um node cuja implementação puxa dependência pesada é dividido
em dois arquivos: `X.meta.ts` (schema + metadados, importado pelos dois lados) e
`X.ts` (o `execute`, que faz spread do meta). Nodes leves ficam num arquivo só.

O sistema de **expressões `{{ }}`** é o que faz um node consumir a saída de outro.
Qualquer string dentro da configuração de um node pode conter expressões, e a
engine as resolve na thread principal, imediatamente antes de despachar o node
para o sandbox — o node sempre recebe valores concretos. Dá para referenciar três
raízes: `$input` (o payload que chegou neste node), `$vars` (as variáveis de
runtime da execução) e `$node.<nodeId>.<caminho>` (a saída de qualquer node já
executado, por id). A travessia é por ponto e indexa objeto e array do mesmo
jeito. Não há `eval`: não existem operadores, funções, aritmética nem
formatadores, por design — a válvula de escape para isso é o node `logic.code`.

Duas regras de comportamento valem a pena guardar. Primeira: se a string inteira
é **exatamente uma** expressão, o valor resolvido preserva o tipo (um número
continua número, um objeto continua objeto); se a expressão está misturada com
texto, tudo vira string, com `null`/`undefined` virando string vazia e
não-strings sendo serializados em JSON. Segunda: referenciar um id de node que
**não existe no grafo** lança um erro nomeando o id, em vez de resolver para
`undefined` em silêncio — quase sempre é erro de digitação. Um id que existe mas
cujo node ainda não rodou (branch não tomada) continua resolvendo para
`undefined`, que é legítimo.

Há duas exceções à resolução, ambas por causa do mesmo problema: a regex de
expressões é cega ao contexto. O campo `code` do node `logic.code` é pulado
explicitamente pela engine, porque é JavaScript literal e um bloco como
`if (a) {{ x = 1 }}` casaria com o padrão; o código recebe `$input`/`$vars` como
globais do contexto vm, não por interpolação. E o node HTTP resolve `$auth` e
`$sig` numa **segunda passada**, dentro do próprio `execute`: esses valores só
existem depois de ler a credencial e calcular o timestamp da assinatura, então a
primeira passada precisa devolvê-los literais (é para isso que serve
`preserveRoots`).

Por fim, `NodePreset` é uma configuração de node salva e reutilizável, escopada
ao workspace e ao tipo do node. O editor mostra uma barra genérica no topo do
painel de qualquer node para aplicar uma predefinição (mesclando por cima do
config atual) ou salvar a atual como nova.

## Onde vive

| Arquivo                                              | Papel                                                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `packages/nodes/src/types.ts`                        | O contrato: `NodeDefinition`, `NodeExecutionContext`, `NodeExecutionResult`, `SuspendDescriptor`.           |
| `packages/nodes/src/registry.ts`                     | Lista autoritativa das definições completas (server-only) e lookup por `type`.                              |
| `packages/nodes/src/catalog.ts`                      | Espelho browser-safe: só metadados, para a paleta e o painel do editor.                                     |
| `packages/nodes/src/definitions/`                    | Uma definição por arquivo; `*.meta.ts` quando o `execute` puxa dependência nativa.                          |
| `packages/nodes/src/expressions.ts`                  | Resolução de `{{ }}`, `getPath` e `UnknownNodeIdError`.                                                     |
| `packages/nodes/src/config-error.ts`                 | Traduz `ZodError` da config resolvida numa mensagem legível.                                                |
| `packages/nodes/src/credential-payload.ts`           | Interpreta uma credencial como valor único ou objeto multi-campo.                                           |
| `packages/nodes/src/text-extraction.ts`              | Extração de texto (PDF/DOCX/CSV/TXT/MD) compartilhada entre os nodes `file.*` e a ingestão de conhecimento. |
| `packages/nodes/src/ai-shared.ts`                    | Helpers comuns aos nodes de IA.                                                                             |
| `packages/shared/src/graph.ts`                       | `NodeCategory` (enum fechado), `WorkflowNode` com `retry`/`onError`, `ERROR_HANDLE`, `APPROVAL_NODE_TYPE`.  |
| `apps/api/src/engine/engine.service.ts`              | Chama `resolveExpressions` antes de despachar o node (com o skip de `logic.code`).                          |
| `apps/api/src/engine/sandbox/node-worker-entry.ts`   | Dentro do worker: busca a definição, valida o config e chama o `execute`.                                   |
| `apps/api/src/workflows/graph.schema.ts`             | Valida o grafo salvo contra o catálogo (tipo existe, categoria bate).                                       |
| `apps/api/src/node-presets/`                         | CRUD de predefinições de config, escopado por workspace.                                                    |
| `apps/web/src/components/editor/node-palette.tsx`    | Paleta, agrupada por categoria.                                                                             |
| `apps/web/src/components/editor/config-panel.tsx`    | Painel de configuração — um componente de formulário por tipo de node.                                      |
| `apps/web/src/lib/node-icons.tsx`                    | Ícone por tipo de node; sem entrada aqui o node aparece sem símbolo.                                        |
| `apps/web/src/lib/i18n/dictionaries/node-catalog.ts` | Par pt/en das `description` do catálogo (o `label` não é traduzido).                                        |

**Rotas da API**

| Rota                                                   | O que faz                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| `GET /node-presets?nodeType=`                          | Lista as predefinições do workspace, opcionalmente por tipo. |
| `POST /node-presets`                                   | Salva o config atual como predefinição.                      |
| `PATCH /node-presets/:id` · `DELETE /node-presets/:id` | Edita e remove.                                              |

**Models Prisma**

- `NodePreset` — config de node salva por workspace, única por `[workspaceId, nodeType, name]`.

### Como adicionar um node novo

Este é o ponto de extensão mais provável do projeto. A sequência, na ordem em que
compila:

1. **Escolha o `type` e a categoria.** O `type` é a chave estável, em notação
   pontuada (`familia.acao`); a `category` tem que ser um dos sete valores de
   `NodeCategory` em `packages/shared/src/graph.ts`, porque
   `apps/api/src/workflows/graph.schema.ts` rejeita o grafo se a categoria salva
   não bater com a do catálogo.
2. **Crie a definição** em `packages/nodes/src/definitions/`. Se o `execute` for
   puxar driver de banco, SMTP, parser ou qualquer dependência nativa do Node,
   divida em `X.meta.ts` (schema zod, `defaultConfig`, metadados) e `X.ts` (o
   `execute`, fazendo spread do meta) — senão o bundle do editor quebra. Nodes
   sem dependência pesada ficam num arquivo só.
3. **Registre nas duas listas**: `registry.ts` (definição completa) e
   `catalog.ts` (o meta, ou a própria definição quando não houve split). Esquecer
   a segunda faz o node existir em runtime mas nunca aparecer na paleta.
4. **Formulário no editor**: adicione um componente de campos em
   `apps/web/src/components/editor/config-panel.tsx` e o `nodeType === "..."`
   correspondente. Alternativa rápida: incluir o tipo em `JSON_FALLBACK_TYPES` no
   mesmo arquivo, que renderiza um textarea de JSON cru sobre o config.
5. **Ícone e textos**: o nome do ícone `lucide-react` vai na definição e precisa
   estar mapeado em `apps/web/src/lib/node-icons.tsx`; a descrição em pt/en vai em
   `apps/web/src/lib/i18n/dictionaries/node-catalog.ts`.
6. **Se o node precisar de algo que só a plataforma tem** (credencial, agente,
   conhecimento, MCP, chat, pausa), use uma capacidade já existente no
   `NodeExecutionContext`. Uma capacidade **nova** custa caro: ela é um RPC do
   sandbox e exige mexer em `sandbox-messages.ts`, `node-worker-entry.ts`,
   `node-sandbox-runner.ts` e no handler correspondente da engine.
7. **Teste** com um `.spec.ts` ao lado da definição (o padrão do pacote é testar
   o `execute` com um contexto falso).

## Como se conecta

- A [engine de execução](01-engine-execucao.md) é a única consumidora do
  `registry.ts`: ela resolve expressões, valida config, executa o node no sandbox
  e interpreta `branches`/`varsPatch`/`usage`/`suspend`.
- O [editor web](13-web-editor.md) consome `catalog.ts` para a paleta e o painel
  de configuração, e `graph.schema.ts` valida o grafo salvo contra o mesmo
  catálogo — ver [Workflows e versionamento](02-workflows-versionamento.md).
- Os nodes de IA, agente, conhecimento e MCP são fachadas finas sobre
  [plataforma de IA](11-ai-plataforma.md), [agents](08-agents.md),
  [knowledge/RAG](09-knowledge-rag.md) e [MCP](10-mcp.md) — a lógica de verdade
  mora nesses domínios, o node só chama o RPC.
- `approval.human` e o `SuspendDescriptor` são a ponta de contato com
  [aprovação humana](04-aprovacao-humana.md); `api.respond`, com
  [flow API pública](05-flow-api-publica.md); os `trigger.*`, com
  [triggers e scheduler](06-triggers-scheduler.md).
- `getCredential` depende de [auth e workspaces](12-auth-workspaces.md) para o
  cofre de conexões criptografadas.

## Decisões e histórico

- [ADR-004](../adr/004-formato-grafo.md) — formato do grafo e a decisão pelo
  sistema de expressões `{{ }}` sem `eval`.
- [ADR-005](../adr/005-isolamento-execucao-nodes.md) — cada node roda num
  `worker_thread` isolado; é o que força as capacidades do contexto a serem RPC.
- [ADR-007](../adr/007-criptografia-secrets.md) — como as credenciais que
  `getCredential` devolve são guardadas.
- [ADR-009](../adr/009-saida-estruturada-llm.md) — limites da saída estruturada
  entre providers, que os nodes de IA herdam.
- [SPEC H2-03](../produto/spec-h2-03-node-codigo.md) — o node `logic.code`: por
  que o campo `code` é imune às expressões, e o desenho do isolamento em `vm`.
- Não há ADR nem spec dedicado ao **catálogo em si** (o split
  `registry.ts`/`catalog.ts`, a convenção `*.meta.ts`) nem ao model `NodePreset`
  — as duas coisas se justificam nos comentários dos próprios arquivos.

## Limitações e fora de escopo

- **Expressões não computam.** Sem operadores, comparações, funções, aritmética,
  formatação de data ou filtros — só travessia de caminho. Qualquer transformação
  exige o node `logic.code` (ou `logic.transformList` para o caso de listas).
- **A resolução é cega ao contexto.** A isenção do campo `code` é um `if` por
  tipo de node dentro da engine, não uma marca no schema: um node futuro com
  campo de código livre precisará do mesmo tratamento manual.
- **Duas listas manuais.** `registry.ts` e `catalog.ts` podem divergir; nada no
  build garante que um node registrado num esteja no outro.
- **O painel de configuração não é gerado do schema.** Cada tipo tem formulário
  escrito à mão, ou cai no textarea de JSON cru. O `configSchema` em zod não gera
  UI.
- **Não há versionamento de definição de node.** Mudar o schema de um node
  existente afeta todos os fluxos salvos; o único amortecedor são os defaults do
  zod, que preenchem campos que ainda não existiam quando o fluxo foi salvo.
- **`NodePreset` guarda config crua**, sem validar contra o schema do node no
  momento de aplicar — uma predefinição antiga pode reintroduzir um campo que
  mudou de forma.
- Uma capacidade nova no contexto de execução toca cinco arquivos em três
  camadas; não existe mecanismo de plugin nem carregamento dinâmico de nodes de
  fora do monorepo.
