---
name: Workflow AI Platform
description: Instrumento de precisão para automações "AI First" — canvas, execuções e agentes onde a cor é sinal, não decoração.
colors:
  bg-app: "#0d0e12"
  bg-surface: "#14161b"
  bg-raised: "#1b1e24"
  bg-hover: "#20242b"
  border: "#262a31"
  border-strong: "#343a43"
  text-primary: "#e6e8eb"
  text-secondary: "#9ba1aa"
  text-muted: "#5e646e"
  cobalto: "#5b7cfa"
  cobalto-subtle: "rgb(91 124 250 / 0.12)"
  success: "#3dd68c"
  success-subtle: "rgb(61 214 140 / 0.12)"
  warning: "#f0b429"
  warning-subtle: "rgb(240 180 41 / 0.12)"
  danger: "#f2555a"
  danger-subtle: "rgb(242 85 90 / 0.12)"
  node-trigger: "#f0b429"
  node-logic: "#9ba1aa"
  node-ai: "#5b7cfa"
  node-database: "#3dd68c"
  node-api: "#5bc8fa"
  node-file: "#c495fa"
  node-communication: "#f2778d"
typography:
  text-xs:
    fontFamily: "Geist Sans, Inter, system-ui"
    fontSize: "11px"
    lineHeight: "16px"
    fontWeight: 400
  text-sm:
    fontFamily: "Geist Sans, Inter, system-ui"
    fontSize: "12.5px"
    lineHeight: "18px"
    fontWeight: 400
  text-base:
    fontFamily: "Geist Sans, Inter, system-ui"
    fontSize: "14px"
    lineHeight: "20px"
    fontWeight: 400
  text-md:
    fontFamily: "Geist Sans, Inter, system-ui"
    fontSize: "16px"
    lineHeight: "24px"
    fontWeight: 500
  text-lg:
    fontFamily: "Geist Sans, Inter, system-ui"
    fontSize: "20px"
    lineHeight: "28px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  text-xl:
    fontFamily: "Geist Mono, JetBrains Mono, monospace"
    fontSize: "28px"
    lineHeight: "34px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  mono-data:
    fontFamily: "Geist Mono, JetBrains Mono, monospace"
    fontSize: "12.5px"
    lineHeight: "18px"
    fontWeight: 400
rounded:
  sm: "4px"
  md: "6px"
  lg: "10px"
  full: "9999px"
spacing:
  "4": "4px"
  "8": "8px"
  "12": "12px"
  "16": "16px"
  "20": "20px"
  "24": "24px"
  "32": "32px"
  "40": "40px"
  "48": "48px"
  "64": "64px"
components:
  button-primary:
    backgroundColor: "{colors.cobalto}"
    textColor: "#f7f8fa"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  button-primary-hover:
    backgroundColor: "{colors.cobalto}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.lg}"
  button-destructive:
    backgroundColor: "rgb(242 85 90 / 0.1)"
    textColor: "{colors.danger}"
    rounded: "{rounded.lg}"
  status-badge-running:
    backgroundColor: "{colors.cobalto-subtle}"
    textColor: "{colors.cobalto}"
    rounded: "{rounded.full}"
  status-badge-success:
    backgroundColor: "{colors.success-subtle}"
    textColor: "{colors.success}"
    rounded: "{rounded.full}"
  status-badge-failed:
    backgroundColor: "{colors.danger-subtle}"
    textColor: "{colors.danger}"
    rounded: "{rounded.full}"
  metric-card:
    backgroundColor: "{colors.bg-surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
  node-card:
    backgroundColor: "{colors.bg-raised}"
    rounded: "{rounded.lg}"
    width: "240px"
---

# Design System: Workflow AI Platform

## Overview

**Creative North Star: "Instrumento de precisão"**

