export const pt = {
  title: "Fluxos",
  description: "Automações visuais construídas com nodes independentes.",
  generateWithAi: "Gerar com IA",
  createFlow: "Criar fluxo",
  nameLabel: "Nome",
  statusLabel: {
    draft: "Rascunho",
    active: "Ativo",
    archived: "Arquivado",
  },
  emptyState: {
    title: "Nenhum fluxo ainda",
    description:
      "Descreva o que você precisa e a IA monta o fluxo, ou comece do zero / por um template.",
  },
  updatedAtPrefix: "Atualizado",
  menu: {
    rename: "Renomear",
    archive: "Arquivar",
    activate: "Ativar",
    /** Prefixo do aria-label do trigger do menu — concatenado com o nome do fluxo. */
    triggerAria: "Ações do fluxo",
  },
  toasts: {
    created: "Fluxo criado.",
    createError: "Não foi possível criar o fluxo.",
    generateError: "Não foi possível gerar o fluxo.",
    generatedSaved: "Fluxo gerado e salvo.",
    generateSaveError: "Não foi possível salvar o fluxo gerado.",
    renamed: "Fluxo renomeado.",
    renameError: "Não foi possível renomear o fluxo.",
    deleted: "Fluxo excluído.",
    deleteError: "Não foi possível excluir o fluxo.",
    activated: "Fluxo ativado.",
    archived: "Fluxo arquivado.",
    statusError: "Não foi possível atualizar o status.",
  },
  createDialog: {
    namePlaceholder: "Ex: Suporte IA",
  },
  generateDialog: {
    title: "Gerar fluxo com IA",
    description: "Descreva o que o fluxo deve fazer e a IA gera o grafo pra você revisar.",
    promptLabel: "Descreva o que o fluxo deve fazer",
    promptPlaceholder:
      "Ex: Quando chegar um email com boleto, extraia os dados, grave no banco, responda confirmando e envie no Slack.",
    generate: "Gerar",
    generating: "Gerando...",
    previewSummary: (nodeCount: number, edgeCount: number) =>
      `${nodeCount} node(s), ${edgeCount} conexão(ões). Revise antes de salvar — você poderá editar tudo no canvas depois.`,
    regenerate: "Gerar de novo",
    accept: "Aceitar e criar fluxo",
    defaultName: "Fluxo gerado por IA",
  },
  renameDialog: {
    title: "Renomear fluxo",
  },
  deleteDialog: {
    title: (name: string | undefined) => `Excluir o fluxo “${name}”?`,
    description:
      "Todas as versões e o histórico de execuções deste fluxo serão perdidos. Esta ação não pode ser desfeita.",
  },
};

export const en = {
  title: "Flows",
  description: "Visual automations built with independent nodes.",
  generateWithAi: "Generate with AI",
  createFlow: "Create flow",
  nameLabel: "Name",
  statusLabel: {
    draft: "Draft",
    active: "Active",
    archived: "Archived",
  },
  emptyState: {
    title: "No flows yet",
    description:
      "Describe what you need and AI builds the flow, or start from scratch / from a template.",
  },
  updatedAtPrefix: "Updated",
  menu: {
    rename: "Rename",
    archive: "Archive",
    activate: "Activate",
    triggerAria: "Flow actions",
  },
  toasts: {
    created: "Flow created.",
    createError: "Could not create the flow.",
    generateError: "Could not generate the flow.",
    generatedSaved: "Flow generated and saved.",
    generateSaveError: "Could not save the generated flow.",
    renamed: "Flow renamed.",
    renameError: "Could not rename the flow.",
    deleted: "Flow deleted.",
    deleteError: "Could not delete the flow.",
    activated: "Flow activated.",
    archived: "Flow archived.",
    statusError: "Could not update the status.",
  },
  createDialog: {
    namePlaceholder: "e.g. AI Support",
  },
  generateDialog: {
    title: "Generate flow with AI",
    description: "Describe what the flow should do and AI generates the graph for you to review.",
    promptLabel: "Describe what the flow should do",
    promptPlaceholder:
      "e.g. When an invoice email arrives, extract the data, save it to the database, reply confirming and send it on Slack.",
    generate: "Generate",
    generating: "Generating...",
    previewSummary: (nodeCount: number, edgeCount: number) =>
      `${nodeCount} node(s), ${edgeCount} connection(s). Review before saving — you'll be able to edit everything in the canvas afterward.`,
    regenerate: "Generate again",
    accept: "Accept and create flow",
    defaultName: "AI-generated flow",
  },
  renameDialog: {
    title: "Rename flow",
  },
  deleteDialog: {
    title: (name: string | undefined) => `Delete the flow “${name}”?`,
    description:
      "All versions and the execution history of this flow will be lost. This action cannot be undone.",
  },
} satisfies typeof pt;
