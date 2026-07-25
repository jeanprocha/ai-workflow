export const pt = {
  title: "Dashboard",
  description: "Visao geral da plataforma.",
  metrics: {
    workflows: "Fluxos",
    executions: "Execucoes",
    aiRequests: "IA Requests",
    avgDuration: "Tempo medio",
    failures: "Falhas",
    aiCost: "Custo IA",
  },
  recentExecutions: {
    title: "Execucoes recentes",
    viewAll: "Ver todas",
    columns: {
      workflow: "Fluxo",
      status: "Status",
      duration: "Duracao",
      startedAt: "Iniciado",
    },
    empty: {
      title: "Nenhuma execucao ainda",
      description: "Execute um fluxo para ver o historico aqui.",
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
