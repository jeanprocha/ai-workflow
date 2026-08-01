export const pt = {
  title: "Templates",
  description: "Fluxos prontos para usar como ponto de partida.",
  emptyTitle: "Nenhum template disponível",
  emptyDescription: "Os templates oficiais aparecerão aqui assim que forem publicados.",
  useButton: "Usar template",
  useSuccessToast: (workflowName: string) => `Fluxo "${workflowName}" criado a partir do template.`,
  useErrorFallback: "Não foi possível usar este template.",
  searchPlaceholder: "Buscar templates...",
  categoryFilterAria: "Filtrar por categoria",
  allCategories: "Todas as categorias",
  badgeGlobal: "Oficial",
  badgeWorkspace: "Meu workspace",
  filteredEmptyTitle: "Nenhum template encontrado",
  filteredEmptyDescription: "Ajuste a busca ou a categoria para ver outros templates.",
  menu: {
    /** Prefixo do aria-label do trigger do menu — concatenado com o nome do template. */
    triggerAria: "Ações do template",
    edit: "Editar",
  },
  editDialog: {
    title: "Editar template",
    nameLabel: "Nome",
    categoryLabel: "Categoria",
    descriptionLabel: "Descrição",
    saved: "Template atualizado.",
    error: "Não foi possível atualizar o template.",
  },
  deleteDialog: {
    title: (name: string | undefined) => `Excluir o template "${name}"?`,
    description: "Fluxos já criados a partir dele não são afetados. Esta ação não pode ser desfeita.",
    deleted: "Template excluído.",
    error: "Não foi possível excluir o template.",
  },
  /**
   * name/description/category dos 7 templates oficiais vem do banco
   * (apps/api/prisma/seed.ts, tabela Template) — sempre em pt-BR, sem coluna
   * de traducao. Esse catalogo (chave = id = slugify(name) no seed) e
   * resolvido no cliente por getTemplateCopy() em
   * apps/web/src/app/(app)/templates/page.tsx; cai pro valor cru do banco se
   * o id nao tiver entrada (ex.: template novo criado direto no banco).
   */
  catalog: {
    "suporte-ia": {
      name: "Suporte IA",
      description: "Classifica, responde e escala tickets automaticamente.",
      category: "Atendimento",
    },
    "responder-email": {
      name: "Responder Email",
      description: "Lê, entende e responde emails recebidos.",
      category: "Comunicação",
    },
    "extrair-pdf": {
      name: "Extrair PDF",
      description: "Extrai dados estruturados de documentos PDF.",
      category: "Documentos",
    },
    "lead-qualification": {
      name: "Lead Qualification",
      description: "Qualifica leads com base em regras e IA.",
      category: "Vendas",
    },
    "resumo-de-reunioes": {
      name: "Resumo de reuniões",
      description: "Resume transcrições e envia para o time.",
      category: "Produtividade",
    },
    "analise-financeira": {
      name: "Análise financeira",
      description: "Analisa planilhas e gera relatórios com IA.",
      category: "Financeiro",
    },
    "ocr-de-documentos": {
      name: "OCR de documentos",
      description: "Converte imagens e digitalizações em texto pesquisável.",
      category: "Documentos",
    },
  },
};

export const en = {
  title: "Templates",
  description: "Ready-to-use flows to get you started.",
  emptyTitle: "No templates available",
  emptyDescription: "Official templates will appear here once they're published.",
  useButton: "Use template",
  useSuccessToast: (workflowName: string) => `Flow "${workflowName}" created from template.`,
  useErrorFallback: "Could not use this template.",
  searchPlaceholder: "Search templates...",
  categoryFilterAria: "Filter by category",
  allCategories: "All categories",
  badgeGlobal: "Official",
  badgeWorkspace: "My workspace",
  filteredEmptyTitle: "No templates found",
  filteredEmptyDescription: "Adjust the search or category to see other templates.",
  menu: {
    triggerAria: "Template actions",
    edit: "Edit",
  },
  editDialog: {
    title: "Edit template",
    nameLabel: "Name",
    categoryLabel: "Category",
    descriptionLabel: "Description",
    saved: "Template updated.",
    error: "Could not update the template.",
  },
  deleteDialog: {
    title: (name: string | undefined) => `Delete the template "${name}"?`,
    description: "Flows already created from it are not affected. This action cannot be undone.",
    deleted: "Template deleted.",
    error: "Could not delete the template.",
  },
  catalog: {
    "suporte-ia": {
      name: "AI Support",
      description: "Classifies, responds to, and escalates tickets automatically.",
      category: "Support",
    },
    "responder-email": {
      name: "Reply to Email",
      description: "Reads, understands, and replies to incoming emails.",
      category: "Communication",
    },
    "extrair-pdf": {
      name: "Extract PDF",
      description: "Extracts structured data from PDF documents.",
      category: "Documents",
    },
    "lead-qualification": {
      name: "Lead Qualification",
      description: "Qualifies leads based on rules and AI.",
      category: "Sales",
    },
    "resumo-de-reunioes": {
      name: "Meeting Summary",
      description: "Summarizes transcripts and sends them to the team.",
      category: "Productivity",
    },
    "analise-financeira": {
      name: "Financial Analysis",
      description: "Analyzes spreadsheets and generates reports with AI.",
      category: "Finance",
    },
    "ocr-de-documentos": {
      name: "Document OCR",
      description: "Converts images and scans into searchable text.",
      category: "Documents",
    },
  },
} satisfies typeof pt;
