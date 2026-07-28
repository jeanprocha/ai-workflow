/**
 * `navigator.clipboard` so existe em contexto seguro (HTTPS ou localhost/
 * 127.0.0.1) — acessar o app por IP de LAN em HTTP puro faz `navigator
 * .clipboard` vir `undefined`, e chamar `.writeText` nele estoura TypeError
 * antes de qualquer coisa acontecer (mesma familia do bug do
 * crypto.randomUUID() em api-client.ts). `document.execCommand("copy")` e
 * deprecated mas continua funcionando em HTTP puro — fallback aqui.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Cai pro fallback abaixo (ex.: permissao negada).
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
