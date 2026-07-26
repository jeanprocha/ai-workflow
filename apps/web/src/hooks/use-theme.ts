"use client";

import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

export const THEME_CHANGE_EVENT = "wf-theme-change";

function subscribe(callback: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, callback);
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

function getServerSnapshot(): Theme {
  return "dark";
}

/**
 * Tema atual lido da classe do <html> (escrita pelo script inline do layout,
 * antes da hidratacao, pra nao piscar). Precisa ser um hook compartilhado
 * porque o canvas do React Flow tambem depende dele: sem passar `colorMode`,
 * o React Flow assume "light" e injeta a classe `light` no proprio wrapper,
 * que reescopava todos os tokens do design system dentro do canvas.
 */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setTheme(next: Theme) {
  document.documentElement.classList.remove("dark", "light");
  document.documentElement.classList.add(next);
  localStorage.setItem("theme", next);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}
