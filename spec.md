# Workflow AI Platform
## Product Specification (spec.md)

Version: 1.0

---

# Overview

Workflow AI é uma plataforma para criação de automações inteligentes utilizando IA, agentes, MCP (Model Context Protocol) e integrações com APIs.

O objetivo não é competir diretamente com o n8n, Zapier ou Make.

A proposta é construir uma plataforma "AI First", onde a IA deixa de ser apenas mais um bloco do fluxo e passa a ser responsável por entender, decidir, executar e colaborar durante toda a automação.

A experiência deve transmitir a sensação de estar utilizando um produto moderno, semelhante ao Linear, Vercel e OpenAI.

---

# Objetivos

- Construir automações complexas sem código.
- Criar agentes inteligentes reutilizáveis.
- Integrar múltiplos modelos de IA.
- Suportar MCP.
- Permitir workflows visuais.
- Executar fluxos de forma distribuída.
- Possuir observabilidade completa.
- Facilitar integrações com serviços externos.

---

# Público

- Desenvolvedores
- Startups
- Empresas
- Equipes de suporte
- Equipes comerciais
- Criadores de conteúdo
- Analistas

---

# Stack

## Frontend

- Next.js
- React
- TypeScript
- TailwindCSS
- React Flow
- shadcn/ui
- Framer Motion
- React Query

---

## Backend

- NestJS

---

## Banco

- PostgreSQL

---

## Cache

- Redis

---

## Filas

- BullMQ

---

## IA

- OpenAI
- Gemini
- Claude
- Ollama (local)
- MCP Client

---

## Infra

- Docker
- GitHub Actions
- Railway
- Vercel

---

# Conceito

A plataforma funciona como um editor visual.

Cada automação é composta por blocos.

Exemplo

```
Webhook

↓

Classificador IA

↓

Consulta Banco

↓

Decisão

↓

Enviar Email

↓

Slack

↓

Finalizar
```

---

# Layout

```
────────────────────────────

Sidebar

Dashboard

Flows

Agents

Executions

Knowledge

Templates

Marketplace

Settings

────────────────────────────

Canvas

```

---

# Dashboard

Visão geral da plataforma.

Cards

```
Fluxos

24

────────────

Execuções

182.000

────────────

IA Requests

42.000

────────────

Tempo médio

2.1s

────────────

Falhas

3

────────────

Custo IA

US$ 42
```

---

# Workflow Editor

Tela principal.

Canvas infinito.

Zoom.

Mini mapa.

Conexões animadas.

Drag and Drop.

---

# Nodes

Todos os blocos são independentes.

---

## Triggers

- Webhook
- Cron
- HTTP
- Email
- WhatsApp
- Discord
- Slack
- GitHub
- Stripe
- Manual

---

## Logic

- If
- Switch
- Loop
- Delay
- Merge
- Parallel
- Variables

---

## Database

- PostgreSQL
- MySQL
- MongoDB
- Redis

---

## APIs

- HTTP Request
- GraphQL
- REST
- SOAP

---

## Files

- PDF
- CSV
- DOCX
- TXT
- JSON

---

## AI

- Chat
- Prompt
- Vision
- OCR
- Embeddings
- Classification
- Translation
- Summarization
- Extraction
- Agent

---

## Communication

- Email
- Slack
- Discord
- Teams
- Telegram
- WhatsApp

---

# AI Nodes

Diferencial da plataforma.

Cada IA pode utilizar um modelo diferente.

Exemplo

```
GPT-5

↓

Claude

↓

Gemini

↓

Decision
```

Cada nó possui

System Prompt

Temperature

Tools

Memory

Context

Output Schema

---

# Agents

Agentes reutilizáveis.

Exemplo

```
Financial Analyst

```

Ferramentas

- SQL
- Calculator
- Internet
- PDF
- CRM
- Email

---

Outro exemplo

```
Support Agent

```

Ferramentas

- Knowledge Base

- Zendesk

- Slack

- Jira

---

# MCP

Tela exclusiva.

Lista de servidores MCP.

```
Filesystem

Connected

────────────

GitHub

Connected

────────────

Postgres

Connected

────────────

Browser

Connected
```

Adicionar servidor

Logs

Health Check

Ferramentas disponíveis

---

# Knowledge

Base de conhecimento.

Upload

- PDF
- DOCX
- Markdown
- TXT
- CSV

Pipeline

```
Documento

↓

Chunks

↓

Embeddings

↓

Vector Database
```

Depois qualquer agente pode utilizar.

---

# Executions

Lista completa.

Cada execução possui

Status

Tempo

Entradas

