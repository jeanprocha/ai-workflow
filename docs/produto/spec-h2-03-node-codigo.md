# SPEC H2-03 — Node de código (JS)

Data: 2026-07-30. Origem: item 3 da ordem do H2 ([`discovery-h2.md`](discovery-h2.md)
§3 — reordenada em 2026-07-30, WhatsApp foi para o fim). Objetivo: a "válvula
de escape universal" que toda concorrente tem — rodar JavaScript do usuário
dentro do fluxo, para transformações que as expressões `{{ }}` não alcançam
(elas não têm operadores, funções nem aritmética, por design —
`packages/nodes/src/expressions.ts`).

**Status: implementado em 2026-07-30**, em 4 commits (C1-C4 abaixo), com specs
unitários novos em `packages/nodes` e `apps/api`, e e2e de isolamento real
(worker de verdade, não mockado). Cinco divergências confirmadas na
implementação em relação a este spec original, sinalizadas inline: (1) `env`
do worker é **allowlist**, não `{}` vazio — env vazio quebraria os nodes de
IA em produção; (2) **não** injetar `JSON`/`Math`/`Date` no contexto vm —
são nativos do contexto e injetar a referência do host adiciona gadget de
escape; (3) o campo `code` precisa de **skip explícito** na resolução de
expressões da engine (não documentado a fundo no spec original); (4)
`packages/nodes` precisou de `moduleNameMapper` novo no jest; (5) as
mensagens de erro do node **não** passam por `pt-to-en.ts` — esse mecanismo
só traduz exceções HTTP, não erros de execução de node (nenhum outro node
tem suas mensagens lá, incluindo o timeout do próprio sandbox).

---

## A tese corrigida pelo discovery

O doc de produto dizia "o sandbox que já existe resolve o isolamento". O
discovery **refutou**: o próprio ADR-005 admite que worker_thread não é
sandbox de segurança contra código malicioso
(`docs/adr/005-isolamento-execucao-nodes.md:43-46`). Três bloqueantes
confirmados no código:

1. **`process.env` completo no worker** — o construtor do Worker não passava
   `env:` (`node-sandbox-runner.ts:60-69`), então código no worker lia
   `SECRETS_ENCRYPTION_KEY` (`crypto.service.ts:21`) e `DATABASE_URL`: com os
   dois, decifra-se as credenciais de **todos** os workspaces. **Corrigido**
   com allowlist (não `env: {}` — `@workflow/ai` lê `REDIS_URL`,
   `OLLAMA_BASE_URL` e `AI_RATE_LIMIT_<PROVIDER>_RPM` **dentro** do worker em
   toda execução de node de IA; env vazio quebraria isso só em produção).
2. **Loader completo** — `require('fs' | 'child_process' | 'net')` livre.
   Nenhum isolate (`isolated-vm`/`vm2`/SES) no repo.
3. **Rede irrestrita** — `fetch` global sem proteção anti-SSRF (metadata
   endpoints e a rede privada do Railway alcançáveis).

O que o sandbox atual **entrega de verdade** (e o node de código herda):
timeout duro por `worker.terminate()` (`node-sandbox-runner.ts:82-89`),
limite de heap V8 (`resourceLimits`, `:62-68`), RPC com tenant fixado no
host (o `workspaceId` nunca cruza para o worker), `ctx.log` estruturado com
UI ao vivo, retry e error branch genérico de graça.

## Decisões (e alternativas rejeitadas)

1. **Contrato: objeto único, não "items".** O código recebe `$input` (output
   do node anterior) e `$vars` (cópia mutável), e o valor retornado vira o
   `output` do node. *Rejeitado*: o modelo "items" do n8n (map por elemento)
   — não existe convenção de items no repo; cada node tem shape próprio, e a
   engine roteia o `output` cru (`engine.service.ts:278`).
