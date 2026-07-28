# Integração WhatsApp (Cloud API) — planejado, não iniciado

Status: decisão de abordagem tomada, implementação **não começou**. Este
documento existe pra não perder o contexto da pesquisa até lá.

## Decisão: WhatsApp Business Platform (Cloud API), direto com a Meta

Descartada a Evolution API (e equivalentes tipo Baileys/WPPConnect) — simulam
o WhatsApp Web por engenharia reversa, violam os termos da Meta e têm risco
real de banimento de número (já aconteceu com um número nosso).

A Cloud API é a única opção oficial desde a descontinuação do On-Premises API
(out/2025): hospedada pela Meta, sem infra própria — só chamar os endpoints
e receber mensagens via webhook. Contratar **direto com a Meta**, sem BSP
intermediário (360dialog/Twilio/Gupshup) — a plataforma já é o
painel/automação, então não há ganho em pagar markup por cima.

## Encaixe na arquitetura atual

Mesmo modelo do `trigger.chat` já implementado:

```
Cliente no WhatsApp → Meta Cloud API → webhook (nossa API) → workflow → Graph API (resposta)
```

Trabalho a fazer quando for a hora:
- Node `trigger.whatsapp` — endpoint webhook (GET de verificação + POST de mensagens).
- Envio de resposta via `POST /<phone_number_id>/messages` (pode reusar `api.httpRequest`
  como receita, no mesmo espírito do `rein.md`, ou virar node dedicado).
- Credential tipo `whatsapp` (access token + phone_number_id + verify_token).

## Custos (Brasil, levantado em 2026-07)

Cobrança por mensagem de template entregue (mudou em jul/2025, não é mais por
janela de conversa):
- Resposta a mensagem do cliente dentro de 24h: **grátis** (+ 1.000 conversas
  de serviço grátis/mês).
- Utility: ~US$0,008/msg. Marketing: ~US$0,0625/msg.

O fluxo "Vendas via Chat" é sempre o cliente iniciando — cai em conversa de
serviço, custo ~zero no volume inicial.

## Requisitos pra produção

1. Conta Meta Business + verificação da empresa (CNPJ, comprovantes; 2-10
   dias úteis). Sem verificação: limite de 250 conversas/24h (dá pra validar).
2. Número de telefone dedicado, não registrado no WhatsApp comum.
3. Webhook HTTPS — já temos (API no Railway).
4. Compliance 2026 da Meta: bot precisa executar tarefa de negócio concreta
   (vender, agendar, suportar), não chat aberto — o fluxo de vendas se encaixa.

## Próximo passo (quando retomar)

Começar pelo número de teste sandbox da Meta (grátis, sem verificação) pra
validar o node `trigger.whatsapp` + envio via Graph API contra o fluxo
"Vendas via Chat" já existente, antes de registrar número real ou gastar
qualquer valor.
