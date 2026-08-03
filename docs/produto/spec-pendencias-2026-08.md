# SPEC — Pendências consolidadas (agosto/2026)

Data: 2026-08-03 · commit base `5930e03`.

Inventário do que ficou em aberto depois do H2, levantado em duas frentes: a
construção da camada [`docs/sistema/`](../sistema/00-visao-geral.md), que
obrigou a ler o código domínio por domínio, e o deploy de 2026-08-03, que expôs
o estado real de configuração da produção.

Cada item carrega evidência `arquivo:linha` ou a origem da constatação. Nada
aqui é hipótese: tudo foi verificado lendo o código, os logs de produção ou as
variáveis de ambiente do Railway.

**Este documento é um mapa, não um plano de execução.** Ele não decide o que
fazer nem em que ordem — a seção final propõe uma sequência, mas a priorização
é do usuário. Itens que virarem trabalho de verdade devem ganhar spec própria,
no padrão das seis do H2.

---

## Leitura executiva

Trinta e nove pendências, em seis grupos: configuração de produção (3),
observabilidade (4), controle de acesso (5), bugs de comportamento (10),
performance e escala (6), dívida de teste e documentação (11). Nenhuma delas
impede o produto de funcionar hoje; a maior parte é dívida que ficou
registrada em vez de escondida, que é a convenção deste repositório.

Duas coisas destoam do resto pela relação custo-benefício e deveriam ser
resolvidas primeiro, porque são configuração de produção e não código:
**SMTP ausente**, que deixa a aprovação humana sem enviar o link ao aprovador,
e **Sentry ausente**, que significa nenhuma captura de erro em produção.

O grupo mais estrutural é o de **controle de acesso**: o multi-tenancy do
ADR-006 está pronto no schema e nos guards, mas o papel do membro nunca é
consultado e não existe endpoint de convite. Na prática todo workspace tem um
único membro e todo membro é dono.

O que **não** está aqui: as três correções de 2026-08-03 (cron em rascunho,
criptografia de env/headers do MCP, token de aprovação após retry), que foram
implementadas, mergeadas e deployadas — ver `8ee1db6`, `e2f0dd0`, `3baef5e`.

---

## 1. Produção — configuração ausente

Nenhum destes é bug de código. São variáveis que o produto espera e que o
ambiente do Railway não define. Verificados nas variáveis dos serviços `api` e
`worker` do ambiente `production` e nos logs do deploy `9c77f2bb`.

### P1.1 — `SMTP_HOST` não configurada

**Evidência.** Log de boot do worker, 2026-08-03: `SMTP_HOST nao configurada —
envio de email desabilitado (no-op). Ver docs/deploy/railway.md.` Nenhuma
variável `SMTP_*` existe em nenhum dos dois serviços.

**Impacto.** O node `approval.human` cria a pendência normalmente, mas o link
público nunca chega ao aprovador — o mailer é um no-op silencioso. A fila
autenticada em `/approvals` continua funcionando, então quem tem conta resolve
pela interface; quem não tem, não é notificado. O mesmo vale para o reset de
senha entregue no H1.5, que fica inutilizável em produção.

