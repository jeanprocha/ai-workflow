/**
 * Chunking simples por caracteres, respeitando limites de palavra/linha quando
 * possivel. Sem dependencia de tokenizer — tamanho/overlap sao configuraveis
 * por KnowledgeBase (plan.md Fase 7).
 */
export function chunkText(
  text: string,
  chunkSize: number,
  overlap: number,
): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    let sliceEnd = end;

    if (end < normalized.length) {
      const lastBreak = normalized.lastIndexOf('\n', end);
      const lastSpace = normalized.lastIndexOf(' ', end);
      const boundary = Math.max(lastBreak, lastSpace);
      if (boundary > start + chunkSize * 0.5) sliceEnd = boundary;
    }

    const chunk = normalized.slice(start, sliceEnd).trim();
    if (chunk) chunks.push(chunk);
    if (sliceEnd >= normalized.length) break;
    start = Math.max(sliceEnd - overlap, start + 1);
  }

  return chunks;
}
