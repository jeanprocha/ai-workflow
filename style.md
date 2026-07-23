# Workflow AI Platform — Design System (style.md)

Versão: 1.0
Base: [spec.md](spec.md) v1.0 · [plan.md](plan.md) Fase 1
Escopo: identidade visual, tokens, componentes e regras de UX de toda a aplicação.

---

# 1. Direção

## "Instrumento de precisão"

O Workflow AI é uma ferramenta de trabalho intensivo: canvas, logs, execuções, dados. A interface se comporta como um instrumento — **o chrome recua, o fluxo é o protagonista**. Nada compete com o conteúdo do usuário.

Cinco princípios, em ordem de prioridade:

1. **Cor é informação.** A interface é quase monocromática. Quando uma cor aparece, ela *significa* algo: estado de execução, seleção, erro. Cor nunca é decoração. Este é o princípio que define o produto visualmente — e o risco assumido: apostamos tudo em superfícies neutras + sinal.
2. **Densidade calma.** Muita informação por tela (tabelas, logs, métricas) sem parecer poluído. Isso se resolve com hierarquia tipográfica e espaçamento — nunca com caixas, sombras ou cores extras.
3. **Dados em mono.** Todo valor de máquina (IDs, tokens, custos, durações, cron, JSON, logs) usa a família mono. O olho aprende: mono = dado, sans = interface. É a segunda camada de hierarquia do produto.
4. **Movimento é causalidade.** Animação existe para mostrar que algo aconteceu ou está acontecendo — nunca para enfeitar. Uma execução ao vivo *pulsa*; um painel salvo *confirma*; o resto fica parado.
5. **Estado sempre visível.** Nenhuma ação sem feedback, nenhuma tela vazia sem próximo passo, nenhum erro sem causa e correção. (Regra herdada do objetivo do spec: "sensação de produto comercial pronto para produção".)

## Assinatura: o Pulso

O elemento memorável da marca é **um ponto percorrendo uma linha** — dados fluindo por um fio. Ele aparece em exatamente quatro lugares, e em nenhum outro:

1. **Edges do canvas durante execução ao vivo** — um ponto de luz percorre a conexão do node ativo.
2. **Indicador de execução em andamento** — o dot pulsante ao lado do item "Executions" na sidebar e no badge de status `Running`.
3. **Loading da aplicação** — uma linha horizontal com o ponto percorrendo-a (substitui spinners genéricos).
4. **Logo/marca** — um ponto sobre uma linha (ver §8.1).

Fora desses quatro contextos, o Pulso não é usado. A raridade é o que o torna assinatura.

---

# 2. Cor

## 2.1 Filosofia

- Superfícies e texto: **escala de grafite** (neutros frios, levemente azulados).
- Uma única cor de marca (**Cobalto**), usada apenas para: ação primária, seleção, foco e o Pulso.
- Cores semânticas (verde/vermelho/âmbar) pertencem **exclusivamente a estados de execução e feedback**. Verde nunca aparece num botão de marketing; vermelho nunca aparece como decoração.
- **Proibido:** gradientes decorativos, glassmorphism, glow/neon, mais de uma cor de acento.

## 2.2 Tokens — tema escuro (padrão)

| Token | Hex | Uso |
|---|---|---|
| `--bg-app` | `#0D0E12` | Fundo da aplicação e do canvas |
| `--bg-surface` | `#14161B` | Sidebar, painéis, cards |
| `--bg-raised` | `#1B1E24` | Popovers, modais, dropdowns, node cards |
| `--bg-hover` | `#20242B` | Hover de linhas e itens |
| `--border` | `#262A31` | Bordas padrão (1px) |
| `--border-strong` | `#343A43` | Bordas de inputs em foco de container, divisores fortes |
| `--text-primary` | `#E6E8EB` | Títulos, valores, conteúdo |
| `--text-secondary` | `#9BA1AA` | Labels, descrições, texto de apoio |
| `--text-muted` | `#5E646E` | Placeholders, metadados não essenciais |
| `--accent` | `#5B7CFA` | Cobalto: ação primária, seleção, foco, Pulso |
| `--accent-subtle` | `#5B7CFA` @ 12% | Fundo de item selecionado, hover do accent |