Workflow AI é uma ferramenta de trabalho intensivo — canvas, logs, execuções,
dados — não uma vitrine. A interface se comporta como um instrumento: o
chrome recua, o fluxo do usuário é o protagonista, e nada compete com o
conteúdo. Isso se traduz numa superfície quase monocromática (escala de
grafite) onde a única cor de marca — o Cobalto — aparece apenas para ação
primária, seleção, foco e a assinatura visual do produto. Cores semânticas
(verde/âmbar/vermelho) pertencem exclusivamente a estados de execução; nunca
decoram.

A densidade é alta (tabelas, logs, métricas em uma tela só) mas calma —
resolvida com hierarquia tipográfica e espaçamento, nunca com caixas, sombras
ou cores extras. Todo valor de máquina (IDs, custos, cron, JSON, logs) usa a
família mono; o olho aprende a distinguir dado de interface por isso, não por
cor. Rejeitado explicitamente: gradiente roxo/azul "de IA", sparkles,
glassmorphism, glow neon, qualquer decoração que não carregue informação.

**Key Characteristics:**
- Quase monocromático: grafite + um único acento (Cobalto), usado com raridade deliberada.
- Densidade calma via tipografia e espaço, nunca via caixas/sombras extras.
- Dado é sempre mono; interface é sempre sans — a distinção é a segunda camada de hierarquia.
- Flat por padrão; sombra existe só onde há sobreposição real (overlays).
- Movimento é causal (mostra que algo aconteceu), nunca decorativo.

## Colors

Escala de grafite quase monocromática com um único acento de marca; cores
semânticas vivem exclusivamente em estados de execução e feedback.

### Primary
- **Cobalto** (`#5b7cfa`): ação primária, seleção, foco, e "O Pulso" (assinatura visual, ver Components). Usado com raridade deliberada — a regra do produto é que sua escassez é o que o torna sinal.

### Neutral
- **Grafite Fundo** (`#0d0e12` — `bg-app`): fundo da aplicação e do canvas.
- **Grafite Superfície** (`#14161b` — `bg-surface`): sidebar, painéis, cards.
- **Grafite Elevado** (`#1b1e24` — `bg-raised`): popovers, modais, dropdowns, node cards.
- **Grafite Hover** (`#20242b` — `bg-hover`): hover de linhas e itens.
- **Borda** (`#262a31`): bordas padrão (1px).
- **Borda Forte** (`#343a43`): foco de container, divisores fortes.
- **Texto Primário** (`#e6e8eb`): títulos, valores, conteúdo.
- **Texto Secundário** (`#9ba1aa`): labels, descrições, texto de apoio.
- **Texto Discreto** (`#5e646e`): placeholders, metadados não essenciais.

### Named Rules

**A Regra da Cor-Sinal.** Cor nunca é decoração. Quando uma cor aparece fora da escala de grafite, ela significa algo específico: estado de execução, seleção ou erro. Um botão de marketing nunca é verde; nada é vermelho por estilo.

**A Regra da Redundância (daltonismo).** Estado nunca é comunicado só por cor — todo status combina cor + ícone/forma + label (`✔ Sucesso`, `✖ Falhou`, `● Executando`, `○ Na fila`).

## Typography

**Interface Font:** Geist Sans (fallback Inter, system-ui)
**Data/Mono Font:** Geist Mono (fallback JetBrains Mono, monospace)

**Character:** Par de ferramenta de desenvolvedor — Geist Sans para toda a
interface (títulos, corpo), Geist Mono reservado exclusivamente para dado de
máquina (IDs, logs, custos, cron, JSON). O olho aprende: mono = dado, sans =
interface. Pesos permitidos: 400, 500, 600 — nunca 700+; ênfase máxima é
peso 600 + cor de texto primário.

### Hierarquia
- **text-xl** (600, 28px/34px, mono): métricas do dashboard — sempre `tabular-nums`.
- **text-lg** (600, 20px/28px, `-0.01em`): título de página.
- **text-md** (500, 16px/24px): títulos de card e painel.
- **text-base** (400, 14px/20px): padrão da aplicação — corpo, inputs, tabelas.
- **text-sm** (400–500, 12.5px/18px): labels, células secundárias, badges.
- **text-xs** (400–500, 11px/16px): metadados, timestamps, eyebrows (`+0.04em` + uppercase quando eyebrow).

