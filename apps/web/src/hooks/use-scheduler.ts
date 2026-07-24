import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export function usePreviewCron() {
  return useMutation({
    mutationFn: ({ cronExpression, timezone }: { cronExpression: string; timezone: string }) =>
      apiFetch<{ nextRuns: string[] }>("/scheduler/preview", {
        method: "POST",
        body: { cronExpression, timezone },
      }),
  });
}
