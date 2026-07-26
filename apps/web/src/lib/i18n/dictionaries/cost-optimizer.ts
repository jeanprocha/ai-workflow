export const pt = {
  title: "Otimizador de Custo",
  description:
    "Analisa o histórico real de execuções (últimos 30 dias) e sugere trocar por um modelo mais barato quando isso não compromete a tarefa.",
  analyze: "Analisar",
  analyzing: "Analisando...",
  emptyNotAnalyzed: {
    title: "Ainda não analisado",
    description:
      "Clique em Analisar para ver oportunidades reais de economia com base no que os seus fluxos já rodaram.",
  },
  emptyNoOpportunities: {
    title: "Nenhuma oportunidade encontrada",
    description:
      "Ou os fluxos já usam modelos econômicos, ou ainda não há volume suficiente de execuções (mínimo 3 por node) nos últimos 30 dias.",
  },
  appliedToast: "Modelo trocado — uma nova versão do fluxo foi salva.",
  applyErrorFallback: "Não foi possível aplicar esta sugestão.",
  swapFrom: "Trocar",
  swapTo: "por",
  basedOn: (sampleSize: number, avgCostUsd: string) =>
    `Baseado em ${sampleSize} execuções · custo médio atual ${avgCostUsd}`,
};

export const en = {
  title: "Cost Optimizer",
  description:
    "Analyzes the real execution history (last 30 days) and suggests switching to a cheaper model when it doesn't compromise the task.",
  analyze: "Analyze",
  analyzing: "Analyzing...",
  emptyNotAnalyzed: {
    title: "Not analyzed yet",
    description:
      "Click Analyze to see real savings opportunities based on what your flows have already run.",
  },
  emptyNoOpportunities: {
    title: "No opportunities found",
    description:
      "Either your flows already use economical models, or there isn't enough execution volume yet (minimum 3 per node) in the last 30 days.",
  },
  appliedToast: "Model switched — a new flow version was saved.",
  applyErrorFallback: "Could not apply this suggestion.",
  swapFrom: "Swap",
  swapTo: "for",
  basedOn: (sampleSize: number, avgCostUsd: string) =>
    `Based on ${sampleSize} executions · current average cost ${avgCostUsd}`,
} satisfies typeof pt;