2. **v1 SEM rede.** O contexto do código **não expõe `fetch`**. Requisição
   HTTP é papel do node `api.httpRequest` (com credencial, HMAC e timeout
   próprios); o node de código é transformação pura. Isso **elimina a classe
   SSRF inteira do v1** — o wrapper anti-SSRF (resolução de DNS + bloqueio
   de IP privado/link-local + revalidação por redirect) fica especificado
   como fase 2, se houver demanda. *Rejeitado para o v1*: expor fetch com
   wrapper — custo e superfície de ataque desproporcionais para a primeira
   entrega.
3. **Isolamento por `node:vm` com globals em lista branca**, rodando DENTRO
   do worker_thread (defesa em profundidade: vm sem `require`/`process` +
   worker sem env + terminate + heap limit). *Rejeitado para o v1*:
   `isolated-vm` (dependência nativa, complica o build/deploy Railway) e o
   permission model do Node (é por processo, não por worker — restringiria a
   API inteira). **Risco residual documentado**: `node:vm` não é fronteira
   perfeita (escapes por prototype chain são conhecidos); as camadas
   externas (env vazio, worker, timeouts) limitam o dano, e `isolated-vm`
   fica registrado como caminho de upgrade se o produto atrair abuso.
4. **`env: {}` no Worker vale para TODOS os nodes**, não só o de código — é
   a correção do bloqueante nº 1 e beneficia a plataforma inteira. Exige
   auditoria de `process.env` em `packages/nodes` antes (nenhum node deve
   ler env dentro do worker; tudo privilegiado passa por RPC).
5. **Categoria `logic`, type `logic.code`.** Evita mexer na union fechada de
   `NodeCategory` (`packages/shared/src/graph.ts:1-8`, espelhada em
   `graph.schema.ts` e nos dicionários).
6. **UI v1 = Textarea `font-mono` dedicada** (padrão do body do HTTP,
   `config-panel.tsx:242-250`, com `spellCheck={false}` e rows ~14).
   *Adiado*: CodeMirror 6 (highlight/gutter/autocomplete de `$input`/`$vars`
   — ~200KB de dependência nova; refinamento quando o node provar uso).
7. **Sem branches dinâmicos no v1** (`outputs: ["default"]`). Falha do
   código roteia pelo error branch genérico (`onError:'branch'`), que já
   existe. Emissão de `branches` pelo código fica para depois, junto com o
   caso de uso real.

## Contrato do node

```
type: "logic.code"   categoria: logic   outputs: ["default"]
config:
  code: string       (min 1, max 50_000 chars)
  timeoutMs: number  (int, 100..30_000, default 5_000)
```

O código roda como corpo de função async:
`(async ($input, $vars, console) => { ...código do usuário... })()` — pode
usar `await` (embora sem rede no v1, `await` serve para APIs síncronas
promisificadas e legibilidade) e `return` em qualquer ponto.

**Globals disponíveis:** `$input`, `$vars` (cópia mutável), `console` (shim),
`URL`, `URLSearchParams`, `TextEncoder`, `TextDecoder`, `atob`/`btoa`,
`structuredClone` — injetados no contexto vm (Node-only, sem equivalente
nativo). **`JSON`/`Math`/`Date` não são injetados** (divergência do desenho
original): já existem nativos em qualquer contexto `node:vm` novo, com o
prototype **desse** contexto; injetar a referência do host adicionaria um
gadget de escape (`fn.constructor` alcançaria o `Function` do realm do
host). **Indisponíveis por design**: `require`, `import` dinâmico, `process`,
`fetch`, `setTimeout`/`setInterval`, `Worker`, `Buffer`, `eval`,
`new Function(...)` (os dois últimos bloqueados por
`codeGeneration.strings: false` — a barreira real do isolamento, testada
explicitamente).

**Saída**: o valor retornado passa por roundtrip `JSON` (sanitização — nada
de funções/símbolos/classes atravessando o `postMessage`) com **cap de 1MB**;
acima disso, falha com mensagem clara. `undefined` vira `null`.

**`$vars`**: o código muta a cópia à vontade; ao final, o node deriva o
`varsPatch` por diff raso (chaves alteradas/adicionadas) — a engine já
mescla patches (`engine.service.ts:280`), zero mudança no contrato.

