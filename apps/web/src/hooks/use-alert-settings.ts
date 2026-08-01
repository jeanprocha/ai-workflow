import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface AlertSettings {
  emailEnabled: boolean;
  webhookUrl: string | null;
}

const ALERT_SETTINGS_KEY = ["alert-settings"];

export function useAlertSettings() {
  return useQuery({
    queryKey: ALERT_SETTINGS_KEY,
    queryFn: () => apiFetch<AlertSettings>("/workspaces/alert-settings"),
  });
}

export function useUpdateAlertSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { emailEnabled?: boolean; webhookUrl?: string | null }) =>
      apiFetch<AlertSettings>("/workspaces/alert-settings", { method: "PUT", body: input }),
    onSuccess: (data) => queryClient.setQueryData(ALERT_SETTINGS_KEY, data),
  });
}

export function useSendTestAlert() {
  return useMutation({
    mutationFn: (input: { webhookUrl?: string }) =>
      apiFetch<void>("/workspaces/alert-settings/test", { method: "POST", body: input }),
  });
}