## 2.3 Tokens — tema claro

| Token | Hex |
|---|---|
| `--bg-app` | `#F7F8FA` |
| `--bg-surface` | `#FFFFFF` |
| `--bg-raised` | `#FFFFFF` (+ sombra de overlay) |
| `--bg-hover` | `#F0F1F4` |
| `--border` | `#E4E6EA` |
| `--border-strong` | `#CDD1D8` |
| `--text-primary` | `#17181C` |
| `--text-secondary` | `#5C6370` |
| `--text-muted` | `#9AA0AB` |
| `--accent` | `#3D5BF5` (Cobalto escurecido p/ contraste AA) |
| `--accent-subtle` | `#3D5BF5` @ 8% |

## 2.4 Cores semânticas (estados)

Mesmos papéis nos dois temas; valores por tema para manter contraste AA.

| Estado | Dark | Light | Uso |
|---|---|---|---|
| `--success` | `#3DD68C` | `#218358` | Execução concluída, MCP connected, teste passou |
| `--danger` | `#F2555A` | `#D93036` | Falha, erro, ação destrutiva |
| `--warning` | `#F0B429` | `#AD6800` | Retry, degradado, atenção |
| `--running` | `--accent` | `--accent` | Em execução (sempre com o Pulso animado) |
| `--queued` | `--text-muted` | `--text-muted` | Na fila, inativo, rascunho |

**Regra de redundância (daltonismo):** estado nunca é comunicado só por cor. Todo status = cor + ícone/forma + label (`✔ Success`, `✖ Failed`, `● Running`, `○ Queued`). Vale para badges, nodes no canvas e linhas de tabela.

## 2.5 Tints de categoria de node (exceção controlada)

No canvas com dezenas de nodes, distinguir categorias é informação, não decoração. Cada categoria tem um tint **aplicado apenas ao chip do ícone do node** (fundo a 12%, ícone a 100%) — nunca ao card inteiro:

| Categoria | Dark | Light |
|---|---|---|
| Triggers | `#F0B429` | `#AD6800` |
| Logic | `#9BA1AA` | `#5C6370` |
| AI | `#5B7CFA` | `#3D5BF5` |
| Database | `#3DD68C` | `#218358` |
| APIs / HTTP | `#5BC8FA` | `#0E7CA8` |
| Files | `#C495FA` | `#8145C9` |
| Communication | `#F2778D` | `#C42A52` |

Fora do canvas e da paleta de nodes, esses tints não existem.

---

# 3. Tipografia

## 3.1 Famílias

Duas famílias, papéis rígidos. Sem face display separada — minimalismo aqui significa que a hierarquia vem de tamanho, peso e cor, não de uma terceira fonte.

| Papel | Família | Fallback | Justificativa |
|---|---|---|---|
| Interface (UI, títulos, corpo) | **Geist Sans** | Inter, system-ui | Desenhada para ferramentas de desenvolvedor; excelente em tamanhos pequenos; números tabulares |
| Dados (IDs, logs, tokens, custos, cron, JSON, código) | **Geist Mono** | JetBrains Mono, monospace | Par nativo da Geist; distinção instantânea dado × interface |

Pesos permitidos: **400, 500, 600**. Nunca 700+. Ênfase máxima = 600 + `--text-primary`.

## 3.2 Escala (app-oriented, compacta)

| Token | Tamanho/linha | Peso | Uso |
|---|---|---|---|
| `text-xs` | 11/16 | 400–500 | Metadados, timestamps, eyebrows |
| `text-sm` | 12.5/18 | 400–500 | Labels, células secundárias, badges |
| `text-base` | 14/20 | 400 | **Padrão da aplicação** — corpo, inputs, tabelas |
| `text-md` | 16/24 | 500 | Títulos de card e painel |
| `text-lg` | 20/28 | 600 | Título de página |
| `text-xl` | 28/34 | 600 | Métricas do dashboard (sempre `tabular-nums`) |

Regras:

