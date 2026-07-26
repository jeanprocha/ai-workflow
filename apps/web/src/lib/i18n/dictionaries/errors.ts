export const pt = {
  boundary: {
    title: "Algo deu errado",
    description: "Um erro inesperado interrompeu esta tela. Você pode tentar novamente.",
    retry: "Tentar novamente",
    backHome: "Voltar ao início",
  },
  editorBoundary: {
    title: "O editor encontrou um erro",
    description:
      "Algo interrompeu o editor de fluxo. Suas alterações salvas não foram perdidas.",
    retry: "Tentar novamente",
    backToFlows: "Voltar para Fluxos",
  },
  global: {
    title: "Algo deu errado",
    description: "A aplicação encontrou um erro inesperado. Tente recarregar a página.",
    retry: "Tentar novamente",
  },
};

export const en = {
  boundary: {
    title: "Something went wrong",
    description: "An unexpected error interrupted this screen. You can try again.",
    retry: "Try again",
    backHome: "Back to home",
  },
  editorBoundary: {
    title: "The editor ran into an error",
    description: "Something interrupted the flow editor. Your saved changes are safe.",
    retry: "Try again",
    backToFlows: "Back to Flows",
  },
  global: {
    title: "Something went wrong",
    description: "The application ran into an unexpected error. Try reloading the page.",
    retry: "Try again",
  },
} satisfies typeof pt;