**`console`**: shim que encaminha `log/warn/error` para
`ctx.log('code.console', ...)` (fire-and-forget, padrão de
`node-worker-entry.ts:68-71`), com **cap de 100 linhas e 16KB totais** —
cada log é um INSERT + evento SSE (`engine.service.ts:819-827`); estourou o
cap, entra uma última linha "console truncado" e o resto é descartado. A UI
de execução já renderiza sem mudança.

**Timeout em duas camadas**: `vm` com `timeout: config.timeoutMs` mata loop
síncrono infinito **sem derrubar o worker**; o `sandboxTimeoutFor()` da
engine (criado na correção B do H2-01, `engine.service.ts`) ganha o branch
de `logic.code` — timeout do runner = `clamp(timeoutMs) + margem`, o
backstop duro por `terminate()` para código async que escapa do vm timeout.

## Fases de implementação (commits) — o que foi feito

**C1 — env allowlist no worker do sandbox**
- `apps/api/src/engine/sandbox/node-sandbox-runner.ts`: `sandboxEnv()` monta
  o `env` do Worker a partir de uma allowlist fixa (`REDIS_URL`,
  `OLLAMA_BASE_URL`, `NODE_ENV`, `TZ`, `NODE_EXTRA_CA_CERTS`,
  `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY`) + prefixo dinâmico
  `AI_RATE_LIMIT_` (chave por provider). Auditoria confirmou zero
  `process.env` em `packages/nodes/src/` — toda a leitura de env dentro do
  worker vem de `@workflow/ai` (rate limiter + provider Ollama).
- `node-sandbox-runner.spec.ts`: assert **exato** (não `toMatchObject`) — com
  `SECRETS_ENCRYPTION_KEY`/`DATABASE_URL` setados no teste, prova que **não**
  vazam para `worker.opts.env`, e que uma `AI_RATE_LIMIT_OPENAI_RPM` chega.
- ADR-005 atualizado com as camadas de isolamento (env allowlist → worker →
  vm `strings:false` → sem rede) e o porquê de cada uma.

**C2 — node `logic.code` + integração com a engine**
- `packages/nodes/src/definitions/code.meta.ts` (browser-safe) + `code.ts`
  (server-only, `node:vm`) — split no padrão `http-request.meta.ts`/`.ts`.
- `execute()`: console shim com caps (100 linhas/16KB) → `ctx.log`; contexto
  vm com `codeGeneration:{strings:false, wasm:false}` (a barreira real);
  wrapper `(async ($input,$vars,console) => {...})(...)`;
  `script.runInContext(ctx, {timeout})` pega loop síncrono; serialização
  com roundtrip JSON + cap 1MB; `varsPatch` por diff raso contra `ctx.vars`
  intacto (deleção de chave não propaga — documentado no código e na hint).
- Registrado em `registry.ts` (grupo logic) e `catalog.ts` (só o `.meta`).
- Engine (`engine.service.ts`): `sandboxTimeoutFor` ganhou o branch
  `logic.code` (`clamp(timeoutMs, 100, 30_000) + NODE_TIMEOUT_MS`, fallback
  5000 se ausente/inválido); e um **skip de expressões** novo no call site
  de `resolveExpressions` — o campo `code` é destacado do config, resolvido
  à parte o resto (`timeoutMs` continua aceitando `{{ }}`), e reanexado cru
  no resultado, sem nunca mutar `node.config` original.
- `packages/nodes/package.json`: `moduleNameMapper` novo no jest (nenhum spec
  do pacote tinha import relativo com sufixo `.js` antes deste).
- Testes: 14 casos novos em `code.spec.ts` (happy path, `$vars` diff,
  circular/BigInt, output >1MB, sonda de globals, **escape bloqueado**
  `eval`/`new Function` lançam, timeout do vm, `await`, caps de console,
  `JSON`/`Math` nativos) + 5 em `engine.service.spec.ts` (timeout branch +
  skip de expressões, provando que `code` chega intacto no sandbox).

**C3 — UI, i18n, ícone**
- `node-icons.tsx`: `Code` e `Braces` adicionados ao mapa (o segundo também
  conserta `json-parse`/`graphql-request`, que caíam no fallback `Box`).
