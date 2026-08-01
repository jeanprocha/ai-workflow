# SPEC H2-05 — Continue-on-error / Error workflow

Data: 2026-07-31. Origem: item 5 da ordem do H2
([`discovery-h2.md`](discovery-h2.md) §2 e §5 do plano de execução). Objetivo:
completar o error handling configurável — o error branch (`onError:'branch'`)
e o retry já tinham sido entregues no H2-01. Faltavam duas metades: "não
parar o fluxo por causa de um node que falhou" sem precisar desenhar uma edge
dedicada, e "avisar/reagir automaticamente quando um fluxo falha" com outro
fluxo, não só um e-mail/webhook de alerta.

**Status: implementado (2026-07-31).**

---

## O que já existia (H2-01) e o que faltava

- **Error branch** (`onError:'branch'` + edge `sourceHandle:'error'`) e
  **retry com backoff** já estavam prontos ponta a ponta, com testes.
- **Continue-on-error**: zero código — `onError` era união fechada
  `'fail'|'branch'`, a UI era um checkbox binário.
- **Error workflow**: nenhum ponto de extensão, mas os materiais já
  existiam — `TriggerType.event` ocioso no enum desde sempre, e o payload
  certo já estava montado para o alerting por e-mail/webhook
  (`FailureAlertParams`).
- **Bug real encontrado no caminho** (corrigido junto, decisão do usuário):
  `logic.merge` alimentado por uma edge de erro ou por um branch de
  if/switch que só dispara um lado entrava em **deadlock silencioso** —
  `incomingCount` conta todas as edges estaticamente, o buffer nunca
  enchia, a onda seguinte vinha vazia, o loop terminava, e a execução
  gravava `success` **incompleta**, com o merge e tudo depois dele nunca
  executados. Nenhuma validação server-side impedia essa topologia.

## Decisões (e justificativa)

| Decisão | Escolha | Por quê |
|---|---|---|
| Payload do `continue` | Mesmo `{ error: string }` do `branch` | Um único dialeto de erro downstream — quem lê `{{ $input.error }}` não precisa saber qual dos dois modos gerou aquele node. |
| Roteamento do `continue` | Só edges **sem** `sourceHandle` (como um sucesso com `branches: []`) | Um If/Switch que falhou com `continue` não tem branches pra decidir — não rotear nada é determinístico; não rotear é melhor que adivinhar. |
| `continue` × retry | Retry esgota primeiro | A classificação de falha roda depois de `executeNodeWithRetry` retornar — grátis, sem código extra. |
| Merge deadlock | **Flush parcial**: quando a onda esvazia com um `logic.merge` que recebeu ≥1 entrada (de `incomingCount` esperadas), executa com o que chegou + `logger.warn` | Reflete o que o usuário já vê no grafo (um caminho que nunca ia disparar) em vez de mascarar como sucesso silencioso. Resolve iterativamente: merges encadeados flusham um após o outro conforme a onda esvazia de novo. |
| Edge de erro órfã | **Rejeitada no save** (`graph.schema.ts`), com issue clara apontando a edge | `sourceHandle:'error'` sem `onError:'branch'` no node de origem nunca dispara na engine — vira dead code silencioso. Herdado de graça por templates, copilot e autocomplete. `rollback()` não passa pelo schema — versões antigas continuam restauráveis mesmo se tivessem esse estado. |
| Modelo do error workflow | **Ponteiro por fluxo** — `Workflow.errorWorkflowId` | Padrão n8n: cada fluxo aponta explicitamente seu tratador. Sem varredura de grafos JSON a cada falha, sem ambiguidade quando há mais de um tratador candidato no workspace. |
| Status da execução com falha tratada | Continua **success**; UI **deriva** o badge "tratada" | Terceiro `ExecutionStatus` persistido tocaria o waiter do H2-04, filtros, contrato da API pública — invasivo demais pra um dado que já é derivável (step failed dentro de execução success). |
| FK `errorWorkflowId` | Self-relation, `onDelete: SetNull` | Apagar o fluxo tratador não pode bloquear nem derrubar o fluxo de origem — degrada para "sem error workflow". |
| Gate de status do tratador | `archived` não dispara; `draft` e `active` disparam | Espelha `triggerByWebhook` — archived é o "desligado"; draft dispara pra permitir testar o tratador antes de ativar. |
| Quais falhas disparam o tratador | Todo `triggerType` **exceto `event`** | `event` é, por definição, uma execução que É um tratamento de erro — nunca redispara. Isso limita a cadeia a profundidade 1 **por construção**, mesmo que dois fluxos apontem um pro outro (A→B→A configurado nunca vira loop). |
| Validação no PATCH | `errorWorkflowId` precisa existir no mesmo workspace e ser `!== id` do próprio fluxo | Não exige o node `trigger.error` no grafo do tratador — qualquer trigger funciona (a engine pega o primeiro node `category:'trigger'`), e exigir criaria atrito num tratador recém-criado sem grafo ainda. |
| Dispatch | `ErrorWorkflowService` novo, sem o throttle do `AlertsService` | Falha disparar o tratador não é a mesma coisa que notificar um humano por e-mail — um não deve limitar o outro. |
| AI Debugger em execução success com step tratado | **Não liberado** neste v1 | Falha tratada é comportamento desenhado, não bug — ficou como follow-up caso apareça demanda real. |

## O node `trigger.error` e o payload

Passthrough puro (como os outros triggers), `category:'trigger'`. O input
que ele recebe — montado por `ErrorWorkflowService.dispatchForFailedExecution`
— é sempre:

