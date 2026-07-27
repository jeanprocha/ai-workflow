"use client";

import { Label } from "@/components/ui/label";
import { useCredentials } from "@/hooks/use-credentials";
import { useDictionary } from "@/lib/i18n";

/**
 * Select de Conexao alimentado por useCredentials() — antes cada tela tinha
 * seu proprio <Input> de texto livre pro nome da conexao, e um typo so
 * aparecia como "Credencial nao encontrada" em runtime. Compartilhado entre
 * o painel do node HTTP/integracoes (config-panel.tsx), Agentes e Knowledge
 * Base.
 *
 * Dois casos tratados: valor orfao (a config aponta pra uma conexao
 * renomeada/apagada — mantido como opcao selecionada em vez de esvaziar em
 * silencio, o que apagaria a config ao salvar) e workspace sem nenhuma
 * conexao (mensagem deixando claro que precisa criar uma em Configuracoes).
 *
 * Nao filtra por provider de proposito — ao contrario de
 * `ai/provider-model-fields.tsx` (que sabe o provider exato do LLM), aqui o
 * `provider` da conexao e um rotulo livre que o usuario escolhe (ex.: "rein"
 * pra um ERP), sem relacao fixa com o tipo do node.
 */
export function CredentialSelect({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useDictionary().editor.configPanel.credential;
  const { data: credentials } = useCredentials();
  const list = credentials ?? [];
  const isOrphan = value !== "" && !list.some((credential) => credential.name === value);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm"
      >
        <option value="">{t.none}</option>
        {isOrphan && <option value={value}>{t.orphan(value)}</option>}
        {list.map((credential) => (
          <option key={credential.id} value={credential.name}>
            {credential.name}
          </option>
        ))}
      </select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {list.length === 0 && <p className="text-xs text-muted-foreground">{t.empty}</p>}
    </div>
  );
}
