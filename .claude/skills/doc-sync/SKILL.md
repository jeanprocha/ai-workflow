---
name: doc-sync
description: Audita e corrige a defasagem entre a documentação de sistema (docs/sistema/) e o código. Use quando o usuário pedir para verificar, auditar, sincronizar ou atualizar a documentação, quando quiser saber se a doc está em dia, ou ao fechar uma entrega grande antes de commitar. Compara o carimbo de revisão de cada doc com o histórico do git dos arquivos que ele cobre.
user-invocable: true
argument-hint: "[domínio específico | vazio para auditar tudo]"
---

# Sincronização da documentação de sistema

Cada documento em `docs/sistema/` carrega no topo um carimbo:

```
> Última revisão: AAAA-MM-DD · commit `abc1234`
```

Esse carimbo é a âncora da auditoria: tudo que mudou nos arquivos daquele domínio depois daquele commit é defasagem em potencial.

## Como o mapa domínio → arquivos é construído

A seção **"Onde vive"** de cada doc lista os arquivos, rotas, models e filas do domínio. Ela é o mapa. Extraia dela os caminhos de arquivo e diretório de cada doc — não mantenha uma lista paralela em lugar nenhum, ela ficaria desatualizada exatamente como a doc que estamos auditando.

Quando a seção listar um arquivo específico (`apps/api/src/engine/engine.service.ts`), use o caminho. Quando o domínio for uma pasta inteira, use a pasta (`apps/api/src/approvals/`).

## Procedimento

**1. Detectar defasagem.** Para cada doc de `docs/sistema/` (exceto `00-visao-geral.md`, tratado no passo 4), leia o carimbo e rode:

```bash
git log --oneline <commit-do-carimbo>..HEAD -- <caminhos do domínio>
```

Sem commits, o domínio está em dia. Com commits, ele é candidato — mas nem todo commit é mudança funcional.

**Cuidado com os caminhos.** Muitos contêm os grupos de rota do Next (`apps/web/src/app/(app)/...`); sem aspas, os parênteses quebram o shell e o `git log` devolve vazio — a auditoria reporta "nenhuma defasagem" em tudo e você acredita. Passe os caminhos como array entre aspas, e desconfie de um resultado zerado em todos os domínios: valide rodando um `git log` isolado num domínio que você sabe que mudou.

**2. Triar.** Leia o diff de cada commit candidato e classifique:

- **Conta**: rota nova ou removida, model novo no Prisma, fila nova, mudança de comportamento observável, limitação que deixou de existir, arquivo-chave novo ou removido.
- **Não conta**: refactor interno, renomeação, ajuste de estilo, teste, mudança que não altera nada do que o doc afirma.

Se só houver mudanças da segunda categoria, **atualize apenas o carimbo** e siga. Não reescreva prosa que continua correta.

**3. Atualizar.** Para os domínios com mudança real, edite o que ficou errado e carimbe com a data de hoje e o `HEAD` atual. Mantenha o estilo do documento: prosa em português-BR, docs finos (conceito e mapa, não contrato copiado), evidência `arquivo:linha`, e a seção "Limitações e fora de escopo" nunca vazia. Se uma limitação deixou de existir, remova-a de lá — essa seção envelhece tão rápido quanto o resto.

**4. Procurar domínio órfão.** Compare o que existe com o que está documentado:

- Cada diretório de módulo em `apps/api/src/` deve aparecer em algum doc.
- Cada rota de página em `apps/web/src/app/` também.
- Cada model em `apps/api/prisma/schema.prisma` também.
- Cada fila declarada em `apps/api/src/queue/queue.module.ts` também.

O que não aparecer em lugar nenhum é um domínio novo ou um pedaço esquecido. Se for pequeno, encaixe no doc mais próximo; se for um domínio de verdade, crie o doc no mesmo formato e adicione ao índice em `docs/README.md` **e** à tabela de domínios em `docs/sistema/00-visao-geral.md`.

**5. Conferir os links.** Todo link relativo entre docs deve resolver. É barato verificar e caro descobrir quebrado depois.

**6. Relatar.** Termine com um resumo curto: quais domínios estavam defasados e o que mudou em cada um, quais só receberam carimbo novo, e o que você encontrou mas decidiu não mexer (com o motivo). Se achou divergência entre a doc e o código que não é defasagem e sim bug — a doc descreve o comportamento pretendido e o código faz outra coisa — **não conserte o código**: reporte separadamente.

## Limites

Só toque em `docs/sistema/`, `docs/README.md` e `CLAUDE.md`. Os documentos de `docs/produto/` e `docs/adr/` são imutáveis por convenção do projeto: decisão que mudou vira ADR novo, nunca edição do antigo. Se durante a auditoria ficar claro que um ADR está defasado, registre isso na seção "Decisões e histórico" do doc de sistema correspondente e avise o usuário — não edite o ADR.

## Escopo parcial

Se o usuário passar um domínio específico como argumento ("doc-sync engine", "doc-sync aprovação"), audite só esse doc e pule o passo 4.
