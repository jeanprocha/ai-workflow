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
import { toast } from "sonner";
import type { NodeRetryPolicy, WorkflowGraph } from "@workflow/shared";
import { NODE_TYPES, type WorkflowFlowNode } from "./workflow-node";
import { EDGE_TYPES } from "./pulse-edge";
import { NodePalette } from "./node-palette";
import { ConfigPanel } from "./config-panel";
import { EditorToolbar } from "./editor-toolbar";
import { useSaveGraph, useWorkflow } from "@/hooks/use-workflows";
import { useExecutionStream } from "@/hooks/use-execution-stream";
import { getCatalogEntry } from "@/lib/node-catalog";
import { ApiError } from "@/lib/api-client";
import { useDictionary } from "@/lib/i18n";
import { useTheme } from "@/hooks/use-theme";

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
        onError: node.onError,
      },
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      type: "pulse",
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
      onError: node.data.onError,
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
  const theme = useTheme();
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

  // So marca "dirty" — o save so acontece quando o usuario pede (botao
  // Salvar ou Ctrl+S), ver handleSave abaixo. Sem debounce/PUT automatico
  // (padrao Make/n8n: o usuario decide quando publicar a mudanca).
  const markDirty = useCallback(() => setSaveState("dirty"), []);

  const handleSave = useCallback(() => {
    setSaveState("saving");
    saveGraph.mutate(flowToGraph(nodes, edges, viewport), {
      onSuccess: () => {
        // NAO pre-marcamos loadedVersionNumber aqui (como a versao antiga
        // fazia): deixamos o effect de sync (acima) reaplicar o grafo que
        // voltou do servidor por cima do estado local — e assim que campos
        // gerados no backend (ex.: chatToken/inboxToken/webhookId) aparecem
        // no painel de configuracao sem precisar recarregar a pagina. Sem
        // risco do loop antigo: como o save so dispara por acao explicita do
        // usuario (nunca mais a partir de onNodesChange), o remede de
        // dimensoes que essa troca de objetos causa nao pode re-disparar
        // outro save sozinho.
        setSaveState("saved");
      },
      onError: (error) => {
        setSaveState("dirty");
        toast.error(error instanceof ApiError ? error.message : t.editor.toolbar.saveErrorFallback);
      },
    });
  }, [nodes, edges, viewport, saveGraph, t]);

  // Ctrl/Cmd+S salva sem precisar clicar no botao (mesmo atalho do Make/n8n).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (saveStateRef.current === "dirty") handleSave();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  const onNodesChange: OnNodesChange<WorkflowFlowNode> = useCallback(
    (changes) => {
      // "dimensions" (medicao inicial de tamanho pelo ResizeObserver do
      // React Flow, dispara pra TODO node ao montar/trocar de identidade) e
      // "select" (clique pra selecionar, so estado de UI) nunca sao
      // persistidos — flowToGraph so grava id/type/label/position/config/
      // retry. Sem filtrar esses dois tipos, so ABRIR um fluxo ja salvo (ou
      // so clicar num node) marcava "alteracoes nao salvas" sem nenhuma
      // edicao real do usuario (achado ao vivo pela suite E2E).
      const persistable = changes.some(
        (change) => change.type !== "dimensions" && change.type !== "select",
      );
      if (persistable) markDirty();
      setNodes((current) => applyNodeChanges(changes, current));
    },
    [markDirty],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      markDirty();
      setEdges((current) => applyEdgeChanges(changes, current));
    },
    [markDirty],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      markDirty();
      setEdges((current) => addEdge({ ...connection, id: nanoid(8), type: "pulse" }, current));
    },
    [markDirty],
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

      markDirty();
      setNodes((current) => [...current, newNode]);
    },
    [screenToFlowPosition, markDirty],
  );

  function updateSelectedNodeConfig(config: Record<string, unknown>) {
    markDirty();
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNodeId ? { ...node, data: { ...node.data, config } } : node,
      ),
    );
  }

  function updateSelectedNodeRetry(retry: NodeRetryPolicy | undefined) {
    markDirty();
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNodeId ? { ...node, data: { ...node.data, retry } } : node,
      ),
    );
  }

  function updateSelectedNodeOnError(onError: "branch" | undefined) {
    markDirty();
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNodeId ? { ...node, data: { ...node.data, onError } } : node,
      ),
    );
    // Desabilitar sem remover a edge deixaria uma edge "error" pendurada sem
    // handle correspondente no node (invisivel no canvas, mas ainda salva).
    if (!onError) {
      setEdges((current) =>
        current.filter(
          (edge) => !(edge.source === selectedNodeId && edge.sourceHandle === "error"),
        ),
      );
    }
  }

  const nodesWithStatus = nodes.map((node) => ({
    ...node,
    data: { ...node.data, status: nodeStatuses[node.id] },
  }));

  // A edge herda o estado do node de DESTINO: e por ela que os dados estao
  // entrando naquele node agora. E o unico momento em que O Pulso corre.
  const edgesWithStatus = edges.map((edge) => ({
    ...edge,
    type: "pulse",
    data: { ...edge.data, status: nodeStatuses[edge.target] },
  }));

  const selectedNode = nodesWithStatus.find((node) => node.id === selectedNodeId) ?? null;

  return (
    <div className="flex h-screen w-full flex-col">
      <EditorToolbar
        workflowId={workflowId}
        name={workflow?.name ?? t.common.loading}
        saveState={saveState}
        onSave={handleSave}
        onRunStarted={setExecutionId}
        currentVersionId={workflow?.currentVersion?.id ?? null}
      />
      <div className="flex flex-1 overflow-hidden">
        <NodePalette />
        <div className="flex-1" onDrop={onDrop} onDragOver={(event) => event.preventDefault()}>
          <ReactFlow
            nodes={nodesWithStatus}
            edges={edgesWithStatus}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            defaultViewport={viewport}
            proOptions={{ hideAttribution: true }}
            // Sem isso o React Flow assume "light" e coloca a classe `light`
            // no proprio wrapper — que casava com o seletor `.light` do
            // tokens.css e reescopava TODOS os tokens dentro do canvas
            // (nodes brancos num app escuro).
            colorMode={theme}
            fitView
            // Sem maxZoom, um grafo de 1-2 nodes era ampliado a ponto de o
            // card ocupar meia tela — o zoom precisa caber o grafo, nao
            // esticar o node ate o limite da viewport.
            fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
          >
            <Background />
            <Controls showInteractive={false} />
            {/* Minimap comia um quarto da tela no celular sem ajudar a navegar. */}
            <MiniMap pannable zoomable className="!hidden !bg-card md:!block" />
          </ReactFlow>
        </div>
        {selectedNode && (
          <ConfigPanel
            key={selectedNode.id}
            node={selectedNode}
            retry={selectedNode.data.retry}
            onChange={updateSelectedNodeConfig}
            onRetryChange={updateSelectedNodeRetry}
            onError={selectedNode.data.onError}
            onOnErrorChange={updateSelectedNodeOnError}
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
