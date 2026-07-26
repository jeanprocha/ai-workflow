"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDictionary } from "@/lib/i18n";
import { useTheme, setTheme } from "@/hooks/use-theme";

export function ThemeToggle() {
  const theme = useTheme();
  const t = useDictionary();

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          />
        }
      >
        {theme === "dark" ? (
          <Sun className="h-4 w-4" strokeWidth={1.5} />
        ) : (
          <Moon className="h-4 w-4" strokeWidth={1.5} />
        )}
        <span className="sr-only">{t.shell.toggleTheme}</span>
      </TooltipTrigger>
      <TooltipContent>{t.shell.toggleTheme}</TooltipContent>
    </Tooltip>
  );
}
