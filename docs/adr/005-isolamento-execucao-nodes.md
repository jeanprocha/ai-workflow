# ADR-005: Isolamento de execução de nodes

Status: Aceito
Data: 2026-07-23

## Contexto

Cada node executa código (chamadas HTTP, IA, banco, transformação de arquivos) dentro do processo que consome a fila de execuções. Um node lento, travado ou malicioso não pode derrubar outras execuções.

## Decisão

- **v1 (Fase 3–9):** execução in-process no worker da API, com **timeout obrigatório por node** e captura de exceção por step — suficiente enquanto a engine roda em processo único e a confiança no código dos nodes é alta (nodes nativos, mantidos pelo time).
- **v3 (Fase 10):** workers dedicados por tipo de node (ou pelo menos por categoria de risco: nodes que executam código arbitrário vs. nodes de integração simples), com limite de memória e sandbox mais estrito.

## Alternativas consideradas

- **Sandbox completo desde o v1 (VM isolada / container por execução)**: mais seguro, mas adiciona latência e complexidade operacional incompatível com o ritmo do MVP.
- **Sem timeout/isolamento algum**: inaceitável — um único HTTP Request pendurado travaria a fila inteira.

## Consequências

- Timeout por node é obrigatório desde a Fase 3, não uma otimização futura.
- A revisão de segurança antes de nodes de terceiros no Marketplace (Fase 9) depende do isolamento mais forte da Fase 10 estar pronto — nodes de comunidade só devem rodar em sandbox reforçado.

## Atualização (Fase 10, ver ADR-008): v3 implementado

`NodeSandboxRunner` (`apps/api/src/engine/sandbox/`) roda cada execução de
node num `worker_thread` do Node (não um worker por *tipo* de node — todos os
tipos passam pelo mesmo sandbox genérico, decisão explícita do usuário para
manter o escopo simples):

- **Timeout duro**: `worker.terminate()` ao estourar `NODE_SANDBOX_TIMEOUT_MS`
  (default 30s), não uma race de Promise — o node é de fato interrompido,
  mesmo que esteja em loop síncrono. Validado ao vivo: um node com delay de
  10s sob timeout de 2s falhou em ~2.9s, não em 10s.
- **Limite de memória**: `resourceLimits.maxOldGenerationSizeMb` (default 256,
  env `NODE_SANDBOX_MEMORY_MB`) — estourar o limite mata a thread (`exit`
  não-zero), tratado como falha do node, não crash do worker.
- Callbacks de contexto (`getCredential`, `callAgent`, `searchKnowledge`,
  `callMcpTool`, `log`) cruzam a fronteira da thread por RPC via
  `postMessage`, já que só o processo principal tem acesso a
  Prisma/criptografia/outros services.
- Isolamento mais forte (VM isolada / processo por execução) fica para se/quando
  houver nodes de terceiros (Marketplace, ainda não implementado) — worker_thread
  isola travamento e estouro de memória, mas não é uma sandbox de segurança
  contra código intencionalmente malicioso.

## Atualização (H2-03): env allowlist + `node:vm` no node `logic.code`

O node `logic.code` (`packages/nodes/src/definitions/code.ts`) roda JavaScript
do **usuário** dentro do mesmo `worker_thread` do sandbox genérico — a
diferença de confiança em relação aos demais nodes (mantidos pelo time) exigiu
duas camadas novas, nenhuma delas opcional:

1. **Env allowlist no `Worker`** (`node-sandbox-runner.ts`): antes desta
   atualização, `new Worker(...)` herdava `process.env` inteiro (comportamento
   default do Node) — qualquer node, e em especial `logic.code`, conseguia ler
   `SECRETS_ENCRYPTION_KEY` e `DATABASE_URL` e decifrar credenciais de
   **qualquer** workspace direto no Postgres, sem passar pelo RPC. A correção
   é allowlist explícita (`ENV_ALLOWLIST` + prefixo dinâmico
   `AI_RATE_LIMIT_`), não `env: {}` vazio: `@workflow/ai` lê `REDIS_URL` e
   `OLLAMA_BASE_URL` **dentro** do worker em toda execução de node de IA, e
   env vazio quebraria isso só em produção (localmente os defaults
   `localhost` mascaram o problema). A lista também passa `TZ`,
   `NODE_EXTRA_CA_CERTS`, `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` — env de
   runtime que TLS custom/proxy corporativo dependem, e que também só
   quebraria em produção se faltasse.
2. **`node:vm` com `codeGeneration: { strings: false, wasm: false }`**
   (`code.ts`): um contexto `vm` novo — em qualquer configuração — expõe
   objetos cujo `.constructor.constructor` alcança o `Function` do **realm do
   host**; sem essa opção, `this.constructor.constructor("return process")()`
   ou `eval(...)` escapam do sandbox e leem o mesmo `process.env` (agora
   filtrado, mas ainda um escape). `strings: false` é a barreira real contra
   esse gadget — bloqueia `eval`, `new Function(...)` e strings passadas a
   `Script`/`vm.compileFunction` dentro do contexto. **Load-bearing**: não é
   redundante com o env allowlist, é a camada que impede o código de sair do
   `vm` e alcançar o resto do worker (RPC handlers, módulos já carregados).
   Testado explicitamente em `code.spec.ts` (o escape deve lançar, não
   silenciosamente retornar `process`).

Isolamento resultante, em camadas (de fora para dentro): **env allowlist**
(o worker não tem segredo pra vazar mesmo se escapar) → **worker_thread**
(timeout duro + heap limit, ADR original) → **`node:vm` com
`strings:false`** (o código não sai do contexto) → sem rede no v1 (sem
`fetch` exposto — elimina a classe SSRF).

**Continua valendo o aviso original**: isto não é `isolated-vm` nem sandbox
hermética — é defesa em profundidade. Upgrade path se o produto atrair abuso
de verdade (nodes de terceiros, Marketplace): trocar `node:vm` por
`isolated-vm` (V8 isolate real, sem o gadget de `.constructor` do realm
compartilhado), ao custo de uma dependência nativa no build/deploy.
