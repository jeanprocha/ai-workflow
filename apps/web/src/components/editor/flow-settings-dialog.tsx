"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUpdateWorkflow, useWorkflow, useWorkflows } from "@/hooks/use-workflows";
import { errorMessage } from "@/lib/errors";
import { useDictionary } from "@/lib/i18n";

/**
 * Configuracoes do fluxo (H2-05) — hoje so o error workflow, mas o dialog
 * fica separado do Historico de proposito: e config do FLUXO, nao da versao.
 * Fica no toolbar (nao no painel de um node) porque nao depende do tipo de
 * trigger — qualquer fluxo pode ter um tratador de erro.
 *
 * Busca o proprio `useWorkflow(workflowId)` (mesma chave de cache do
 * flow-editor.tsx — sem custo extra de rede) em vez de receber
 * `errorWorkflowId` via prop: se o dialog abrisse antes do fetch inicial da
 * pagina resolver, o valor capturado no clique ficaria "" (nao carregado, nao
 * "sem tratador") — salvar sem mexer em nada apagaria um ponteiro existente.
 */
export function FlowSettingsDialog({ workflowId }: { workflowId: string }) {
  const t = useDictionary().editor.toolbar.settings;
  const dict = useDictionary();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const { data: workflow } = useWorkflow(workflowId);
  const { data: workflows } = useWorkflows();
  const updateWorkflow = useUpdateWorkflow();

  function onOpen() {
    // Sincroniza com o valor mais recente do cache ao abrir — sem isso, o
    // que ficou de uma edicao anterior cancelada "vazaria" pra proxima
    // abertura (setState no clique, nao em efeito: evita cascata de renders).
    setSelected(workflow?.errorWorkflowId ?? "");
    setOpen(true);
  }

  const options = (workflows ?? []).filter(
    (workflow) => workflow.id !== workflowId && workflow.status !== "archived",
  );

  async function onSave() {
    try {
      await updateWorkflow.mutateAsync({
        id: workflowId,
        errorWorkflowId: selected || null,
      });
      toast.success(t.savedToast);
      setOpen(false);
    } catch (error) {
      toast.error(errorMessage(error, t.saveErrorFallback));
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={onOpen}
        aria-label={t.button}
        disabled={!workflow}
        title={!workflow ? dict.common.loading : undefined}
      >
        <Settings2 className="h-3.5 w-3.5" strokeWidth={1.5} />
        <span className="hidden sm:inline">{t.button}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="flow-error-workflow">{t.errorWorkflowLabel}</Label>
            <select
              id="flow-error-workflow"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm"
            >
              <option value="">{t.none}</option>
              {options.map((workflow) => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{t.errorWorkflowHint}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {dict.common.cancel}
            </Button>
            <Button onClick={() => void onSave()} disabled={updateWorkflow.isPending}>
              {updateWorkflow.isPending ? dict.common.saving : t.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
