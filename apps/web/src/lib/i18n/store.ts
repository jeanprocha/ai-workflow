"use client";

import { useSyncExternalStore } from "react";

export type Locale = "pt" | "en";

const LOCALE_KEY = "wf.locale";
const LOCALE_CHANGE_EVENT = "wf-locale-change";

/** Mapeia o locale interno pro atributo <html lang>. */
const HTML_LANG: Record<Locale, string> = {
  pt: "pt-BR",
  en: "en-US",
};

function subscribe(callback: () => void) {
  window.addEventListener(LOCALE_CHANGE_EVENT, callback);
  return () => window.removeEventListener(LOCALE_CHANGE_EVENT, callback);
}

/** Leitura direta (sem hook) — usado por api-client.ts, fora de componentes React. */
export function getLocale(): Locale {
  if (typeof window === "undefined") return "pt";
  const stored = localStorage.getItem(LOCALE_KEY);
  return stored === "en" ? "en" : "pt";
}

/** pt-BR e o padrao da plataforma — ver docs/testing (suite E2E usa locators em pt-BR). */
function getServerSnapshot(): Locale {
  return "pt";
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getServerSnapshot);
}

export function setLocale(locale: Locale) {
  localStorage.setItem(LOCALE_KEY, locale);
  document.documentElement.lang = HTML_LANG[locale];
  window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
}
