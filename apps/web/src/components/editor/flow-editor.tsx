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
  const { data: workflow } = useWorkflow(workflowId);
  const saveGraph = useSaveGraph(workflowId);
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes] = useState<WorkflowFlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">("saved");
  const [executionId, setExecutionId] = useState<string | null>(null);
  const loadedVersionId = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { nodeStatuses } = useExecutionStream(executionId);

  useEffect(() => {
    const version = workflow?.currentVersion;
    if (!version || loadedVersionId.current === version.id) return;
    loadedVersionId.current = version.id;
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
          onSuccess: () => setSaveState("saved"),
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
        scheduleSave(next, edges);
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

      setNodes((current) => {
        const next = [...current, newNode];
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
        name={workflow?.name ?? "Carregando..."}
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
