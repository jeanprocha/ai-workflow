---
target: interface inteira do app web (apps/web/src/app)
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-07-26T21-59-18Z
slug: apps-web-src-app
---
Method: dual-agent (A: design review com screenshots Playwright autenticados · B: detector determinístico)

# Critique — Workflow AI Platform (apps/web/src/app)

## Design Health Score — 23/40 (Aceitável)

| # | Heurística | Score | Issue-chave |
|---|-----------|-------|-----------|
| 1 | Visibilidade de status | 3 | Timestamps só absolutos; Analytics com 1 ponto de dado quase invisível |
| 2 | Correspondência com o mundo real | 1 | Títulos de página em inglês num app pt-BR; dicionário pt inteiro sem acentos |
| 3 | Controle e liberdade | 3 | Toasts de exclusão sem "Desfazer" |
| 4 | Consistência | 2 | Lixeira direta no card de agente vs kebab no de flow; pill de status sem ícone no card de flow; canvas claro em app escuro |
| 5 | Prevenção de erros | 3 | "Executar" não antecipa credencial ausente (execuções com Tokens/Custo "—") |
| 6 | Reconhecimento vs memorização | 3 | `⌘K` hardcoded mesmo em Linux/Windows |
| 7 | Flexibilidade e eficiência | 2 | Só ⌘K; zero bulk actions; executar exige abrir o editor |
| 8 | Estética e minimalismo | 3 | Nodes brancos no canvas; 7 botões primários em Templates; dashboard ~50% vazio |
| 9 | Recuperação de erros | 2 | Toasts genéricos ("Nao foi possivel criar o fluxo.") sem causa nem ação |
| 10 | Ajuda e documentação | 1 | Nenhum link de docs, tour, tooltip explicativo ou tela de atalhos |
| **Total** | | **23/40** | **Aceitável** |

## Veredito de especificidade

**LLM**: meio-termo — o sistema ("Instrumento de precisão") existe de verdade nos tokens, n'O Pulso (login, sidebar, dot ao vivo) e na disciplina mono-pra-dados; mas o canvas (tela-herói) renderiza nodes brancos num app escuro, e dashboard/executions leem como admin SaaS genérico. A língua trai o produto: títulos em inglês + pt sem nenhum acento em 17 dicionários.

**Detector**: 108 arquivos escaneados, apenas 2 findings, ambos advisory (`design-system-font-size`): `text-[9px]` em workflow-node.tsx:142 (rótulos de handle) e `text-[10px]` em topbar.tsx:33 (kbd ⌘K) — fora do ramp do DESIGN.md (mín. 11px). Nenhum anti-padrão real; o detector aplicou o DESIGN.md como contexto. Convergência notável: o código é limpo; os problemas são de julgamento/composição, não de higiene.

**Overlays**: pulados — nenhum browser conectado (extensão Claude in Chrome indisponível); scan de URL indisponível (puppeteer não instalado). Evidência visual veio de screenshots Playwright autenticados (13 telas, desktop + mobile).

## Impressão geral

Fundação 2026, execução 2019. A receita Linear/Vercel está toda no spec e nos tokens (grafite quase-mono, Geist, Cobalto escasso, ⌘K, flat com borda 1px) — mas as telas são esparsas onde deviam ser densas, paradas onde deviam ter movimento causal, e a tela mais importante do produto (canvas) ignora o tema. A maior oportunidade: corrigir o canvas + injetar densidade/movimento move a percepção de "template escuro" pra "instrumento".

## O que funciona

1. **Disciplina de tokens real** — tokens.css espelha o DESIGN.md fielmente; shell inteiro respeita flat/borda-antes-de-sombra.
2. **O Pulso como assinatura de verdade** — presente e escasso como a regra manda, com role="status".
3. **CRUD maduro** — autosave visível, confirms nomeando o objeto, estados de pending em tudo.

## Issues prioritários

1. **[P1] Canvas em tema claro dentro do app escuro** — `<ReactFlow>` sem `colorMode` (flow-editor.tsx:277) ganha classe `light` do React Flow que colide com o seletor `.light` do tokens.css e re-escopa todos os tokens: nodes brancos, minimap branco. Viola o DESIGN.md (node-card: bg-raised). Fix: `colorMode="dark"` (ou derivado do tema) + escopar `.light` a `html.light`. Comando: /impeccable polish.
2. **[P1] Mobile inutilizável** — sidebar fixa 240px em viewport 390px, conteúdo espremido em ~150px. DESIGN.md promete funcional até 768px com sidebar-drawer. Fix: breakpoint <768px → drawer + hamburger; tabelas com scroll horizontal. Comando: /impeccable adapt.
3. **[P1] Idioma quebrado** — dicionário pt sem diacríticos (0 ocorrências de ç/ã/é) + títulos de página em inglês ("Flows", "Executions", "Agents") dentro do próprio dicionário pt. Fix: revisão de acentuação em dictionaries/* + traduzir títulos. Comando: /impeccable clarify.
4. **[P2] 7 botões primários em Templates** — "Usar template" ×7 em Cobalto cheio viola "máx. 1 primário por vista" e dilui a cor-sinal. Fix: card clicável + ação outline/ghost. Comando: /impeccable polish.
5. **[P2] Foco de teclado invisível no editor** — botões com outline:none e ring transparente (verificado por computed style). Spec exige o mesmo ring em todo focável. Fix: focus-visible:ring nos botões de editor/topbar. Comando: /impeccable audit (a11y) → polish.

## Red flags por persona

**Alex (power user)**: único atalho é ⌘K (hardcoded ⌘ mesmo em Linux); zero bulk actions em Executions; coluna "Acoes" vazia em linhas de sucesso; executar fluxo exige abrir o editor; nenhum atalho no editor nem tela "?" de shortcuts.

**Sam (leitor de tela/teclado)**: ring de foco ausente em botões do editor; card de flow é <Link> envolvendo botão de kebab (interativo aninhado); positivo real: Pulse com role="status", badges cor+ícone+label, aria-label nos menus — a Regra da Redundância cumprida nas tabelas, exceto o pill "Ativo" do card de flow (único status sem ícone).

## Observações menores

- `STATUS_STYLE.archived` usa classe provavelmente inválida `text-text-muted` (flows/page.tsx:55).
- Ícone Sparkles no "Gerar com IA" — rejeitado nominalmente pelo DESIGN.md.
- "IA Requests" — label metade inglês metade português.
- Placeholder do palette trunca em telas estreitas.
- Detector: text-[9px]/text-[10px] fora do ramp (workflow-node.tsx:142, topbar.tsx:33) — decidir: sancionar micro-tipografia no DESIGN.md ou subir pro ramp.
- Analytics com poucos dados vira dot solto sem eixos — anticlímax logo após o momento-uau do "Gerar com IA".
- Timestamps absolutos 3× seguidas em tabelas; "há 2 min" é produto vivo.

## Perguntas a considerar

1. Se o canvas é o coração do produto, por que é a única superfície que ignora o tema?
2. Qual é a tela do "dia 30" do power user? O dashboard responde "quantos fluxos tenho", não "o que quebrou hoje e quanto estou gastando".
3. O Pulso já foi visto correndo numa edge durante execução real? Se a assinatura só existe parada, é logo, não pulso.
