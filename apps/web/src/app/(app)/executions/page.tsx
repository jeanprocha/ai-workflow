import Link from "next/link";
import { EmptyState } from "@workflow/ui";
import { Button } from "@/components/ui/button";

export default function ExecutionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Executions</h1>
        <p className="text-sm text-muted-foreground">
          Historico completo de execucoes, com logs, tokens e replay.
        </p>
      </div>

      <EmptyState
        title="Nenhuma execucao ainda"
        description="Execute um fluxo para ver o historico, os logs e o custo de IA aqui."
        action={<Button render={<Link href="/flows" />}>Ver fluxos</Button>}
      />
    </div>
  );
}
