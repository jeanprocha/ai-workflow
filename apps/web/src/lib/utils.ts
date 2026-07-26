import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Ring de foco do design system (style.md 8.9: "o mesmo ring em *todo*
 * elemento focavel do produto — consistencia de foco e inegociavel").
 * O componente <Button> ja aplica o seu; esta constante existe para os
 * <button>/<a> crus que nao passam por ele.
 */
export const focusRing =
  "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