**Proposta.** Definir `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e
`SMTP_FROM` nos dois serviços (o worker envia o email da aprovação; a API envia
o reset de senha). Depois, atualizar o catálogo de
[`railway.md`](../deploy/railway.md) — ver P6.4.

**Esforço.** Pequeno, se já houver provedor de SMTP escolhido. A decisão de
qual provedor é do usuário.

### P1.2 — `SENTRY_DSN` não configurada

**Evidência.** Ausente nas variáveis de `api` e `worker`. O init do Sentry vira
no-op sem DSN, por construção (ver
[`14-observabilidade-deploy.md`](../sistema/14-observabilidade-deploy.md)).

**Impacto.** A instrumentação do H1.4 existe no código e não captura nada em
produção. Erro não tratado em produção hoje só aparece nos logs do Railway, sem
agrupamento, sem alerta e sem stack trace estruturado.

**Esforço.** Pequeno. Criar o projeto no Sentry e definir a variável nos dois
serviços, mais `NEXT_PUBLIC_SENTRY_DSN` na Vercel.

### P1.3 — Alertas de falha sem canal configurado

**Evidência.** `WorkspaceAlertSetting` suporta email e webhook; o email depende
do mesmo mailer de P1.1.

**Impacto.** Enquanto o SMTP não existir, o alerta de execução falhada do H1.6
só funciona pelo canal webhook.

**Esforço.** Nenhum próprio — resolve junto com P1.1.

---

## 2. Observabilidade cega

### P2.1 — `/health/queues` não enxerga a fila `approvals`

**Evidência.** `apps/api/src/health/health.controller.ts:149-152` lista
`executions`, `ingestion`, `mcp-health` e `schedules`. Confirmado na resposta
de produção: o JSON traz quatro filas.

**Impacto.** A fila criada na entrega mais recente é invisível no health. Um
sweeper de aprovações entupido — expirações não processadas, retomadas travadas
— não aparece em lugar nenhum.

**Esforço.** Trivial. Já registrado como limitação em
[`14-observabilidade-deploy.md`](../sistema/14-observabilidade-deploy.md).

### P2.2 — O log de boot do worker também omite `approvals`

**Evidência.** `apps/api/src/worker.main.ts:37` loga quatro filas; a fila está
registrada em `worker.module.ts`. Confirmado no log do deploy de 2026-08-03:
`Worker iniciado — consumindo filas: executions, ingestion, mcp-health,
schedules.`

**Impacto.** Só cosmético, mas induz ao erro de achar que o sweeper não está
rodando. Corrigir junto com P2.1.

### P2.3 — Sem tracing distribuído

**Evidência.** Existe `traceId` no contexto de log, mas não há OpenTelemetry
nem spans.

**Impacto.** A correlação é por campo em log, não por trace navegável. Aceitável
hoje; vira problema quando a cadeia crescer.

### P2.4 — Load test defasado

**Evidência.** [`fase-10-load-test.md`](../perf/fase-10-load-test.md) é de
2026-07-24, anterior a continue-on-error, error workflow, pausa durável e node
de código.

**Impacto.** Não existe baseline de performance válido para a engine atual. Os
números publicados medem um motor que não é mais este.

---

## 3. Controle de acesso e multi-tenancy

O grupo mais estrutural. O ADR-006 está implementado no schema e nos guards, e
não implementado no comportamento.

### P3.1 — RBAC não existe na prática

**Evidência.** `apps/api/src/workspaces/guards/workspace.guard.ts:41` injeta
`request.workspaceRole`, e `apps/api/src/types/express.d.ts` declara o tipo. Um
grep em `apps/api/src` inteiro mostra que **nenhuma rota lê esse valor** — as
duas únicas ocorrências são a atribuição e a declaração.

**Impacto.** `member` tem exatamente os mesmos poderes que `owner`: apagar
fluxos, revogar chaves de API, ler credenciais, remover o workspace.

**Proposta.** Definir a matriz papel × operação antes de codificar. Isso é
decisão de produto, não de implementação, e merece spec própria. O H3 já lista
"RBAC + audit" como tema em [`base-evolucao.md`](base-evolucao.md) §5.

**Esforço.** Grande.

### P3.2 — Não existe convite de membro

**Evidência.** `apps/api/src/workspaces/workspaces.controller.ts` expõe apenas
`GET` e `POST /workspaces`. Nenhum endpoint adiciona ou remove membro.

**Impacto.** Todo workspace em produção tem exatamente um membro, o criador. O
multi-tenancy está estruturalmente pronto e sem porta de entrada. Note que
P3.1 é inofensivo enquanto isto for verdade — e vira urgente no dia em que
deixar de ser.

**Esforço.** Médio. Depende de P1.1 se o convite for por email.

### P3.3 — Sem audit log

**Evidência.** Nenhuma tabela ou serviço de auditoria. Listado no H3.

**Impacto.** Não há registro de quem apagou um fluxo, revogou uma chave ou leu
uma credencial.

### P3.4 — ADR-007 defasado

**Evidência.** O ADR afirma que a API só expõe "metadados (nome, provider,
criado em, últimos 4 caracteres)". Hoje `fieldsMeta` guarda nomes e tipos de
campo em claro e é devolvido na listagem — decisão justificada, documentada só
em comentário no `schema.prisma:200-206`. O ADR também não cobre
`kind: "fields"` das conexões multi-campo.

**Proposta.** Por convenção do repositório, ADR não se edita: escrever um
ADR-012 que supere o 007. A divergência já está registrada em
[`12-auth-workspaces.md`](../sistema/12-auth-workspaces.md).

### P3.5 — `url`, `command` e `args` de servidor MCP continuam em claro

**Evidência.** `apps/api/src/mcp/mcp.service.ts:297-298` devolve `args` e `url`
na resposta pública; `schema.prisma:602-605` mantém as colunas em texto claro.

**Impacto.** A criptografia de 2026-08-03 cobriu `env` e `headers`. Um servidor
`http` com token na query string, ou `stdio` com `--api-key=` nos args,
continua exposto no banco e no `GET /mcp/servers`.

**Proposta.** Exige decidir como separar a parte secreta da URL da parte que a
interface precisa exibir. Não é só cifrar a coluna.

---

## 4. Bugs de comportamento

### P4.1 — Agendamentos cron existem só no Redis

**Evidência.** `syncWorkflowSchedule` remove e recria o repeatable job; não há
tabela espelho.

**Impacto.** Perder o Redis perde todos os agendamentos, sem reconstrução
automática. Nenhum aviso, nenhum job.

**Esforço.** Médio. Uma tabela de schedules reconciliada no boot resolve.

### P4.2 — Cron inválido passa no save em silêncio

**Evidência.** Expressão inválida gera `logger.warn` e o save do grafo retorna
sucesso. O painel do editor valida em tempo de edição pelo endpoint de preview,
mas isso depende de o usuário pedir o preview.

**Impacto.** Fluxo salvo, ativo, com cron habilitado e nada agendado.

### P4.3 — `removeSchedule` casa a chave por `includes()`

**Evidência.** `apps/api/src/scheduler/scheduler.service.ts:82` compara por
substring, não por igualdade.

**Impacto.** Potencial de remover o agendamento errado se duas chaves
compartilharem prefixo. Não observado em produção.

### P4.4 — Chat não tem handoff humano

**Evidência.** `Conversation.status` existe com valor `open` e nada o
transiciona; `externalKey` está no schema e nenhum código o lê ou escreve.

**Impacto.** O operador responde pela inbox sem interromper o fluxo, que
continua respondendo a cada mensagem do visitante. Bot e humano falam ao mesmo
tempo com a mesma pessoa.

**Esforço.** Médio, e é decisão de produto antes de ser de código.

### P4.5 — `Agent.outputSchema` é campo morto

**Evidência.** Existe no Prisma; `create-agent.dto.ts` não o aceita e
`AgentsService.chat` nunca o repassa ao provider.

**Impacto.** Saída estruturada só funciona pelo node `ai.chat`. Um agente
configurado esperando schema não o obtém.

**Proposta.** Ou implementar, ou remover o campo. Manter campo morto no schema
é pior que qualquer das duas.

### P4.6 — Custo do chat direto com agente não é persistido

**Evidência.** `POST /agents/:id/chat` calcula tokens e custo e não grava nada.

**Impacto.** Esse custo é invisível em qualquer visão de analytics. O total
mostrado ao usuário é menor que o real.

### P4.7 — Dashboard e custo por provider nunca batem

**Evidência.** `analytics.service.ts:64` soma `Execution.costUsd` +
`AiSuggestion.costUsd`; `costByProvider` agrega só `ExecutionStep.costUsd` e
joga modelos fora do `MODEL_REGISTRY` num balde `desconhecido`.

**Impacto.** Dois números na mesma tela que discordam por construção. Não é
bug de cálculo, é ausência de definição de qual é a fonte de verdade.

### P4.8 — Health-check MCP não recupera servidor em `error`

**Evidência.** A sonda periódica só visita servidores em `connected`.

**Impacto.** Um servidor que caiu por falha transitória nunca volta sozinho;
exige reconexão manual.

### P4.9 — Não há cancelamento de execução

**Evidência.** `canceled` está no enum, é classificado como terminal em
`EXECUTION_PHASE` e aparece no filtro e na UI, mas nenhum código do repositório
escreve esse valor e não existe rota de cancelamento.

**Impacto.** Uma execução em andamento não pode ser interrompida. Um fluxo em
loop caro roda até o timeout.

### P4.10 — `GET /cost-optimizer/analyze` grava linha a cada chamada

**Evidência.** A análise cria registros em `AiSuggestion` mesmo sendo uma
operação de leitura.

**Impacto.** Um `GET` com efeito colateral, e crescimento da tabela
proporcional a quantas vezes a tela for aberta.

---

## 5. Performance e escala

Nenhum destes dói hoje, no volume atual. Todos dão problema com crescimento, e
o custo de corrigir agora é muito menor que depois.

### P5.1 — Sem índice em `executions.started_at`

**Evidência.** A tabela tem índice em `workflow_id` e `trace_id`. O
`timeseries` do analytics filtra por `started_at`.

**Impacto.** Full scan crescente. Hoje só o cache de 60s segura, e a tabela
não tem política de retenção.

### P5.2 — `costByProvider` agrega sem janela de tempo

**Evidência.** O `groupBy(['model'])` roda sobre todo o histórico do workspace;
`execution_steps` só tem índice em `execution_id`.

### P5.3 — `recent-executions` faz over-fetch para dentro do cache

**Evidência.** `analytics.service.ts:79-84` usa `include` sem `select`, então
as 5 linhas trazem `inputPayload` e `outputPayload` inteiros — blobs que o
dashboard não usa e que são serializados no Redis.

### P5.4 — A busca de nodes carrega o workspace inteiro em memória

**Evidência.** `search.service.ts:53-60` puxa todos os fluxos do workspace com
o grafo da versão atual embutido, mesmo quando nenhum label vai casar; o corte
em 5 acontece depois, em JavaScript, e sem `orderBy` — quais 5 aparecem é
indeterminado.

### P5.5 — Busca sem índice de texto

**Evidência.** `contains` insensitive vira `ILIKE '%q%'`; não há trigram nem
`tsvector` no schema.

### P5.6 — Rate limits em memória por processo

**Evidência.** O limite por chave da Flow API e o do chat são contadores em
memória, não coordenados entre réplicas.

**Impacto.** Com mais de uma instância da API, o limite efetivo é o
configurado multiplicado pelo número de réplicas.

---

## 6. Dívida de teste e documentação

### P6.1 — Não há harness de banco em `apps/api`

**Evidência.** Nenhum `.spec.ts` toca banco real; o jest é `rootDir: src` e o
job `build` do CI roda `pnpm test` sem serviço de Postgres — só o `e2e-smoke`
sobe banco.

**Impacto concreto.** O mapeamento `has` → `@>` da correção de token de
aprovação (`3baef5e`) foi verificado à mão contra Postgres, e não tem regressão
automatizada. Trocar `has` por `hasSome` mantém os testes verdes e ressuscita
o bug. Está registrado como limitação em
[`04-aprovacao-humana.md`](../sistema/04-aprovacao-humana.md).

**Proposta.** Um jest project separado com service container no CI. Beneficia
todo mapeamento Prisma não-trivial, não só este.

### P6.2 — Roteiros manuais parados na fase 11

**Evidência.** [`testing/manual/`](../testing/manual/) vai de `01-auth` a
`11-busca-scheduler`. As fases 12 (chat), 13 (HTTP white-label) e 14 (conexões
multi-campo) têm suíte automatizada e constam do roadmap, sem roteiro
companheiro. Nada do H1 nem do H2 foi coberto.

### P6.3 — O plano de testes está mais desatualizado que os roteiros

**Evidência.** A tabela de roadmap em `plano-de-testes.md:128` vai até a fase
14 e não menciona nenhuma entrega do H2, embora todas tenham specs em
`apps/e2e/tests/`.

### P6.4 — `railway.md` não é o catálogo completo de variáveis

**Evidência.** Faltam ao menos `APPROVAL_SWEEP_INTERVAL_MS`, `WORKER_PORT`,
`OBS_DEBUG_ENDPOINT`, `FLOW_API_DEFAULT_TIMEOUT_MS`,
`FLOW_API_MAX_SYNC_WAITERS`, `FLOW_API_RATE_LIMIT`, `LOG_LEVEL`, `LOG_PRETTY` e
`OLLAMA_BASE_URL`. O doc delega para `apps/api/.env`, arquivo que um
desenvolvedor novo não tem — o que existe é `.env.example`.

### P6.5 — A camada de operação não tem carimbo de revisão

**Evidência.** Nenhum doc de `deploy/`, `testing/`, `perf/` ou `integracoes/`
carrega `> Última revisão`. A regra de manutenção do `CLAUDE.md` e a skill
`/doc-sync` cobrem só `docs/sistema/`.

**Impacto.** É a camada em que defasagem é mais perigosa — e a única sem sinal
de frescor. P6.4 é sintoma disso.

### P6.6 — Sem OpenAPI/Swagger

**Evidência.** Grep por `swagger|openapi` em `apps/api` não retorna nada.

**Impacto.** A Flow API pública, entregue no H2-04 para consumo externo, não
tem contrato publicável. Listado no H3.

### P6.7 — Sem documentação de usuário final

**Evidência.** Nada explica ao usuário do produto como criar um fluxo, usar um
node, montar um agente ou publicar uma API. Estava previsto na fase 12 do
`plan.md` e nunca foi feito.

### P6.8 — `packages/*` sem README

**Evidência.** `ai`, `nodes`, `shared`, `ui` e `apps/e2e` não têm nenhum.
`packages/nodes` é o ponto de extensão mais provável do projeto, e só está
documentado em [`03-nodes-catalogo.md`](../sistema/03-nodes-catalogo.md).

### P6.9 — Crítica de design sem follow-up

**Evidência.** `.impeccable/critique/2026-07-26T21-59-18Z__apps-web-src-app.md`
registra score 23/40 e três P1s, incluindo dicionário pt-BR sem acentos. Não há
follow-up e não se sabe se foram resolvidos.

### P6.10 — ADR-004 defasado

**Evidência.** O ADR afirma que o `configSchema` de cada node valida antes da
execução. Na prática `graph.schema.ts` só confere que o tipo existe no
catálogo, e o parse acontece dentro do worker_thread em tempo de execução
(`node-worker-entry.ts:92`) — decisão deliberada e bem comentada, porque
expressões `{{ }}` não resolvidas quebrariam um `z.number()` no save.

### P6.11 — Docblocks desatualizados

**Evidência.** Dois casos verificados: o docblock de `ExecutionStep.varsPatch`
no `schema.prisma` diz "hoje só `logic.setVariables`", mas
`packages/nodes/src/definitions/code.ts` também retorna `varsPatch`; e
`packages/shared/src/execution.ts:13-14` lista `orphan-recovery.service.ts`
entre os call-sites que derivam de `EXECUTION_PHASE`, mas o serviço ainda usa
o literal `status: 'running'` no `where` (`orphan-recovery.service.ts:46`).

---

## Ordem sugerida

Critério: custo baixo e risco alto primeiro; decisão de produto por último.

| #   | Itens              | Por quê                                                                                     |
| --- | ------------------ | ------------------------------------------------------------------------------------------- |
| 1   | P1.1, P1.2, P1.3   | Configuração de produção, não código. Resolve o buraco de notificação e a cegueira a erros. |
| 2   | P2.1, P2.2         | Trivial, e devolve visibilidade ao sweeper de aprovações.                                   |
| 3   | P6.11, P6.10, P3.4 | Correções de registro. Baratas e evitam que alguém confie em doc errada.                    |
| 4   | P5.1, P5.3, P5.4   | Índice e `select`. Barato agora, caro depois.                                               |
| 5   | P4.5, P4.10, P4.3  | Bugs pequenos e isolados, sem decisão de produto envolvida.                                 |
| 6   | P6.1               | Habilita testar tudo que vier depois. Investimento, não correção.                           |
| 7   | P4.1, P4.2         | Durabilidade dos agendamentos. Média complexidade.                                          |
| 8   | P4.7, P4.6         | Exige decidir qual é a fonte de verdade do custo antes de codificar.                        |
| 9   | P3.1, P3.2, P3.3   | RBAC, convite e auditoria andam juntos e merecem spec própria.                              |
| 10  | P4.4, P3.5, P4.9   | Decisão de produto pesada antes do código.                                                  |

Os itens de documentação (P6.2, P6.3, P6.5 a P6.9) não entram na ordem porque
não competem por tempo com os demais — vão sendo fechados junto das entregas
que os tocam, que é como a convenção deste repositório funciona.

---

## Fora de escopo (deliberado)

- **Este documento não prioriza.** A ordem sugerida acima é uma proposta com
  critério declarado, não uma decisão. A priorização é do usuário.
- **Não estimo prazo.** As marcações de esforço são grosseiras (pequeno, médio,
  grande) e servem só para separar o que é configuração do que é projeto.
- **Não cobre os seis temas do H3** listados em
  [`base-evolucao.md`](base-evolucao.md) §5 — sub-workflows, OAuth, RAG
  híbrido, MCP compartilhado. Há sobreposição parcial (RBAC, Swagger), mas
  aquilo é roadmap de produto e isto é dívida encontrada. São listas
  diferentes, com origens diferentes.
- **Não propõe solução detalhada.** Cada item diz o que está errado e onde. O
  como é trabalho da spec de quem for implementar.
- **Não inclui o que já foi corrigido** em 2026-08-03 (`8ee1db6`, `3baef5e`,
  `e2f0dd0`), nem o que foi corrigido durante a construção da camada de
  sistema.