- Números em métricas, tabelas e custos: **sempre `font-variant-numeric: tabular-nums`** (colunas alinham, dashboards não "dançam" ao atualizar).
- Valores monetários e tokens: mono, `text-sm` — ex.: `US$ 0.0042` · `1.284 tokens`.
- Letter-spacing: `-0.01em` em títulos ≥ 20px; `+0.04em` + uppercase apenas em eyebrows `text-xs`.
- Truncamento com tooltip no hover; nunca quebrar IDs em duas linhas.

---

# 4. Espaço, forma e elevação

## 4.1 Grid e espaçamento

- Grid base **4px**. Escala: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64.
- Padding de página: 24px (desktop) / 16px (mobile).
- Densidade de listas/tabelas: linhas de **40px** (padrão) ou 32px (modo compacto — preferência do usuário, persistida).

## 4.2 Raio

| Token | Valor | Uso |
|---|---|---|
| `radius-sm` | 4px | Badges, chips, inputs pequenos |
| `radius-md` | 6px | Botões, inputs, células |
| `radius-lg` | 10px | Cards, painéis, modais, node cards |
| `radius-full` | 9999px | Dots de status, avatar |

## 4.3 Elevação: bordas antes de sombras

Interface flat: hierarquia de superfície = variação de fundo + **borda 1px**. Sombra existe só onde há sobreposição real:

- Nível 0 (app, canvas): sem borda, sem sombra.
- Nível 1 (cards, painéis): `--bg-surface` + borda `--border`.
- Nível 2 (overlays: popover, dropdown, modal, command palette): `--bg-raised` + borda + `shadow: 0 8px 24px rgb(0 0 0 / 0.32)` (dark) · `0 8px 24px rgb(23 24 28 / 0.12)` (light).

Nunca: sombras coloridas, sombras em hover de card, borda dupla.

---

# 5. Movimento

| Contexto | Duração | Easing |
|---|---|---|
| Micro (hover, press, toggle) | 120ms | `ease-out` |
| Painéis, dropdowns, drawers | 200ms | `cubic-bezier(0.32, 0.72, 0, 1)` |
| Modais, command palette | 240ms | idem |
| **O Pulso** (edge ativa, dot running) | 1.2s loop | `linear` |

Regras:

- Entrada de overlays: fade + translateY(4px). Sem zoom, sem bounce, sem spring exagerado.
- Skeletons: shimmer sutil a 1.6s; nunca pulse de opacidade agressivo.
- Transição de página: apenas fade 120ms do conteúdo (o shell não anima).
- `prefers-reduced-motion`: todas as animações viram estados estáticos; o Pulso vira um dot fixo colorido; skeletons ficam estáticos. Obrigatório, não opcional.
- Framer Motion somente onde CSS não resolve (layout animations do canvas, reorder de listas).

---

# 6. Iconografia

- Biblioteca: **Lucide** (par natural do shadcn/ui).
- Tamanho padrão 16px (UI densa), 20px (paleta de nodes), stroke **1.5px**.
- Ícones herdam a cor do texto adjacente (`currentColor`); nunca têm cor própria fora dos tints de categoria (§2.5) e estados (§2.4).
- Sem emojis na interface. Sem ilustrações decorativas — empty states usam o motivo do Pulso em linha (§9.1).

---

# 7. Layout da aplicação

## 7.1 Shell

```
┌──────────┬─────────────────────────────────────────────┐
│          │  Topbar: breadcrumb · busca ⌘K · ações      │ 48px
│ Sidebar  ├─────────────────────────────────────────────┤
│  240px   │                                             │
│          │                Conteúdo                     │
│ (colapsa │           (ou Canvas full-bleed)            │
│  p/ 56px)│                                             │
└──────────┴─────────────────────────────────────────────┘
```