- `config-panel.tsx`: `CodeFields` (Textarea mono `rows=14` `spellCheck=false`
  + campo `timeoutMs`), despachada na cadeia de `logic.*`; **não** entra em
  `JSON_FALLBACK_TYPES`.
- i18n em `editor.ts` (bloco `code`, pt/en) e `node-catalog.ts` (description).
- `workflow-node.tsx`: subtítulo do card mostra `${timeoutMs}ms`.
- **Divergência**: `pt-to-en.ts` **não** foi tocado — confirmado que erros de
  execução de node nunca passam pelo `AllExceptionsFilter` (só exceções HTTP
  de controller/service); nenhum outro node tem suas mensagens ali.

**C4 — e2e de isolamento real + docs**
- Helper `codeGraph({code, timeoutMs})` em `apps/e2e/helpers/workflows.ts`
  (`trigger.manual → logic.code → logic.log`, o log interpola `$vars` pra
  provar o merge).
- `apps/e2e/tests/logic/code-node.spec.ts` (3 testes, worker real):
  1. `@smoke` feliz — `$input` transformado, `varsPatch` mesclado e visível
     no log seguinte, e o **primeiro assert do repo em `logs[]`**
     (`console.log` do usuário virou `ExecutionLog{event:"code.console"}`).
  2. `while(true){}` com `timeoutMs:1000` → `failed` com a mensagem do vm;
     `GET /health/live` 200 logo depois (terminate não derrubou a API).
  3. Sonda de vazamento: `typeof process/require/fetch` → `"undefined"`.
- Regressão: 25/25 e2e de `tests/logic/` + `tests/http-node/` (nodes que
  rodam no worker, incluindo HMAC/credencial via RPC) confirmam que o env
  allowlist do C1 não quebrou nada.

## Critérios de aceite — todos verificados

- ✅ Fluxo `trigger.manual → logic.code → logic.log` roda com código que
  transforma `$input` e escreve `$vars`; o log seguinte enxerga os dois.
- ✅ `while(true){}` falha no timeout configurado, com mensagem clara, sem
  derrubar worker nem API (health 200 confirmado logo depois).
- ✅ Dentro do código: `process`, `require` e `fetch` são `undefined` (sonda
  e2e); `eval`/`new Function` lançam (unit test, prova do `strings:false`).
- ✅ `console.log` vira `ExecutionLog` (primeiro assert do repo em `logs[]`),
  com truncamento acima do cap (unit test).
- ✅ Retorno não serializável ou > 1MB falha com mensagem específica.
- ✅ Regressão: 78/78 unit do api, 42/42 unit de packages/nodes, 25/25 e2e de
  `tests/logic/` + `tests/http-node/` (nodes que rodam no worker) verdes
  após o env allowlist.

**Não verificado nesta sessão**: renderização da paleta/painel num browser
real — sem acesso a Chrome interativo neste ambiente. A cobertura de UI veio
do teste e2e (Playwright, browser real) e do typecheck/lint do web, ambos
limpos; falta o usuário confirmar visualmente o node "Código" na paleta após
reiniciar `pnpm --filter @workflow/web dev` (o dev server não recompila
`packages/nodes/dist` sozinho).

## Fora de escopo (deliberado)

- **`fetch`/rede no código** → fase 2, com wrapper anti-SSRF especificado
  (DNS + bloqueio de IP privado/link-local/metadata + revalidação por hop de
  redirect). Nota: o SSRF pré-existente do `api.httpRequest` fica como está
  — bloquear IP privado lá quebraria uso legítimo de rede interna (ex.: ERP
  na LAN/rede privada Railway); risco registrado no discovery.
- **Bibliotecas** (lodash/dayjs injetados) → por demanda.
- **`isolated-vm`** → upgrade path documentado no ADR, não v1.
- **Semáforo global de worker_threads** (teto de threads simultâneas da
  engine) → preocupação pré-existente de toda a engine, não específica deste
  node; registrada no discovery §3.
- **Branches dinâmicos e modelo "items"** → quando houver caso de uso.
- **CodeMirror** → refinamento de UI após o node provar uso.
