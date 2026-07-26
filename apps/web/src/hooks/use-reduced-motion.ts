"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * CSS resolve `prefers-reduced-motion` sozinho na maior parte do produto
 * (utilitario motion-reduce: do Tailwind). Este hook existe para o que CSS
 * nao alcanca: `<animateMotion>` do SVG, que ignora media query — e onde
 * mora O Pulso das edges do canvas.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
