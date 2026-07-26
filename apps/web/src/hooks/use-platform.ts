"use client";

import { useSyncExternalStore } from "react";

function subscribe() {
  // A plataforma nao muda durante a sessao — nunca notifica.
  return () => {};
}

function getSnapshot(): boolean {
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Usado so para o rotulo do atalho (⌘K vs Ctrl K). O handler em app-shell.tsx
 * ja aceita metaKey **e** ctrlKey, entao o atalho funciona nas duas
 * plataformas independente disso — o que estava errado era so a dica visual,
 * que dizia ⌘ para todo mundo.
 */
export function useIsMac(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
