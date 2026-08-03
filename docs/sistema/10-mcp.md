# Servidores MCP

> Última revisão: 2026-08-02 · commit `80da213`

## O que faz

MCP (Model Context Protocol) é o protocolo pelo qual um programa externo expõe um conjunto de ferramentas para um cliente de IA. Este domínio é o lado cliente: permite que um workspace registre servidores MCP de terceiros e passe a usar as tools deles dentro de fluxos e agentes, sem que a plataforma precise implementar cada integração nativamente. Na prática é a válvula de escape para a cauda longa de integrações.

O modelo mental é simples e vale internalizar: **um servidor MCP é conectado uma vez por workspace, suas tools são descobertas na conexão e persistidas no banco, e a partir daí ficam disponíveis para nodes e agentes**. Conectar não é só um teste de conectividade — é o momento em que o catálogo de tools daquele servidor entra no banco. Cada `connect` ou `reconnect` refaz a descoberta e substitui por completo as tools persistidas daquele servidor, num único transaction, então tools que sumiram do servidor somem do catálogo local.

Existem três transportes. O `stdio` roda o servidor como processo filho, com comando, argumentos e variáveis de ambiente configurados no registro. O `sse` e o `http` falam com um servidor remoto por URL, com headers opcionais. A escolha é por servidor e não muda depois sem reconectar.

O status de um servidor tem quatro estados (`connecting`, `connected`, `disconnected`, `error`) e é sempre o resultado da última operação real, nunca uma declaração do usuário. Um erro de conexão não derruba a requisição: o servidor é registrado mesmo assim, mas fica em `error` com a mensagem original em `lastError`, para que o usuário veja o que aconteceu e possa corrigir a configuração e reconectar.

A conexão viva em si — o cliente do SDK com o transporte aberto — mora **em memória, no processo que fez o connect**. Isso é o detalhe mais consequente do domínio, porque a API e o worker são processos separados. Chamar uma tool a partir da API reaproveita a conexão em cache se ela existir e, se não existir, reconecta sob demanda a partir da configuração persistida. Por isso o health-check, que roda no worker, não pode confiar nesse cache: ele faz uma sondagem própria a cada minuto — conecta a partir da configuração salva, lista as tools, fecha — e só marca `error` quando essa sondagem falha de verdade.

A chamada de uma tool valida em duas etapas, e a ordem importa. Primeiro garante conectividade, porque um servidor que nunca conectou tem lista de tools vazia e checar o nome antes devolveria "tool não encontrada" — mensagem enganosa que esconderia o problema real. Só depois, com as tools já atualizadas, é que o nome é conferido contra o catálogo persistido, para devolver um 404 honesto em vez do erro JSON-RPC genérico do SDK, que viraria um 500.

## Onde vive

| Arquivo                                      | Papel                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| `apps/api/src/mcp/mcp.controller.ts`         | Rotas de CRUD, reconnect/disconnect e chamada de tool.                        |
| `apps/api/src/mcp/mcp.service.ts`            | Estado das conexões vivas, descoberta e persistência de tools, health-check.  |
| `apps/api/src/mcp/mcp.module.ts`             | Registra o job repetível de health-check (intervalo de 60 s); só produtor.    |
| `apps/api/src/mcp/mcp-health.processor.ts`   | Consumidor da fila `mcp-health` no worker.                                    |
| `packages/ai/src/mcp-client.ts`              | Cliente `@modelcontextprotocol/sdk`: monta o transporte, lista e chama tools. |
| `packages/nodes/src/definitions/mcp-tool.ts` | Definição do node `mcp.tool`.                                                 |
| `apps/api/src/agents/agents.service.ts`      | Converte refs `mcp:<serverId>:<toolName>` do agente em tools executáveis.     |
| `apps/api/src/engine/engine.service.ts`      | Expõe o callback `callMcpTool` no contexto de execução dos nodes.             |

**Rotas da API**

| Rota                               | O que faz                                                      |
| ---------------------------------- | -------------------------------------------------------------- |
| `GET /mcp/servers`                 | Lista os servidores do workspace, já com as tools descobertas. |
| `POST /mcp/servers`                | Registra um servidor e tenta conectar imediatamente.           |
| `POST /mcp/servers/:id/reconnect`  | Refaz a conexão e redescobre as tools.                         |
| `POST /mcp/servers/:id/disconnect` | Fecha a conexão viva e marca `disconnected`.                   |
| `DELETE /mcp/servers/:id`          | Fecha a conexão e remove o registro (tools caem por cascade).  |
| `POST /mcp/servers/:id/call`       | Invoca uma tool pelo nome, com argumentos livres.              |

