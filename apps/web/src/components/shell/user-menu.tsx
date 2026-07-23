"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "@/hooks/use-current-user";
import { clearSession } from "@/lib/auth-storage";

export function UserMenu() {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const initial = user?.name?.[0]?.toUpperCase() ?? "?";

  function onLogout() {
    clearSession();
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full bg-accent-subtle text-xs font-semibold text-primary"
          />
        }
      >
        {initial}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{user?.name ?? "Conta"}</DropdownMenuLabel>
        <p className="px-1.5 pb-1.5 text-xs text-muted-foreground">{user?.email}</p>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout} variant="destructive">
          <LogOut className="h-4 w-4" strokeWidth={1.5} />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