```json
{
  "workflowId": "...",
  "workflowName": "...",
  "executionId": "...",
  "error": "...",
  "failedNodeId": "n2",
  "triggerType": "manual",
  "timestamp": "2026-07-31T..."
}
```

`failedNodeId` é `null` quando a falha não aponta pra um node específico
(ex.: trigger ausente no grafo). O disparo acontece nos **3 pontos** onde
uma execução pode fechar como `failed`: o caminho normal da engine, a rede
de segurança do processor (H2-04, quando `engine.run()` lança antes de
gravar o status final) e a varredura de órfãs no boot do worker.

## Fases de implementação (commits)

**C1 — `onError:'continue'` ponta a ponta** (feito): tipo compartilhado +
zod + novo ramo na classificação da onda (`continuedFailures`, roteamento
só por edges sem handle) + `ErrorPathSection` virou radio de 3 estados
(Parar o fluxo / Caminho de erro / Continuar com o erro) + fix da limpeza
de edge no cliente (`onError !== "branch"`, não `!onError` — com
`'continue'` sendo truthy) + i18n pt/en. Unit tests: falha vira `{error}` e
segue por edges normais; edge com handle não dispara; retry esgota antes;
trigger com `continue` mantém fail-fast; sem edge de saída não quebra.

**C2 — endurecimento** (feito): constante `ERROR_HANDLE` compartilhada
substituindo a string mágica `'error'` em produção (engine, editor,
`workflow-node.tsx`); flush parcial do `logic.merge` quando a onda esvazia
com buffer incompleto; validação server-side de edge de erro órfã no
`superRefine`. Descoberta no processo: `packages/shared` nunca tinha sido
buildado pra Node em runtime (só consumido via tipos, erasable, ou pelo
bundler do Next.js) — ganhou `tsconfig.build.json` + `dist/` + script
`build`, mesmo padrão de `@workflow/nodes`/`@workflow/ai`, porque agora a
API precisa de um valor real (`ERROR_HANDLE`) em tempo de execução. Unit
tests novos: `graph.schema.spec.ts` (não existia); flush de merge simples e
encadeado.

**C3 — error workflow** (feito): migration `workflow_error_workflow`
(`Workflow.errorWorkflowId`, self-relation, `onDelete: SetNull`); node
`trigger.error`; `ExecutionsService.triggerErrorWorkflow` (`triggerType:
'event'`); `ErrorWorkflowService` novo com a guarda anti-recursão e os 3
call-sites; validação no PATCH (`update-workflow.dto.ts` +
`workflows.service.ts`). Unit tests: dispatch com payload/trace corretos;
skip em cada motivo de recusa (event, self, tratador arquivado/sem
versão/inexistente); erro interno não propaga; sem throttle.

**C4 — UI + e2e + docs** (feito): dialog "Configurações do fluxo" no
toolbar do editor (select do error workflow, molde do Histórico de
versões); badge `"handled"` derivado em `packages/ui` + banner no detalhe
da execução; mensagem "Disparado pelo tratamento de erro de" para
execuções `triggerType:'event'` no lugar do texto de replay. E2E:
continue-on-error (feliz + fan-out), merge parcial, error workflow (feliz
com payload/traceId, anti-recursão com ciclo A→B→A configurado de
propósito, 400 de auto-referência, 404 de tratador inexistente, limpar com
`null`), edge órfã rejeitada no save, e os 3 testes de UI do caminho de
erro ajustados pro radio (checkbox → 3 opções quebra `.uncheck()`, que só
funciona em checkbox).

## Critérios de aceite

Todos verificados (unit + e2e + smoke manual via curl contra o dev real):

- Node com `onError:'continue'` que falha: execução termina `success`, o
  node seguinte (edge sem handle) recebe `{ error }`, uma edge com handle
  no mesmo node nunca dispara. ✅
- `logic.merge` alimentado por um `If` que só roteia um lado: o merge (e o
  que vem depois) executa com o array parcial, com aviso no log — não trava
  mais a execução em `success` incompleta. ✅
- Edge `sourceHandle:'error'` sem `onError:'branch'` no node de origem:
  rejeitada no save com issue clara. ✅
- Fluxo A com `errorWorkflowId` apontando pro fluxo B: A falha → B dispara
  com `triggerType:'event'`, `parentExecutionId` = execução de A, mesmo
  `traceId`, payload com `workflowId/workflowName/executionId/error/
  failedNodeId/timestamp`. ✅
- Ciclo configurado de propósito (A aponta pra B, B aponta pra A) — se B
  também falhar, **não** dispara A de novo (guarda por `triggerType`). ✅
- PATCH `errorWorkflowId` pra si mesmo → 400; pra fluxo inexistente/de
  outro workspace → 404; `null` limpa sem validar. ✅
- Falha tratada (`branch` ou `continue`) não aparece mais como "Falhou" sem
  contexto — badge "Falha tratada" + banner no detalhe da execução. ✅

## Fora de escopo (deliberado)

- **Fallback declarativo entre providers de IA** — gap descrito à parte em
  `base-evolucao.md`, não é sobre error handling de fluxo.
- **AI Debugger em execução success com falha tratada** — o step tratado
  continua diagnosticável só quando a execução inteira é `failed`; liberar
  pra `success` é follow-up caso vire pedido real.
- **Rate limit / circuit breaker no error workflow** — se o tratador também
  falhar toda vez (ex.: bug no próprio tratador), cada falha da origem
  dispara uma tentativa nova. A guarda de recursão impede loop, mas não
  impede repetição — throttle fica para quando houver sinal de necessidade.
- **Multi-nível de tratamento** (B falha → dispara C) — decisão deliberada:
  profundidade máxima 1, mesmo fluxo repetido em cadeia.