### Named Rules
**A Regra do Número Tabular.** Todo número em métrica, tabela ou custo usa `font-variant-numeric: tabular-nums` — colunas alinham, dashboards não "dançam" ao atualizar.

## Layout

Grid base 4px (escala 4·8·12·16·20·24·32·40·48·64). Padding de página: 24px
desktop / 16px mobile. Densidade de listas/tabelas: linhas de 40px (padrão)
ou 32px (modo compacto). Shell: sidebar 240px (colapsa pra 56px só-ícones) +
topbar 48px (breadcrumb, busca global `⌘K`, ações de contexto). Editor de
workflow: canvas full-bleed com toolbar flutuante, paleta de nodes em drawer
esquerdo, painel de configuração em drawer direito (400px) — drawers
sobrepõem o canvas em nível 2 de elevação, o canvas nunca redimensiona.
Desktop-first, funcional até 768px (sidebar vira drawer, tabelas ganham
scroll horizontal, canvas fica somente-leitura no mobile).

## Elevation & Depth

Interface flat por padrão: hierarquia de superfície vem de variação de fundo
+ borda 1px, não de sombra. Sombra existe só onde há sobreposição real
(overlays). Três níveis: nível 0 (app, canvas) sem borda nem sombra; nível 1
(cards, painéis) fundo `bg-surface` + borda; nível 2 (popover, dropdown,
modal, command palette) fundo `bg-raised` + borda + sombra.

### Shadow Vocabulary
- **overlay** (`box-shadow: 0 8px 24px rgb(0 0 0 / 0.32)` dark, `0 8px 24px rgb(23 24 28 / 0.12)` light): popovers, dropdowns, modais, command palette — único contexto onde sombra é usada.

### Named Rules
**A Regra Borda-Antes-de-Sombra.** Nunca sombra colorida, sombra em hover de card, ou borda dupla. Se dois elementos de nível 1 precisam se distinguir, a resposta é borda ou fundo, não sombra.

## Shapes

Quatro raios: `sm` (4px — badges, chips, inputs pequenos), `md` (6px —
inputs, células), `lg` (10px — cards, painéis, modais, node cards, botões),
`full` (9999px — dots de status, avatar). Bordas 1px como principal
recurso de separação visual; sem clipping decorativo ou geometria custom.

## Components

Distância do sistema: quatro componentes próprios em `packages/ui`
(`Pulse`, `StatusBadge`, `MetricCard`, `EmptyState`); botões, badges,
diálogos e demais primitivos vêm do shadcn/ui re-temperado por token em
`apps/web/src/components/ui`.

### Buttons
- **Shape:** `rounded-lg` (10px) em todas as variantes.
- **Primário:** fundo Cobalto, texto branco (`#f7f8fa`), altura 32px — no máximo um por vista; rótulo é verbo no infinitivo que diz o resultado ("Executar fluxo", nunca "OK"/"Enviar").
- **Secundário:** fundo transparente, borda forte, texto primário.
- **Ghost:** sem borda, texto secundário, hover `bg-hover` — ações em tabelas/toolbars.
- **Destrutivo:** fundo danger a 10%, texto danger — confirmação sempre em modal nomeando o objeto.
- **Hover / Focus:** ring de foco 2px em Cobalto a 24% — o mesmo ring em todo elemento focável do produto, sem exceção.

### Chips / Badges (Status)
- **Style:** pill `rounded-full`, `text-xs` peso 500, dot 6px + ícone + label — nunca cor sozinha.
- **State:** `running` (Cobalto + Pulso), `success` (verde), `failed` (vermelho), `queued` (cinza), `retry` (âmbar). Mesmo componente em tabelas de execução, header do editor, cards de flow, servidores MCP, documentos do Knowledge.