Saídas

Tokens

Modelo

Logs

Eventos

Erro

Retry

---

# Visualização

```
Webhook

✔

↓

GPT

✔

↓

Email

✔

↓

Slack

✖

↓

Fim
```

---

# Logs

Cada node gera logs.

```
09:42

HTTP

200

──────────

09:42

GPT

890 Tokens

──────────

09:42

Email

Sent

──────────

09:43

Slack

Timeout
```

---

# Replay

Executar novamente.

Modificar inputs.

Executar apenas parte do fluxo.

---

# Templates

Fluxos prontos.

Exemplos

Suporte IA

Atendimento WhatsApp

Responder Email

Extrair PDF

OCR

CRM

Marketing

Lead Qualification

Resumo de reuniões

Gerador de artigos

Análise financeira

---

# Marketplace

Usuários podem publicar

Agentes

Workflows

Prompts

Integrações

Templates

---

# Integrations

GitHub

GitLab

Slack

Discord

Stripe

Supabase

Firebase

OpenAI

Anthropic

Google Drive

Dropbox

AWS

Azure

Notion

Linear

Jira

Hubspot

Salesforce

---

# Versionamento

Cada alteração cria uma versão.

```
v1

Webhook

↓

GPT

↓

Email

```

```
v2

Webhook

↓

Claude

↓

Slack

↓

Email
```

Rollback disponível.

---

# Variáveis

Globais

Secrets

Environment

Runtime

---

# Secrets

OpenAI

Stripe

AWS

GitHub

SMTP

Todos criptografados.

---

# Scheduler

Executar

A cada minuto

Diário

Semanal

Mensal

Expressões Cron

---

# Analytics

Dashboard

Tempo médio

Tokens

Falhas

Uso IA

Execuções

Fluxos ativos

Custos

---

# Custos IA

Exemplo

```
OpenAI

US$ 22

────────────

Claude

US$ 8

────────────

Gemini

US$ 2

```

---

# AI Cost Optimizer

Sugere

Trocar GPT por Gemini

↓

Economia estimada

38%

---

# Observabilidade

Logs

Tracing

Eventos

Performance

Uso memória

Tempo por node

---

# Search

Busca global.

```
Ctrl + K
```

Pesquisar

Fluxos

Nodes

Execuções

Templates

Agentes

---

# Autocomplete IA

O usuário pode escrever

```
Quando chegar um email com boleto,
extraia os dados,
grave no banco,
responda confirmando
e envie no Slack.
```

A IA gera automaticamente o workflow.

---

# Copilot

Dentro do editor.

Perguntas

```
Como melhorar este fluxo?

```

```
Existe um gargalo?

```

```
Posso reduzir custos?

```

```
Como deixar mais rápido?

```

---

# AI Debugger

Ao ocorrer erro

```
Timeout HTTP

Possível causa

API indisponível

Sugestão

Adicionar Retry

↓

Adicionar Timeout

↓

Adicionar Fallback
```

---

# Banco

## workflows

```
id

name

description

created_at
```

---

## workflow_nodes

```
id

workflow_id

type

position

configuration
```

---

## executions

```
id

workflow_id

status

duration

started_at

finished_at
```

---

## execution_logs

```
id

execution_id

node

event

payload
```

---

## agents

```
id

name

description

system_prompt

tools

memory
```

---

## knowledge

```
id

title

embedding

metadata
```

---

# APIs

GET /workflows

POST /workflows

POST /workflow/run

GET /executions

GET /agents

POST /agents

POST /chat

POST /knowledge/upload

POST /mcp/connect

---

# Roadmap

## v1

Editor visual

Execução

OpenAI

Logs

Templates

---

## v2

MCP

Marketplace

Versionamento

Replay

---

## v3

Execução distribuída

Clusters

Workers

Auto Scaling

AI Debugger

Voice Workflows

---

# Diferenciais

- Plataforma construída pensando em IA desde o início.
- Agentes reutilizáveis em qualquer workflow.
- Geração automática de fluxos por linguagem natural.
- Integração nativa com MCP.
- Observabilidade completa.
- Versionamento de workflows.
- Replay de execuções.
- IA capaz de sugerir otimizações e detectar gargalos.
- Interface premium inspirada em ferramentas modernas.

---

# Objetivo Final

O produto deve transmitir a sensação de uma plataforma comercial pronta para ser utilizada em produção.

Ao explorar a aplicação, o usuário deve perceber domínio em arquitetura distribuída, filas, processamento assíncrono, inteligência artificial, UX, observabilidade e desenvolvimento de produtos SaaS complexos.

