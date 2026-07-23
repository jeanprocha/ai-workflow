import { EmptyState } from "@workflow/ui";
import { Button } from "@/components/ui/button";

export default function FlowsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Flows</h1>
        <p className="text-sm text-muted-foreground">
          Automacoes visuais construidas com nodes independentes.
        </p>
      </div>

      <EmptyState
        title="Nenhum fluxo ainda"
        description="Crie seu primeiro fluxo ou comece por um template."
        action={<Button>Criar fluxo</Button>}
        secondaryAction={
          <Button variant="outline" render={<a href="/templates" />}>
            Ver templates
          </Button>
        }
      />
    </div>
  );
}