- **Sidebar** (240px, colapsável para 56px só-ícones): navegação do spec — Dashboard, Flows, Agents, Executions, Knowledge, Templates, Marketplace, Settings. Item ativo: fundo `--accent-subtle` + texto `--text-primary` + barra 2px `--accent` à esquerda. Ao lado de "Executions", o dot do Pulso quando há execução ao vivo.
- **Topbar** (48px): breadcrumb à esquerda, busca global (`⌘K`) ao centro-direita, ações de contexto à direita. Sem logo repetido (o logo mora na sidebar).
- **Editor de workflow**: canvas full-bleed; toolbar flutuante superior (nome do fluxo, status, Run); paleta de nodes em drawer à esquerda; painel de configuração em drawer à direita (400px). Drawers sobrepõem o canvas com nível 2 de elevação — o canvas nunca redimensiona.

## 7.2 Responsividade

- Desktop-first (é uma ferramenta profissional), funcional até 768px: sidebar vira drawer, tabelas ganham scroll horizontal com colunas fixas à esquerda, canvas é somente-leitura com aviso "Edite no desktop".
- Alvos de clique/toque ≥ 32px na UI densa; ≥ 40px em controles primários.

---

# 8. Componentes

## 8.1 Marca

Logotipo: wordmark "Workflow AI" em Geist Sans 600. Símbolo: **um ponto sobre uma linha** (o Pulso congelado) — funciona em 16px de favicon. Sem gradiente, sem "sparkles de IA".

## 8.2 Botões

| Variante | Estilo | Uso |
|---|---|---|
| Primário | fundo `--accent`, texto branco | 1 por vista, no máximo. A ação principal ("Executar", "Salvar") |
| Secundário | fundo transparente, borda `--border-strong`, texto primário | Ações normais |
| Ghost | sem borda, texto secundário; hover `--bg-hover` | Ações em tabelas, toolbars |
| Destrutivo | ghost com texto `--danger`; confirmação sempre em modal | Deletar, arquivar |

Altura 32px (denso) / 36px (formulários). Rótulo = verbo no infinitivo que diz o que acontece: "Executar fluxo", "Salvar alterações", "Publicar versão" — nunca "OK", "Enviar", "Sim".

## 8.3 Badges de status

Pill `radius-full`, `text-xs` 500, dot 6px + label. Fundo = cor do estado a 12%, texto e dot = cor plena:
`● Running` (dot pulsante) · `✔ Success` · `✖ Failed` · `○ Queued` · `◐ Retry`.
Mesmo componente em: tabelas de execução, header do editor, cards de flow, servidores MCP, documentos do Knowledge.

## 8.4 Tabelas (Executions, Logs, listas)

- Header: `text-xs` uppercase `--text-secondary`, fundo `--bg-surface`, sticky.
- Linhas: 40px, separadas por borda 1px (sem zebra). Hover `--bg-hover`, linha inteira clicável.
- Colunas numéricas (duração, tokens, custo): alinhadas à direita, mono, `tabular-nums`.
- Timestamps: relativos ("há 2 min") com absoluto no tooltip.
- Filtros como chips acima da tabela; estado de filtro persiste na URL.

## 8.5 Cards de métrica (Dashboard)

Card nível 1. Label `text-sm` `--text-secondary` em cima, valor `text-xl` mono `tabular-nums` embaixo, delta opcional (`▲ 12%` em `--success` / `▼` em `--danger` — única cor no card). Sem ícones decorativos, sem sparkline por padrão (sparkline entra em Analytics, não no resumo).

## 8.6 Node card (canvas)

```
┌────────────────────────────┐
│ ⚡ Webhook          ● ✔    │  ← chip do ícone (tint §2.5) · nome · status
│ POST /hooks/abc123         │  ← subtítulo mono, config resumida
○────────────────────────────○  ← ports de entrada/saída (8px)
└────────────────────────────┘
```

- Card nível 2 (`--bg-raised`, borda, `radius-lg`), largura 240px.
- Selecionado: borda `--accent` 1.5px. Executando: borda `--accent` + Pulso na edge de entrada. Sucesso/falha: dot de status no canto (a borda volta ao neutro — cor persistente só no dot, senão o canvas vira árvore de Natal).
- Edges: `--border-strong` 1.5px, curva bezier; ativa = `--accent` com o Pulso; falhou = `--danger`.
- Mini-map: fundo `--bg-surface`, nodes como retângulos neutros, viewport em `--accent` @ 24%.
- Zoom < 50%: node colapsa para chip do ícone + dot de status (legibilidade no overview).

