export const pt = {
  title: "Templates",
  description: "Fluxos prontos para usar como ponto de partida.",
  emptyTitle: "Nenhum template disponivel",
  emptyDescription: "Os templates oficiais aparecerao aqui assim que forem publicados.",
  useButton: "Usar template",
  useSuccessToast: (workflowName: string) => `Fluxo "${workflowName}" criado a partir do template.`,
  useErrorFallback: "Nao foi possivel usar este template.",
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
      description: "Le, entende e responde emails recebidos.",
      category: "Comunicacao",
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
      name: "Resumo de reunioes",
      description: "Resume transcricoes e envia para o time.",
      category: "Produtividade",
    },
    "analise-financeira": {
      name: "Analise financeira",
      description: "Analisa planilhas e gera relatorios com IA.",
      category: "Financeiro",
    },
    "ocr-de-documentos": {
      name: "OCR de documentos",
      description: "Converte imagens e digitalizacoes em texto pesquisavel.",
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
