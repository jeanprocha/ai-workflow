const TEMPLATES = [
  { name: "Suporte IA", description: "Classifica, responde e escala tickets automaticamente." },
  { name: "Atendimento WhatsApp", description: "Responde clientes e registra conversas no CRM." },
  { name: "Responder Email", description: "Le, entende e responde emails recebidos." },
  { name: "Extrair PDF", description: "Extrai dados estruturados de documentos PDF." },
  { name: "OCR", description: "Converte imagens e digitalizacoes em texto pesquisavel." },
  { name: "Lead Qualification", description: "Qualifica leads com base em regras e IA." },
  { name: "Resumo de reunioes", description: "Resume transcricoes e envia para o time." },
  { name: "Gerador de artigos", description: "Gera artigos a partir de um tema ou briefing." },
  { name: "Analise financeira", description: "Analisa planilhas e gera relatorios com IA." },
];

export default function TemplatesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Templates</h1>
        <p className="text-sm text-muted-foreground">Fluxos prontos para usar como ponto de partida.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((template) => (
          <button
            key={template.name}
            type="button"
            className="rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-border-strong"
          >
            <h3 className="text-sm font-medium text-foreground">{template.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
