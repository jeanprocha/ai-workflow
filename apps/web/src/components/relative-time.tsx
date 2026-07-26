"use client";

import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { useLocale } from "@/lib/i18n";

export interface RelativeTimeProps {
  value: string | number | Date;
  className?: string;
}

/**
 * "há 2 min" com o timestamp completo no title. Uma coluna de datas
 * absolutas repetidas nao responde a pergunta que o usuario faz numa lista
 * ("isso e recente?") — mas o valor exato ainda precisa estar a um hover de
 * distancia, entao ele vive no title e no <time dateTime>.
 */
export function RelativeTime({ value, className }: RelativeTimeProps) {
  const locale = useLocale();
  const date = value instanceof Date ? value : new Date(value);

  return (
    <time dateTime={date.toISOString()} title={formatDateTime(date, locale)} className={className}>
      {formatRelativeTime(date, locale)}
    </time>
  );
}