**Páginas web**

| Página | O que faz                                                                     |
| ------ | ----------------------------------------------------------------------------- |
| `/mcp` | Registra servidores, mostra status e último erro, lista as tools descobertas. |

**Models Prisma** (`apps/api/prisma/schema.prisma`)

| Model       | Uma linha                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `McpServer` | Registro do servidor: transporte, comando/args/env (stdio) ou url/headers (sse, http), `status`, `lastError`, `lastCheckedAt`. |
| `McpTool`   | Tool descoberta em um servidor: nome, descrição e o JSON Schema de entrada declarado pelo servidor.                            |

**Filas BullMQ**

| Fila         | O que processa                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `mcp-health` | Job repetível a cada 60 s que sonda todos os servidores em `connected`. Concorrência via `MCP_HEALTH_CONCURRENCY` (padrão 1). |

## Como se conecta

- Depende de [Auth e workspaces](12-auth-workspaces.md): servidores são por workspace e toda rota passa pelo `WorkspaceGuard`.
- É consumido pelo [Catálogo de nodes](03-nodes-catalogo.md) via `mcp.tool`, cuja execução a [Engine](01-engine-execucao.md) atende com o callback `callMcpTool` — o node escolhe servidor, nome da tool e argumentos na config.
- É consumido por [Agents](08-agents.md): um agente lista tools MCP no seu array de tools usando o prefixo `mcp:<serverId>:<toolName>`, e elas entram no loop de tool-calling junto das tools nativas. O JSON Schema de entrada da tool passa por uma sanitização antes de ir para o provider, pelas restrições de saída estruturada.
- O health-check roda no worker, não na API — ver [Observabilidade e deploy](14-observabilidade-deploy.md).
- O [Editor web](13-web-editor.md) usa a lista de servidores e tools para montar os seletores da config do node `mcp.tool`.

## Decisões e histórico

- [ADR-008](../adr/008-worker-separado.md) — por que o health-check é consumido pelo worker enquanto o registro do job repetível sai da API; é a origem direta da divergência de estado descrita abaixo.
- [ADR-009](../adr/009-saida-estruturada-llm.md) — as restrições de JSON Schema dos providers que obrigam a sanitizar o `inputSchema` de uma tool MCP antes de oferecê-la a um agente.
- [ADR-006](../adr/006-multi-tenancy.md) — o isolamento por workspace que se aplica a servidores e tools.
- [base-evolucao.md](../produto/base-evolucao.md) §3.3 — registra "conexões MCP em memória por processo" como dívida, com a direção de mover o estado para Redis ou banco.
- Não há ADR próprio sobre MCP: a escolha do protocolo e dos três transportes foi decisão de implementação da fase, documentada em comentários no `schema.prisma` e no `mcp.service.ts`.

## Limitações e fora de escopo

- **Conexões vivem em memória por processo.** API e worker mantêm caches independentes: reconectar pela API não afeta o worker, e vice-versa. Na prática o worker nunca tem conexões em cache, então toda execução de node MCP que caia nele reconecta sob demanda. Um servidor `stdio` acaba sendo respawnado com frequência.
- **O health-check faz uma conexão nova a cada tick.** Para transporte `stdio` isso significa subir e derrubar o processo do servidor a cada 60 segundos, por servidor conectado — custo real em servidores pesados.
- **Só servidores em `connected` são sondados.** Um servidor que caiu para `error` nunca se recupera sozinho; precisa de um `reconnect` manual. Não há backoff nem retry automático.
- **`env` e `headers` são gravados como JSON em claro no banco**, fora do mecanismo de credenciais criptografadas do workspace ([ADR-007](../adr/007-criptografia-secrets.md)). Tokens de API passados a um servidor MCP não têm a mesma proteção que uma credencial nativa.
- **Não há allowlist nem escopo por tool.** Registrado o servidor, todas as tools que ele expõe ficam chamáveis por qualquer node ou agente do workspace, e um servidor `stdio` roda um comando arbitrário no host da aplicação.
- **A descoberta é destrutiva e só acontece na conexão.** Não há polling do catálogo: se o servidor ganhar tools novas, elas só aparecem depois de um `reconnect`.
- **Só o lado cliente existe.** A plataforma não expõe os próprios fluxos ou nodes como um servidor MCP.
- **Sem timeout próprio na chamada de tool** além do timeout de node da engine; o resultado do SDK é devolvido como veio, sem normalização de formato.
