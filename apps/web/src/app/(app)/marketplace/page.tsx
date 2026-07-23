import Link from "next/link";
import { EmptyState } from "@workflow/ui";
import { Button } from "@/components/ui/button";

export default function MarketplacePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Marketplace</h1>
        <p className="text-sm text-muted-foreground">
          Agentes, fluxos, prompts, integracoes e templates publicados pela comunidade.
        </p>
      </div>

      <EmptyState
        title="Nada publicado ainda"
        description="Quando voce ou sua equipe publicar um agente, fluxo ou template, ele aparece aqui."
        action={
          <Button variant="outline" render={<Link href="/templates" />}>
            Ver templates
          </Button>
        }
      />
    </div>
  );
}
