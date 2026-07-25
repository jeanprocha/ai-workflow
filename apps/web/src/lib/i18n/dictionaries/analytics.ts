export const pt = {
  title: "Analytics",
  description: "Metricas agregadas de execucao e uso de IA nos ultimos 14 dias.",
  providerLabels: {
    openai: "OpenAI",
    anthropic: "Claude",
    gemini: "Gemini",
    ollama: "Ollama",
    desconhecido: "Desconhecido",
  },
  metrics: {
    executions: "Execucoes",
    failureRate: "Taxa de falha",
    tokensTotal: "Tokens totais",
    costTotal: "Custo IA total",
  },
  charts: {
    executionsByDay: "Execucoes por dia",
    failuresByDay: "Falhas por dia",
    costByProvider: "Custo de IA por provider",
    noDataInPeriod: "Sem dados no periodo.",
    noData: "Sem dados.",
  },
};

export const en = {
  title: "Analytics",
  description: "Aggregated execution and AI usage metrics over the last 14 days.",
  providerLabels: {
    openai: "OpenAI",
    anthropic: "Claude",
    gemini: "Gemini",
    ollama: "Ollama",
    desconhecido: "Unknown",
  },
  metrics: {
    executions: "Executions",
    failureRate: "Failure rate",
    tokensTotal: "Total tokens",
    costTotal: "Total AI cost",
  },
  charts: {
    executionsByDay: "Executions per day",
    failuresByDay: "Failures per day",
    costByProvider: "AI cost by provider",
    noDataInPeriod: "No data for this period.",
    noData: "No data.",
  },
} satisfies typeof pt;
