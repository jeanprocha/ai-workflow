import type { Locale } from "./i18n";

/** Locale interno da plataforma -> locale ICU/Intl. */
const INTL_LOCALE: Record<Locale, string> = { pt: "pt-BR", en: "en-US" };

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDateTime(
  value: Date | string | number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" },
): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], options).format(toDate(value));
}

/** Data curta dia/mes — usado em eixos de grafico (ex.: Analytics). */
export function formatShortDate(value: Date | string | number, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "2-digit", month: "2-digit" }).format(
    toDate(value),
  );
}

const RELATIVE_STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.34524],
  ["month", 12],
  ["year", Infinity],
];

/**
 * Tempo relativo ("há 2 min") para tabelas e listas. Uma coluna de
 * timestamps absolutos repetidos e uma planilha; o que o usuario quer saber
 * numa lista de execucoes e ha quanto tempo aquilo rodou. O valor absoluto
 * continua acessivel no `title` de quem chama.
 */
export function formatRelativeTime(value: Date | string | number, locale: Locale): string {
  const diffSeconds = (toDate(value).getTime() - Date.now()) / 1000;
  const formatter = new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: "auto" });

  let amount = diffSeconds;
  for (const [unit, step] of RELATIVE_STEPS) {
    if (Math.abs(amount) < step) {
      return formatter.format(Math.round(amount), unit);
    }
    amount /= step;
  }
  return formatter.format(Math.round(amount), "year");
}

export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], options).format(value);
}

/**
 * Custos de IA vem em USD dos providers (Anthropic/OpenAI/Google) —
 * mantemos a moeda fixa em USD independente do idioma da interface, so o
 * separador decimal/milhar acompanha o locale.
 */
export function formatUsd(value: number, locale: Locale, fractionDigits = 2): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** @param value já em escala 0-100 (ex.: 42.5 -> "42,5%" / "42.5%"). */
export function formatPercent(value: number, locale: Locale, fractionDigits = 1): string {
  return `${formatNumber(value, locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
}

export function formatDuration(ms: number, locale: Locale): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${formatNumber(ms / 1000, locale, { maximumFractionDigits: 1 })}s`;
}

export function formatMegabytes(mb: number, locale: Locale): string {
  return `${formatNumber(mb, locale, { maximumFractionDigits: 0 })}MB`;
}
