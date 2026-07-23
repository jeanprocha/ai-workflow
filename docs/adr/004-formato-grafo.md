# ADR-004: Formato do grafo de workflow

Status: Aceito
Data: 2026-07-23

## Contexto

O grafo de um workflow precisa ser: (1) editável visualmente no React Flow, (2) persistido e versionado no banco, (3) validável e executável pela engine, e (4) gerável por IA (Fase 11 — Autocomplete).

## Decisão

O grafo é um **JSON próprio versionado**, compatível 1:1 com a estrutura do React Flow, definido em `packages/shared/src/graph.ts`:

```ts
interface WorkflowGraph {
  nodes: WorkflowNode[]; // id, type, category, label, position, config
  edges: WorkflowEdge[]; // id, source, target, handles
  viewport: { x: number; y: number; zoom: number };
}
```

Esse JSON é o `graph` de `workflow_versions`. O mesmo schema Zod que valida `config` de cada node (definido no `NodeDefinition` em `packages/nodes`) é usado para gerar o formulário no editor e para validar antes da execução — inclusive quando o grafo vem de um LLM (Fase 11).

## Alternativas consideradas

- **DSL textual próprio (YAML/similar estilo GitHub Actions)**: mais legível fora do editor, mas exige um parser/serializer adicional e não mapeia diretamente para o React Flow — duplicaria a fonte da verdade.
- **Formato de terceiros (ex.: schema de outra ferramenta de automação)**: acopla a plataforma a decisões de design externas e dificulta o diferencial de nodes de IA multi-provider do spec.

## Consequências

- React Flow consome o grafo praticamente sem transformação.
- Geração de workflow por IA (Fase 11) e validação de config de node reaproveitam a mesma definição de schema — um único lugar para evoluir o contrato.
- Mudanças de formato exigem migração de `workflow_versions.graph_json` existentes; versionar o formato do grafo em si (`graph_version`) se isso vier a ser necessário.
