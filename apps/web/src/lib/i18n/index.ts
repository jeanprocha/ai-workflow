"use client";

import { pt, en, type Dictionary } from "./dictionary";
import { useLocale, setLocale, type Locale } from "./store";

export type { Locale, Dictionary };
export { useLocale, setLocale };

const DICTIONARIES: Record<Locale, Dictionary> = { pt, en };

/**
 * Dicionario tipado do locale atual — `t.settings.title`, nao `t("settings.title")`.
 * Autocomplete + erro de compilacao em chave inexistente, em vez de string
 * solta que so quebra em runtime. Mesmo padrao reativo do tema
 * (localStorage + evento custom via useSyncExternalStore).
 */
export function useDictionary(): Dictionary {
  const locale = useLocale();
  return DICTIONARIES[locale];
}
