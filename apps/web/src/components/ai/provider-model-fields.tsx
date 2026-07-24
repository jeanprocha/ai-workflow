"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
          <Input
            id={`${idPrefix}-model`}
            value={value.model}
            onChange={(event) => onChange({ ...value, model: event.target.value })}
            placeholder="Ex: claude-sonnet-5"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-credential`}>Conexao (credential)</Label>
        <Input
          id={`${idPrefix}-credential`}
          value={value.credential}
          onChange={(event) => onChange({ ...value, credential: event.target.value })}
          placeholder="Ex: anthropic-default"
        />
      </div>
    </div>
  );
}
