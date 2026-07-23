import { EmptyState } from "@workflow/ui";
import { Button } from "@/components/ui/button";

export default function AgentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Agents</h1>
        <p className="text-sm text-muted-foreground">
          Agentes reutilizaveis com ferramentas, memoria e system prompt proprios.
        </p>
      </div>

      <EmptyState
        title="Nenhum agente ainda"
        description="Crie um agente com ferramentas e memoria para reutilizar em qualquer fluxo."
        action={<Button>Criar agente</Button>}
      />
    </div>
  );
}
