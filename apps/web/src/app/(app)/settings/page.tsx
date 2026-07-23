import { EmptyState } from "@workflow/ui";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shell/theme-toggle";

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-md font-medium text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Conexoes, variaveis, seguranca e preferencias do workspace.
        </p>
      </div>

      <SettingsSection title="Aparencia" description="Escolha entre tema escuro ou claro.">
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <span className="text-sm text-muted-foreground">
            O tema escuro e o padrao da plataforma.
          </span>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Conexoes"
        description="Credenciais de integracoes e providers de IA, sempre criptografadas."
      >
        <EmptyState
          title="Nenhuma conexao ainda"
          description="Adicione uma credencial para usar em fluxos e agentes."
          action={<Button size="sm">Adicionar conexao</Button>}
        />
      </SettingsSection>

      <SettingsSection
        title="Variaveis"
        description="Variaveis globais, de ambiente e de runtime do workspace."
      >
        <EmptyState
          title="Nenhuma variavel ainda"
          description="Crie uma variavel para reutilizar em qualquer fluxo."
          action={<Button size="sm">Adicionar variavel</Button>}
        />
      </SettingsSection>
    </div>
  );
}
