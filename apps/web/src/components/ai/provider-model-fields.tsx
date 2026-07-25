"use client";

import { useEffect, useMemo } from "react";
import { MODEL_REGISTRY } from "@workflow/ai/models";
import { Label } from "@/components/ui/label";
import { useCredentials } from "@/hooks/use-credentials";

export interface ProviderModelValue {
  provider: string;
  model: string;
  credential: string;
}

const PROVIDERS = ["anthropic", "openai", "gemini", "ollama"];

/** Campos reutilizados por Autocomplete/Debugger/Copilot para escolher qual LLM usar. */
export function ProviderModelFields({
  value,
  onChange,
  idPrefix,
}: {
  value: ProviderModelValue;
  onChange: (value: ProviderModelValue) => void;
  idPrefix: string;
}) {
  const { data: credentials } = useCredentials();

  const modelsForProvider = useMemo(
    () => MODEL_REGISTRY.filter((model) => model.provider === value.provider),
    [value.provider],
  );
  const credentialsForProvider = useMemo(
    () => (credentials ?? []).filter((credential) => credential.provider === value.provider),
    [credentials, value.provider],
  );

  // Ao trocar de provider (ou quando os dados carregam), garante que modelo e
  // credential selecionados continuam validos pro novo provider — sem isso
  // ficaria um valor de outro provider "preso" no formulario.
  useEffect(() => {
    const modelStillValid = modelsForProvider.some((model) => model.id === value.model);
    const credentialStillValid =
      value.provider === "ollama" ||
      credentialsForProvider.some((credential) => credential.name === value.credential);
    if (!modelStillValid || !credentialStillValid) {
      onChange({
        ...value,
        model: modelStillValid ? value.model : (modelsForProvider[0]?.id ?? ""),
        credential: credentialStillValid ? value.credential : (credentialsForProvider[0]?.name ?? ""),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.provider, modelsForProvider, credentialsForProvider]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-provider`}>Provider</Label>
          <select
            id={`${idPrefix}-provider`}
            value={value.provider}
            onChange={(event) => onChange({ ...value, provider: event.target.value })}
            className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm"
          >
            {PROVIDERS.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-model`}>Modelo</Label>
          <select
            id={`${idPrefix}-model`}
            value={value.model}
            onChange={(event) => onChange({ ...value, model: event.target.value })}
            className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm"
            disabled={!modelsForProvider.length}
          >
            {modelsForProvider.length === 0 && <option value="">Nenhum modelo</option>}
            {modelsForProvider.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {value.provider === "ollama" ? (
        <p className="text-xs text-muted-foreground">
          Ollama roda local — nao precisa de credencial.
        </p>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-credential`}>Conexao (credential)</Label>
          <select
            id={`${idPrefix}-credential`}
            value={value.credential}
            onChange={(event) => onChange({ ...value, credential: event.target.value })}
            className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm"
            disabled={!credentialsForProvider.length}
          >
            {credentialsForProvider.length === 0 && (
              <option value="">Nenhuma credencial de {value.provider} cadastrada</option>
            )}
            {credentialsForProvider.map((credential) => (
              <option key={credential.id} value={credential.name}>
                {credential.name}
                {credential.lastFour ? ` (••••${credential.lastFour})` : ""}
              </option>
            ))}
          </select>
          {credentialsForProvider.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Cadastre uma credencial de {value.provider} em Configuracoes → Credenciais.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
