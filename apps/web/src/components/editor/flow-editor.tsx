"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  Controls,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  type Edge,
  type OnConnect,
  type OnNodesChange,
  type OnEdgesChange,
  type Viewport,
} from "@xyflow/react";
import { nanoid } from "nanoid";
import type { NodeRetryPolicy, WorkflowGraph } from "@workflow/shared";
import { NODE_TYPES, type WorkflowFlowNode } from "./workflow-node";
import { NodePalette } from "./node-palette";
import { ConfigPanel } from "./config-panel";
import { EditorToolbar } from "./editor-toolbar";
import { useSaveGraph, useWorkflow } from "@/hooks/use-workflows";
import { useExecutionStream } from "@/hooks/use-execution-stream";
import { getCatalogEntry } from "@/lib/node-catalog";
import { useDictionary } from "@/lib/i18n";

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

function graphToFlow(graph: WorkflowGraph): { nodes: WorkflowFlowNode[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: "workflowNode",
      position: node.position,
      data: {
        label: node.label,
        nodeType: node.type,
        category: node.category,
        config: node.config,
        retry: node.retry,
      },
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    })),
  };
}

function flowToGraph(
  nodes: WorkflowFlowNode[],
  edges: Edge[],
  viewport: Viewport,
): WorkflowGraph {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.nodeType,
      category: node.data.category,
      label: node.data.label,
      position: node.position,
      config: node.data.config,
      retry: node.data.retry,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? undefined,
      targetHandle: edge.targetHandle ?? undefined,
    })),
    viewport,
  };
}

