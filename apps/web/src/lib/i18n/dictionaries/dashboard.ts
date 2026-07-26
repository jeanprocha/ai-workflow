export const pt = {
  title: "Dashboard",
  description: "Visão geral da plataforma.",
  metrics: {
    workflows: "Fluxos",
    executions: "Execuções",
    aiRequests: "Requisições de IA",
    avgDuration: "Tempo médio",
    failures: "Falhas",
    aiCost: "Custo IA",
  },
  recentExecutions: {
    title: "Execuções recentes",
    viewAll: "Ver todas",
    columns: {
      workflow: "Fluxo",
      status: "Status",
      duration: "Duração",
      startedAt: "Iniciado",
    },
    empty: {
      title: "Nenhuma execução ainda",
      description: "Execute um fluxo para ver o histórico aqui.",
    },
  },
};

export const en = {
  title: "Dashboard",
  description: "Platform overview.",
  metrics: {
    workflows: "Workflows",
    executions: "Executions",
    aiRequests: "AI Requests",
    avgDuration: "Avg. duration",
    failures: "Failures",
    aiCost: "AI Cost",
  },
  recentExecutions: {
    title: "Recent executions",
    viewAll: "View all",
    columns: {
      workflow: "Workflow",
      status: "Status",
      duration: "Duration",
      startedAt: "Started",
    },
    empty: {
      title: "No executions yet",
      description: "Run a workflow to see history here.",
    },
  },
} satisfies typeof pt;
