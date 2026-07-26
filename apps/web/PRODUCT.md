# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Desenvolvedores e times técnicos que precisam construir automações que combinam
IA, agentes e integrações com APIs — hoje o público primário confirmado.
`spec.md` também lista startups, empresas, equipes de suporte/comerciais,
criadores de conteúdo e analistas como público mais amplo de longo prazo, mas
sem um usuário primário validado além do técnico.

## Product Purpose

Workflow AI é uma plataforma de automação "AI First": a IA não é só mais um
node do fluxo, e sim responsável por entender, decidir, executar e colaborar
durante toda a automação. Permite construir automações complexas sem código,
criar agentes inteligentes reutilizáveis, integrar múltiplos providers de IA
(OpenAI, Gemini, Claude, Ollama local) e suportar MCP (Model Context
Protocol), com execução distribuída e observabilidade completa.

## Positioning

Não compete diretamente com n8n, Zapier ou Make. O diferencial é ter sido
construída pensando em IA desde o início: agentes reutilizáveis em qualquer
workflow, geração automática de fluxos por linguagem natural (Autocomplete),
copiloto que conversa sobre o fluxo aberto, IA que diagnostica execuções
falhas (AI Debugger) e sugere otimização de custo/modelo (Cost Optimizer),
integração nativa com MCP, versionamento e replay de execuções.

## Operating Context

- Editor visual (canvas React Flow) com paleta de nodes por categoria:
  Triggers, Logic, Database, APIs, Files, AI, Communication.
- Dashboard com métricas agregadas; Analytics com timeseries e custo por
  provider de IA.
- Execuções: lista com filtros, detalhe/timeline, replay total e parcial,
  status ao vivo via SSE.
- Agentes: CRUD, ferramentas (tools nativas + MCP), memória, base de
  conhecimento, chat de teste.
- MCP: conectar servidores externos, listar/chamar tools.
- Knowledge: upload de documento, ingestão (processada por worker), busca
  semântica.
- Scheduler: agendamento cron de fluxo (node trigger.cron), preview de
  próximas execuções.
- Busca global (Ctrl+K) por fluxos, nodes, execuções, templates e agentes.
- Multi-workspace (multi-tenant) com papéis; credenciais e variáveis
  (incluindo secrets) por workspace.
- i18n: pt-BR é o idioma padrão, inglês disponível.
- Execução distribuída via fila (BullMQ) com processos de worker separados
  da API.

## Capabilities and Constraints

- Stack confirmada: Next.js/React/TypeScript/TailwindCSS/React Flow/
  shadcn-ui/Framer Motion/React Query no frontend; NestJS na API; Postgres;
  Redis; BullMQ para filas.
- Providers de IA suportados: OpenAI, Anthropic (Claude), Gemini, Ollama
  (local, custo zero). Anthropic tem particularidades de API por modelo
  (ex.: `claude-sonnet-5` rejeita customizar `temperature`) que a integração
  precisa tratar com degradação graciosa, não erro pro usuário.

## Brand Commitments

(nenhum confirmado — nome/voz/identidade ainda não têm compromissos travados
além do nome de trabalho "Workflow AI Platform")

## Evidence on Hand

Nenhuma. Este é um projeto solo/de estudo, sem base de usuários real, cliente
específico ou dados de produção ainda. Trabalho futuro não deve fabricar
depoimentos, clientes, estudos de caso, benchmarks ou métricas de uso reais —
qualquer exemplo desse tipo em telas (dashboard, analytics, templates) é
ilustrativo/seed, não evidência real.

## Product Principles

- IA é participante de primeira classe em toda automação, não apenas mais um
  bloco — decisões de produto devem reforçar isso, não tratar IA como feature
  acoplada.
- Profundidade técnica que um público de desenvolvedores respeita:
  observabilidade completa, versionamento, replay, execução distribuída —
  não só um canvas bonito.
- Reduzir a necessidade de costurar ferramentas separadas de IA e automação,
  integrando nativamente MCP, múltiplos providers de LLM e agentes
  reutilizáveis.
- A interface deve transmitir sensação de produto comercial pronto pra
  produção, inspirado em Linear/Vercel/OpenAI — prova de domínio em UX e
  arquitetura de produto SaaS complexo, não só de backend.

## Accessibility & Inclusion

Nenhum padrão formal (ex.: WCAG nível específico) foi exigido pelo produto
até agora, mas a11y tem sido tratada como barra de qualidade real durante o
desenvolvimento: labels/aria-labels acessíveis, roles corretos, navegação por
teclado e nomes acessíveis traduzidos (pt/en) foram validados e corrigidos
como bugs reais em várias features (busca global, dashboard, editor,
scheduler) durante a campanha de testes E2E.