## 8.7 Painel de configuração de node

Drawer direito 400px, nível 2. Header: ícone + nome editável + tipo. Corpo: formulário gerado pelo schema (plan.md F3b) — labels acima do campo, `text-sm`; descrições `text-xs` `--text-muted`; campos com expressão `{{ }}` destacam a variável em `--accent` sobre `--accent-subtle`, em mono. Footer fixo: "Testar node" (secundário) + resultado inline.

## 8.8 Command palette (⌘K)

Modal nível 2, 560px, topo da tela. Input `text-base` sem borda; resultados agrupados (Fluxos, Nodes, Execuções, Templates, Agentes — §Search do spec); navegação por teclado completa; match destacado em 600 (não em cor). Ações rápidas no rodapé: "Criar fluxo", "Executar…".

## 8.9 Formulários

- Inputs: 36px, fundo `--bg-app`, borda `--border`; foco = borda `--accent` + ring 2px `--accent` @ 24% (mesmo ring em *todo* elemento focável do produto — consistência de foco é inegociável).
- Erro de validação: borda `--danger` + mensagem `text-xs` abaixo dizendo **como corrigir** ("Informe uma URL começando com https://"), nunca só "Campo inválido".
- Secrets: sempre mascarados com reveal explícito; nunca pré-preenchidos em edição (placeholder `••••••••`).

## 8.10 Toasts

Canto inferior direito, nível 2, 4s. Sucesso: dot `--success` + fato consumado no particípio — botão "Publicar" → toast "Versão publicada". Erro: persiste até dispensar, com ação ("Tentar novamente"). Máximo 3 empilhados.

---

# 9. Estados

## 9.1 Vazio

Empty state = convite à ação, nunca só constatação. Anatomia: motivo do Pulso em linha (uma linha horizontal `--border` com dot `--accent`), título `text-md`, uma frase `--text-secondary`, **uma** ação primária.

> **Nenhum fluxo ainda**
> Crie seu primeiro fluxo ou comece por um template.
> [Criar fluxo]  [Ver templates]

## 9.2 Carregamento

- Skeletons com a forma real do conteúdo (linhas de tabela, cards) — nunca spinner de página inteira.
- Carregamento de app/rota pesada: a linha do Pulso no topo do conteúdo.
- Ações com latência > 300ms: botão entra em estado loading (spinner 14px interno + rótulo mantido). UI otimista onde a reversão é trivial (renomear, toggles); pessimista onde não é (executar, deletar, publicar).

## 9.3 Erro

Padrão em três partes, em todo o produto (mesma estrutura que o AI Debugger do spec usa):

> **O que aconteceu:** Timeout ao chamar a API (10s sem resposta).
> **Causa provável:** O serviço externo está lento ou indisponível.
> **O que fazer:** [Tentar novamente] [Adicionar retry ao node]

Erros nunca pedem desculpas, nunca culpam o usuário, nunca mostram stack trace cru (stack vai para um bloco expansível "Detalhes técnicos", em mono).

---

# 10. Escrita de interface (pt-BR)

- **Sentence case** em tudo: "Criar fluxo", não "Criar Fluxo". Uppercase só em eyebrows.
- Verbos ativos e específicos; o botão diz o resultado: "Publicar versão" → toast "Versão publicada" (mesmo verbo do início ao fim do fluxo).
- Vocabulário canônico (não sinonimizar): **fluxo** (não "workflow" solto no meio de frase em pt), **execução**, **node**, **agente**, **conexão** (credencial de integração), **base de conhecimento**. Termos técnicos consagrados ficam em inglês: node, webhook, prompt, template, token.
- Nomear pelo que o usuário controla, não pela implementação: "Conexões" e não "Credentials OAuth"; "Agendamento" e não "Cron job" (a expressão cron aparece dentro, em mono).
- Números e unidades: `2,1s` · `1.284 tokens` · `US$ 0,42` (formato pt-BR, mono, tabular).
- Sem jargão de marketing dentro do app ("supercharge", "mágica de IA"). A IA é descrita pelo que faz: "Gerar fluxo a partir da descrição".

