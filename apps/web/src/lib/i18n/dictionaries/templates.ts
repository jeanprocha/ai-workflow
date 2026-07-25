export const pt = {
  title: "Templates",
  description: "Fluxos prontos para usar como ponto de partida.",
  emptyTitle: "Nenhum template disponivel",
  emptyDescription: "Os templates oficiais aparecerao aqui assim que forem publicados.",
  useButton: "Usar template",
  useSuccessToast: (workflowName: string) => `Fluxo "${workflowName}" criado a partir do template.`,
  useErrorFallback: "Nao foi possivel usar este template.",
};

export const en = {
  title: "Templates",
  description: "Ready-to-use flows to get you started.",
  emptyTitle: "No templates available",
  emptyDescription: "Official templates will appear here once they're published.",
  useButton: "Use template",
  useSuccessToast: (workflowName: string) => `Flow "${workflowName}" created from template.`,
  useErrorFallback: "Could not use this template.",
} satisfies typeof pt;
