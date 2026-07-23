import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiFetch<CurrentUser>("/auth/me", { withWorkspace: false }),
    staleTime: 5 * 60 * 1000,
  });
}