---

# 11. Acessibilidade e usabilidade — piso de qualidade

Checklist inegociável (entra na Definição de Pronto do plan.md §7):

- [ ] Contraste AA: texto normal ≥ 4.5:1, texto grande e UI ≥ 3:1 — nos dois temas.
- [ ] Estado nunca só por cor (§2.4): sempre cor + forma + label.
- [ ] Foco visível em todo elemento interativo (ring §8.9), inclusive nodes e ports no canvas.
- [ ] Navegação completa por teclado: `⌘K` busca, `Esc` fecha (drawer → modal → seleção, nessa ordem), setas em listas, `Enter` abre, atalhos documentados em Settings.
- [ ] Canvas acessível: nodes selecionáveis por Tab, mover com setas (+Shift = 10px), painel de config alcançável por teclado.
- [ ] `prefers-reduced-motion` respeitado (§5).
- [ ] Áreas de clique ≥ 32px mesmo quando o ícone tem 16px.
- [ ] Toda ação destrutiva: confirmação com o nome do objeto ("Deletar o fluxo **Onboarding de leads**?") e consequência explícita.
- [ ] Tooltips em toda ação só-ícone (delay 400ms).
- [ ] ARIA: live regions para toasts e logs em tempo real; labels em todos os inputs; tabelas com headers associados.

---

# 12. Implementação (Tailwind + shadcn/ui)

- Todos os tokens deste documento viram **CSS custom properties** em `packages/ui/styles/tokens.css`, tema via `data-theme="dark|light"` no `<html>` (dark é o default; sem flash de tema — script inline no head).
- Tailwind consome os tokens (`colors: { app: 'var(--bg-app)', … }`); **nenhum componente usa hex direto** — só token. Cor nova = PR no tokens.css com justificativa.
- shadcn/ui é a base dos primitivos (Dialog, Popover, Dropdown, Toast, Command); todos re-tematizados por token no `packages/ui`. Apps nunca importam shadcn direto — importam de `@workflow/ui`.
- Fontes: `geist` via `next/font` (self-hosted, sem FOUT); `font-feature-settings: "tnum"` utilitário `.tabular`.
- O Pulso é um componente único (`<Pulse />`) com as 4 variantes do §1 — a animação vive num só lugar.
- Storybook (ou registry interna) com todos os componentes nos dois temas e nos estados: default, hover, focus, disabled, loading, erro, vazio.

---

# 13. Anti-padrões — o que este produto nunca faz

1. Gradiente roxo/azul "de IA", sparkles ✨, glow neon.
2. Mais de um botão primário por vista.
3. Cor semântica usada fora de estado (verde em CTA, vermelho decorativo).
4. Sombra em hover de card, borda + sombra juntas em nível 1.
5. Spinner de página inteira; modal sobre modal.
6. Título em Title Case, texto em cinza abaixo de 4.5:1 fingindo hierarquia.
7. Ícones coloridos aleatórios "para dar vida" — vida vem do conteúdo do usuário.
8. Animação em scroll, parallax, contadores animados no dashboard.
9. Truncar dado crítico sem tooltip; esconder erro atrás de "Algo deu errado".
10. Densidade via `text-xs` em tudo — densidade vem de espaçamento, não de fonte minúscula.

---

# 14. Resumo executivo

| Eixo | Decisão |
|---|---|
| Tese | Instrumento de precisão: chrome recua, fluxo é protagonista |
| Cor | Grafite quase monocromático; Cobalto `#5B7CFA` único acento; semânticas só para estado |
| Assinatura | O Pulso — ponto percorrendo uma linha (4 usos, nunca mais que isso) |
| Tipografia | Geist Sans (UI) + Geist Mono (todo dado); pesos 400/500/600 |
| Forma | Flat, bordas 1px, raio 4–10px, sombra só em overlay |
| Movimento | 120–240ms, causal; reduced-motion sempre |
| Temas | Dark-first, light com paridade total |
| Regra de ouro | Se um elemento não ajuda o usuário a entender ou agir, ele sai |
