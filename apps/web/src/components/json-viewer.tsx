"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useDictionary } from "@/lib/i18n";

export function JsonViewer({ value, className }: { value: unknown; className?: string }) {
  const t = useDictionary();
  const [copied, setCopied] = useState(false);
  const text = value === null || value === undefined ? "—" : JSON.stringify(value, null, 2);

  async function onCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={"group relative rounded-md border border-border bg-muted" + (className ? ` ${className}` : "")}>
      <button
        type="button"
        onClick={onCopy}
        // focus-visible:opacity-100 junto do group-hover: sem isso o botao
        // fica invisivel para quem chega nele pelo teclado.
        className="absolute right-2 top-2 rounded p-1 text-muted-foreground opacity-0 outline-none transition-opacity hover:bg-accent-subtle hover:text-primary group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={t.executions.detail.copyJson}
      >
        {copied ? <Check className="h-3.5 w-3.5" strokeWidth={1.5} /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />}
      </button>
      <pre className="max-h-80 overflow-auto p-3 font-mono text-xs text-foreground">{text}</pre>
    </div>
  );
}
