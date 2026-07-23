"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { EmptyState } from "@workflow/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import {
  useCreateCredential,
  useCredentials,
  useDeleteCredential,
} from "@/hooks/use-credentials";
import { useCreateVariable, useDeleteVariable, useVariables } from "@/hooks/use-variables";
import { ApiError } from "@/lib/api-client";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-md font-medium text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ConnectionsSection() {
  const { data: credentials, isLoading } = useCredentials();
  const createCredential = useCreateCredential();
  const deleteCredential = useDeleteCredential();
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [provider, setProvider] = useState("");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");

  async function onCreate() {
    if (!provider.trim() || !name.trim() || !value.trim()) return;
    try {
      await createCredential.mutateAsync({ provider: provider.trim(), name: name.trim(), value });
      toast.success("Conexao adicionada.");
      setProvider("");
      setName("");
      setValue("");
      setOpen(false);
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel adicionar a conexao."));
    }
  }

  async function onDelete() {
    if (!deleteId) return;
    try {
      await deleteCredential.mutateAsync(deleteId);
      toast.success("Conexao removida.");
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel remover a conexao."));
    } finally {
      setDeleteId(null);
    }
  }

  if (isLoading) return <Skeleton className="h-16 rounded-lg" />;

  return (
    <>
      {!credentials?.length ? (
        <EmptyState
          title="Nenhuma conexao ainda"
          description="Adicione uma credencial para usar em fluxos e agentes."
          action={
            <Button size="sm" onClick={() => setOpen(true)}>
              Adicionar conexao
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {credentials.map((credential) => (
            <div
              key={credential.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{credential.name}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {credential.provider} · ••••{credential.lastFour}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setDeleteId(credential.id)}
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Adicionar conexao
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar conexao</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cred-provider">Provider</Label>
              <Input
                id="cred-provider"
                placeholder="openai, anthropic, stripe..."
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cred-name">Nome</Label>
              <Input
                id="cred-name"
                placeholder="Ex: OpenAI Producao"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cred-value">Chave / valor</Label>
              <Input
                id="cred-value"
                type="password"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={onCreate} disabled={createCredential.isPending}>
              {createCredential.isPending ? "Adicionando..." : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover esta conexao?</AlertDialogTitle>
            <AlertDialogDescription>
              Fluxos e agentes que dependem dela deixarao de funcionar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger/10 text-danger hover:bg-danger/20"
              onClick={onDelete}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function VariablesSection() {
  const { data: variables, isLoading } = useVariables();
  const createVariable = useCreateVariable();
  const deleteVariable = useDeleteVariable();
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [isSecret, setIsSecret] = useState(false);

  async function onCreate() {
    if (!key.trim() || !value.trim()) return;
    try {
      await createVariable.mutateAsync({ key: key.trim(), value, isSecret });
      toast.success("Variavel criada.");
      setKey("");
      setValue("");
      setIsSecret(false);
      setOpen(false);
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel criar a variavel."));
    }
  }

  async function onDelete() {
    if (!deleteId) return;
    try {
      await deleteVariable.mutateAsync(deleteId);
      toast.success("Variavel removida.");
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel remover a variavel."));
    } finally {
      setDeleteId(null);
    }
  }

  if (isLoading) return <Skeleton className="h-16 rounded-lg" />;

  return (
    <>
      {!variables?.length ? (
        <EmptyState
          title="Nenhuma variavel ainda"
          description="Crie uma variavel para reutilizar em qualquer fluxo."
          action={
            <Button size="sm" onClick={() => setOpen(true)}>
              Adicionar variavel
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {variables.map((variable) => (
            <div
              key={variable.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
            >
              <div>
                <p className="font-mono text-sm font-medium text-foreground">{variable.key}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {variable.isSecret ? "••••••••" : variable.value} · {variable.scope}
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setDeleteId(variable.id)}>
                <Trash2 className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Adicionar variavel
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar variavel</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="var-key">Chave</Label>
              <Input
                id="var-key"
                placeholder="API_BASE_URL"
                value={key}
                onChange={(event) => setKey(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="var-value">Valor</Label>
              <Input
                id="var-value"
                type={isSecret ? "password" : "text"}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={isSecret}
                onChange={(event) => setIsSecret(event.target.checked)}
                className="h-4 w-4 rounded border-border-strong"
              />
              Tratar como secret (nunca exibido depois de salvo)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={onCreate} disabled={createVariable.isPending}>
              {createVariable.isPending ? "Adicionando..." : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover esta variavel?</AlertDialogTitle>
            <AlertDialogDescription>
              Fluxos que referenciam esta variavel vao falhar ate ela ser recriada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger/10 text-danger hover:bg-danger/20"
              onClick={onDelete}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
        <ConnectionsSection />
      </SettingsSection>

      <SettingsSection
        title="Variaveis"
        description="Variaveis globais, de ambiente e de runtime do workspace."
      >
        <VariablesSection />
      </SettingsSection>
    </div>
  );
}