function FlowEditorInner({ workflowId }: { workflowId: string }) {
  const t = useDictionary();
  const { data: workflow } = useWorkflow(workflowId);
  const saveGraph = useSaveGraph(workflowId);
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes] = useState<WorkflowFlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">("saved");
  const [executionId, setExecutionId] = useState<string | null>(null);
  // Numero de versao (nao id) de proposito: o id so diz "e diferente da
  // ultima", nao "e mais novo" — uma resposta atrasada com versionNumber
  // menor que a que ja aplicamos e ignorada, nao importa a ordem de chegada.
  const loadedVersionNumber = useRef<number>(-1);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Espelha saveState pra ler o valor ATUAL dentro do effect de sync abaixo
  // sem precisar dele nas deps (isso faria o effect re-rodar a cada
  // transicao de estado, nao so quando `workflow` muda). Atualizado num
  // effect proprio, nao durante o render (refs nao devem ser escritas em
  // render — react-hooks/refs).
  const saveStateRef = useRef(saveState);
  useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);

  const { nodeStatuses } = useExecutionStream(executionId);

  useEffect(() => {
    const version = workflow?.currentVersion;
    if (!version || version.versionNumber <= loadedVersionNumber.current) return;
    // O GET inicial (disparado no mount) pode ser mais lento que um usuario
    // dropar um node ou editar um campo nos primeiros instantes da pagina —
    // se isso acontecer, `saveState` ja vira "dirty"/"saving" ANTES dessa
    // resposta atrasada chegar. Sem essa guarda, o efeito aplicaria o grafo
    // antigo (o que veio no GET, sem a edicao) por cima do estado local,
    // apagando a edicao que o usuario acabou de fazer — mesmo sendo,
    // tecnicamente, "a primeira versao valida que vimos" (achado ao vivo
    // pela suite E2E: um node dropado sumia sozinho ~1s depois de aparecer).
    // So sincroniza quando nao ha edicao local pendente.
    if (saveStateRef.current !== "saved") return;
    loadedVersionNumber.current = version.versionNumber;
    const graph = version.graph as unknown as WorkflowGraph;
    const flow = graphToFlow(graph);
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setViewport(graph.viewport ?? DEFAULT_VIEWPORT);
  }, [workflow]);

  const scheduleSave = useCallback(
    (nextNodes: WorkflowFlowNode[], nextEdges: Edge[]) => {
      setSaveState("dirty");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        setSaveState("saving");
        saveGraph.mutate(flowToGraph(nextNodes, nextEdges, viewport), {
          onSuccess: (data) => {
            // Cada save cria uma versao nova no servidor — useSaveGraph.
            // onSuccess atualiza o cache de useWorkflow() com essa resposta,
            // o que reexecutaria o effect de sync acima e substituiria
            // nodes/edges por objetos NOVOS vindos do servidor. O React Flow
            // trata isso como troca completa de identidade dos nodes, remede
            // dimensoes e dispara onNodesChange de novo — que chama
            // scheduleSave outra vez, criando um loop de save infinito
            // (achado ao vivo: 23 PUT /graph pra UMA unica marcacao de
            // checkbox). Marcar a versao como "ja carregada" aqui, antes do
            // effect rodar, corta o loop: o echo do nosso proprio save nunca
            // re-sincroniza o canvas.
            if (data.currentVersion && data.currentVersion.versionNumber > loadedVersionNumber.current) {
              loadedVersionNumber.current = data.currentVersion.versionNumber;
            }
            setSaveState("saved");
          },
          onError: () => setSaveState("dirty"),
        });
      }, 800);
    },
    [saveGraph, viewport],
  );

  const onNodesChange: OnNodesChange<WorkflowFlowNode> = useCallback(
    (changes) => {
      setNodes((current) => {
        const next = applyNodeChanges(changes, current);
        // "dimensions" (medicao inicial de tamanho pelo ResizeObserver do
        // React Flow, dispara pra TODO node ao montar) e "select" (clique
        // pra selecionar, so estado de UI) nunca sao persistidos —
        // flowToGraph so grava id/type/label/position/config/retry. Sem
        // filtrar esses dois tipos, so ABRIR um fluxo ja salvo disparava um
        // autosave (e uma versao nova) sem nenhuma edicao real do usuario
        // (achado ao vivo pela suite E2E: numero de versao avancava sozinho).
        const persistable = changes.some(
          (change) => change.type !== "dimensions" && change.type !== "select",
        );
        if (persistable) scheduleSave(next, edges);
        return next;
      });
    },
    [edges, scheduleSave],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      setEdges((current) => {
        const next = applyEdgeChanges(changes, current);
        scheduleSave(nodes, next);
        return next;
      });
    },
    [nodes, scheduleSave],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      setEdges((current) => {
        const next = addEdge({ ...connection, id: nanoid(8) }, current);
        scheduleSave(nodes, next);
        return next;
      });
    },
    [nodes, scheduleSave],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData("application/x-workflow-node");
      const entry = getCatalogEntry(nodeType);
      if (!entry) return;

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const newNode: WorkflowFlowNode = {
        id: nanoid(8),
        type: "workflowNode",
        position,
        data: {
          label: entry.label,
          nodeType: entry.type,
          category: entry.category,
          config: { ...entry.defaultConfig },
        },
      };

      console.log("DEBUG onDrop", nodeType, position);
      setNodes((current) => {
        const next = [...current, newNode];
        console.log("DEBUG onDrop setNodes", next.length);
        scheduleSave(next, edges);
        return next;
      });
    },
    [edges, screenToFlowPosition, scheduleSave],
  );

  function updateSelectedNodeConfig(config: Record<string, unknown>) {
    setNodes((current) => {
      const next = current.map((node) =>
        node.id === selectedNodeId ? { ...node, data: { ...node.data, config } } : node,
      );
      scheduleSave(next, edges);
      return next;
    });
  }

  function updateSelectedNodeRetry(retry: NodeRetryPolicy | undefined) {
    setNodes((current) => {
      const next = current.map((node) =>
        node.id === selectedNodeId ? { ...node, data: { ...node.data, retry } } : node,
      );
      scheduleSave(next, edges);
      return next;
    });
  }

  const nodesWithStatus = nodes.map((node) => ({
    ...node,
    data: { ...node.data, status: nodeStatuses[node.id] },
  }));

  const selectedNode = nodesWithStatus.find((node) => node.id === selectedNodeId) ?? null;

  return (
    <div className="flex h-screen w-full flex-col">
      <EditorToolbar
        workflowId={workflowId}
        name={workflow?.name ?? t.common.loading}
        saveState={saveState}
        onRunStarted={setExecutionId}
        currentVersionId={workflow?.currentVersion?.id ?? null}
      />
      <div className="flex flex-1 overflow-hidden">
        <NodePalette />
        <div className="flex-1" onDrop={onDrop} onDragOver={(event) => event.preventDefault()}>
          <ReactFlow
            nodes={nodesWithStatus}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            defaultViewport={viewport}
            proOptions={{ hideAttribution: true }}
            fitView
          >
            <Background />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!bg-card" />
          </ReactFlow>
        </div>
        {selectedNode && (
          <ConfigPanel
            key={selectedNode.id}
            node={selectedNode}
            retry={selectedNode.data.retry}
            onChange={updateSelectedNodeConfig}
            onRetryChange={updateSelectedNodeRetry}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  );
}

export function FlowEditor({ workflowId }: { workflowId: string }) {
  return (
    <ReactFlowProvider>
      <FlowEditorInner workflowId={workflowId} />
    </ReactFlowProvider>
  );
}
