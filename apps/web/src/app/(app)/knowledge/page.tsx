import { EmptyState } from "@workflow/ui";
import { Button } from "@/components/ui/button";

export default function KnowledgePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Knowledge</h1>
        <p className="text-sm text-muted-foreground">
          Base de conhecimento para seus agentes consultarem.
        </p>
      </div>

      <EmptyState
        title="Nenhuma base de conhecimento ainda"
        description="Envie um PDF, DOCX, Markdown, TXT ou CSV para comecar."
        action={<Button>Enviar documento</Button>}
      />
    </div>
  );
}
