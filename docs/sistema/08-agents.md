# Agents

> Última revisão: 2026-08-03 · commit `93468bf`

## O que faz

Um **Agent** é uma configuração de IA reutilizável, guardada no workspace como um recurso de primeira classe: uma persona (system prompt), um modelo e um provider, uma credencial, uma temperatura, um conjunto de ferramentas habilitadas e, opcionalmente, uma base de conhecimento. Você o define uma vez, na página `/agents`, e depois o invoca de vários lugares — de dentro de um fluxo pelo node `ai.agent`, ou direto pela API para testar.

A distinção que importa é com o node de chat simples. Um node `ai.chat` é uma chamada única e sem estado a um modelo: prompt entra, texto sai, e toda a configuração vive no node — se você usa o mesmo assistente em cinco fluxos, mantém cinco cópias do prompt. Um Agent inverte isso: a configuração é o recurso, e o fluxo só referencia um id. Mais importante, o Agent **roda um laço de ferramentas**. Ele chama o modelo, e se a resposta pedir uma tool, executa a tool, devolve o resultado ao modelo e chama de novo, até o modelo responder sem pedir mais nada ou até bater o teto de iterações. Um `ai.chat` nunca faz isso.

O ferramental disponível é montado por agente a partir dos nomes de tool habilitados. As nativas cobrem cálculo aritmético, requisição HTTP, query SQL numa conexão Postgres do workspace, busca na base de conhecimento configurada e leitura/escrita de memória. Além delas, um agente pode habilitar tools de servidores MCP conectados ao workspace, referenciadas por um identificador composto de servidor e nome da tool; elas são resolvidas no momento da chamada e viram tools executáveis indistinguíveis das nativas do ponto de vista do modelo. Uma tool que o modelo pede mas que não está habilitada não derruba a execução: o agente devolve um erro como resultado da tool e deixa o modelo se recuperar — mesmo tratamento dado a uma tool que lança exceção.

A **memória** é o que separa um Agent de uma chamada isolada ao longo do tempo. Ela é explícita e controlada pelo próprio modelo: duas tools, uma para gravar um fato sob uma chave e outra para ler. O armazenamento é chave/valor por agente, sem escopo de conversa — é memória do _agente_, não da conversa, e persiste indefinidamente. Nada é injetado automaticamente no prompt; se o agente não chamar `memory_get`, não lembra de nada. O system prompt precisa instruí-lo a usar as duas.

O contexto de uma conversa com um agente é, por outro lado, totalmente responsabilidade de quem chama. O serviço monta as mensagens como system prompt + histórico recebido + mensagem atual, e não persiste nada disso. Quem chama pela API decide o que mandar como histórico; o node `ai.agent` dentro de um fluxo não manda histórico nenhum — cada passo do fluxo é uma conversa nova de um turno só, e o que persiste entre turnos é a memória chave/valor.

A troca de provider é abstraída em `packages/ai`: todo node de IA e todo agente chamam o registry, nunca um provider direto. Isso dá um ponto único para rate limiting e telemetria de custo/tokens, e normaliza o _tool calling_ — o formato de definição de tool e de resposta com chamadas é o mesmo para Anthropic, OpenAI, Gemini e Ollama, com cada adaptador traduzindo para o dialeto nativo. O agente devolve, além do texto, o total de tokens e o custo acumulado de **todas** as iterações do laço, o que é o que aparece no custo da execução do fluxo.

## Onde vive