### Cards / Containers
- **Corner Style:** `rounded-lg` (10px).
- **Background:** `bg-surface` (nível 1) ou `bg-raised` (nível 2, node cards).
- **Shadow Strategy:** nenhuma em nível 1; ver Elevation & Depth para nível 2.
- **Border:** 1px `border`, sem exceção — nunca borda + sombra juntas em nível 1.
- **Internal Padding:** 16px (`MetricCard`).

### Inputs / Fields
- **Style:** altura 36px, fundo `bg-app`, borda `border`.
- **Focus:** borda Cobalto + ring 2px Cobalto a 24% (mesmo ring de botões).
- **Error:** borda danger + mensagem `text-xs` abaixo dizendo como corrigir, nunca só "campo inválido".

### Metric Card (Dashboard)
Label `text-sm` secundário em cima, valor `text-xl` mono `tabular-nums`
embaixo, delta opcional (`▲`/`▼` — única cor permitida no card). Sem ícones
decorativos, sem sparkline (isso é exclusivo de Analytics).

### O Pulso (componente de assinatura)
Um ponto percorrendo uma linha — dados fluindo por um fio. Existe em
exatamente quatro contextos e em nenhum outro: edge do canvas em execução
ao vivo, indicador de execução na sidebar/badge `Running`, loading da
aplicação (substitui spinners genéricos), e o símbolo da marca. Duas
variantes de código: `dot` (breathe, 1.2s ease-in-out) e `bar` (travel,
1.2s linear). Sempre com `role="status"` e `aria-label`; respeita
`prefers-reduced-motion` (vira estado estático).

No canvas, o Pulso é uma edge customizada (`pulse-edge.tsx`): um `<circle>`
com `<animateMotion>` percorrendo o path bezier enquanto o node de destino
está `running`, e a edge inteira em Cobalto (2px). Como SVG SMIL ignora
media queries, `prefers-reduced-motion` é lido em JS e o ponto fica estático
no meio do caminho. Edge de node falho usa danger; em repouso, `border-strong`.

### Navegação
Sidebar de 240px agrupada em seções (`Construir`, `Operar`, `Recursos`),
com Dashboard acima e Configurações no rodapé — nenhum grupo passa de 3
itens. Item ativo: fundo `cobalto-subtle` + barra de 2px Cobalto à esquerda.
Abaixo de 768px vira drawer sobreposto com backdrop, aberto por hamburger
na topbar e fechado por Esc, backdrop ou navegação. Alvos de toque de 40px
no mobile, 32px no desktop.

### Node Card (canvas)
Nível 2 (`bg-raised`, borda, `rounded-lg`), 240px de largura. Chip do ícone
com tint de categoria (fundo a 12%, ícone a 100% — nunca o card inteiro).
Selecionado: borda Cobalto 1.5px. Executando: borda Cobalto + Pulso na edge
de entrada. Sucesso/falha: dot de status no canto, borda volta ao neutro
(cor persistente só no dot).

## Do's and Don'ts

### Do:
- **Do** usar Cobalto (`#5b7cfa`) exclusivamente para ação primária, seleção, foco e O Pulso.
- **Do** combinar toda cor de estado com ícone/forma + label — nunca só cor.
- **Do** usar Geist Mono pra todo dado de máquina (IDs, custos, cron, JSON, logs) e Geist Sans pra tudo mais.
- **Do** aplicar `tabular-nums` em todo número de métrica, tabela ou custo.
- **Do** limitar a um botão primário por vista.
- **Do** manter sombra restrita a overlays de nível 2 (popover, dropdown, modal, command palette).

### Don't:
- **Don't** usar gradiente roxo/azul "de IA", sparkles, glassmorphism ou glow neon.
- **Don't** usar cor semântica fora de estado (verde decorativo, vermelho num CTA de marketing).
- **Don't** aplicar sombra em hover de card, ou borda + sombra juntas em nível 1.
- **Don't** usar O Pulso fora dos quatro contextos definidos (edge ativa, indicador de execução, loading de app, marca) — a raridade é o que o torna assinatura.
- **Don't** truncar dado crítico sem tooltip, ou esconder erro atrás de "Algo deu errado" — todo erro tem causa provável + ação de correção.