| Arquivo                                    | Papel                                                                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/agents/agents.service.ts`    | CRUD e o laço de tool calling; resolve tools nativas e MCP e acumula tokens/custo.                                         |
| `apps/api/src/agents/agents.controller.ts` | Rotas autenticadas, todas sob `WorkspaceGuard`.                                                                            |
| `apps/api/src/agents/tools.ts`             | Definições e implementações das tools nativas (`calculator`, `http`, `sql`, `knowledge_base`, `memory_get`, `memory_set`). |
| `apps/api/src/agents/calculator.ts`        | Avaliador aritmético usado pela tool `calculator`.                                                                         |
| `apps/api/src/engine/engine.service.ts`    | Expõe o RPC `callAgent` ao sandbox do node, ligando o node `ai.agent` ao serviço.                                          |
| `packages/nodes/src/definitions/agent.ts`  | Node `ai.agent`: recebe um `agentId` e uma mensagem, devolve o texto e reporta tokens/custo.                               |
| `packages/ai/src/registry.ts`              | `getProvider` — ponto único de acesso aos providers, com rate limiting e telemetria embutidos.                             |
| `packages/ai/src/providers/`               | Adaptadores por provider; cada um traduz tools e saída estruturada para o formato nativo.                                  |
| `packages/ai/src/types.ts`                 | Contrato comum de mensagem, tool e resultado que os providers implementam.                                                 |
| `apps/web/src/app/(app)/agents/page.tsx`   | UI de CRUD, seleção de tools (nativas + MCP) e chat de teste.                                                              |
| `apps/web/src/hooks/use-agents.ts`         | Hooks de dados da página.                                                                                                  |

**Rotas da API** — todas sob `WorkspaceGuard`.

| Rota                                                           | O que faz                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `GET /agents` · `POST /agents`                                 | Lista e cria agentes do workspace.                                       |
| `GET /agents/:id` · `PATCH /agents/:id` · `DELETE /agents/:id` | CRUD por id, sempre filtrado por workspace.                              |
| `POST /agents/:id/chat`                                        | Executa o laço de tool calling com uma mensagem e um histórico opcional. |

**Models Prisma**

- `Agent` — persona e configuração: `systemPrompt`, `provider`, `model`, `credential` (nome de uma credencial do workspace), `temperature`, `tools` (JSON com os nomes habilitados), `outputSchema` e `knowledgeBaseId` opcional.
- `AgentMemory` — memória longa chave/valor, única por `agentId + key`, apagada em cascata com o agente.

## Como se conecta

- É consumido de dentro dos fluxos pela [Engine de execução](01-engine-execucao.md), via RPC do sandbox; o node `ai.agent` faz parte do [Catálogo de nodes](03-nodes-catalogo.md).
- Depende da [Plataforma de IA](11-ai-plataforma.md) para providers, rate limiting, telemetria e contabilização de custo.
- A tool `knowledge_base` liga o agente ao [Knowledge e RAG](09-knowledge-rag.md); a base é escolhida na configuração do agente, não pelo modelo.
- Tools de servidores externos vêm do [MCP](10-mcp.md), resolvidas em tempo de chamada.
- Depende de [Auth e workspaces](12-auth-workspaces.md) para isolamento: agentes, credenciais, bases de conhecimento e servidores MCP são todos filtrados por workspace em cada resolução.
- A página `/agents` faz parte da [Web e editor](13-web-editor.md).

## Decisões e histórico

- [ADR-009](../adr/009-saida-estruturada-llm.md) — limites da saída estruturada (`outputSchema`) entre providers; explica por que nem todo provider entrega o mesmo contrato de JSON garantido.
- [ADR-007](../adr/007-criptografia-secrets.md) — por que o agente guarda o **nome** de uma credencial e não o segredo: a chave vive criptografada em `Credential` e só é decifrada no momento da chamada.
- [ADR-006](../adr/006-multi-tenancy.md) — por que toda leitura de agente, credencial, base e servidor MCP carrega o `workspaceId` no `where`, e não só o id.
- [ADR-005](../adr/005-isolamento-execucao-nodes.md) — por que o node `ai.agent` não fala com o banco: ele roda em worker isolado e pede ao processo principal via RPC.
- [ADR-010](../adr/010-observabilidade.md) — a telemetria de IA que o registry emite em toda chamada de agente, inclusive nas que falham.
- Não há ADR específico de agentes: nem do laço de tool calling, nem do desenho da memória chave/valor, nem do formato de referência de tool MCP. As justificativas existentes estão em comentários no código.

## Limitações e fora de escopo

- **`Agent.outputSchema` existe no schema mas não é usado.** Nenhum DTO o aceita e o laço de chat nunca o passa ao provider — saída estruturada hoje é recurso do node `ai.chat`, não do agente. Campo morto.
- **Teto rígido de 5 iterações** de ferramenta (`agents.service.ts:19`). Ao estourar, o agente devolve uma mensagem fixa em vez de erro, então o fluxo continua achando que recebeu uma resposta válida.
- **Sem streaming.** `POST /agents/:id/chat` responde só no fim do laço; a UI de teste espera a resposta completa.
- **Sem persistência de conversa.** O histórico é responsabilidade do chamador; o node `ai.agent` nunca envia nenhum, então dentro de um fluxo o agente é sempre monoturno.
- **Memória sem escopo e sem limpeza.** É global por agente (não por usuário nem por conversa), cresce sem limite, não expira, e não há UI para inspecionar ou apagar entradas — só o modelo escreve nela.
- **Tools nativas com superfície ampla.** A tool `http` faz requisição para qualquer URL e a `sql` executa qualquer query numa conexão do workspace, ambas sem allowlist, sem restrição de método e sem modo somente-leitura. Habilitá-las é um risco de SSRF e de escrita não intencional.
- **A base de conhecimento é fixa por agente**, uma só; o modelo não escolhe entre várias.
- **Falha de tool vira texto para o modelo**, não erro para o chamador. Uma tool quebrada pode produzir uma resposta confiante e errada em vez de uma execução falha.
- **Sem versionamento nem histórico de agentes.** Editar o system prompt afeta imediatamente todos os fluxos que referenciam aquele id, e não há como voltar atrás.
