import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, generateRequestId } from "@/lib/api-client";
import { getAccessToken, getWorkspaceId } from "@/lib/auth-storage";
import { ApiError } from "@/lib/errors";
import { getLocale } from "@/lib/i18n/store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  provider: string;
  model: string;
  credential: string;
  chunkSize: number;
  chunkOverlap: number;
  createdAt: string;
  _count: { documents: number };
}

export interface CreateKnowledgeBaseInput {
  name: string;
  description?: string;
  credential?: string;
  chunkSize?: number;
  chunkOverlap?: number;
}

export type DocumentStatus = "processing" | "ready" | "failed";

export interface KnowledgeDocument {
  id: string;
  name: string;
  sourceType: string;
  status: DocumentStatus;
  error: string | null;
  chunkCount: number;
  createdAt: string;
}

export interface SearchResult {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
  similarity: number;
  metadata: unknown;
}

const KEY = ["knowledge"];

export function useKnowledgeBases() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<KnowledgeBase[]>("/knowledge"),
  });
}

export function useKnowledgeBase(id: string) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: () => apiFetch<KnowledgeBase[]>("/knowledge"),
    select: (list) => list.find((kb) => kb.id === id),
  });
}

export function useCreateKnowledgeBase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateKnowledgeBaseInput) =>
      apiFetch<KnowledgeBase>("/knowledge", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteKnowledgeBase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/knowledge/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDocuments(knowledgeBaseId: string) {
  return useQuery({
    queryKey: [...KEY, knowledgeBaseId, "documents"],
    queryFn: () => apiFetch<KnowledgeDocument[]>(`/knowledge/${knowledgeBaseId}/documents`),
    refetchInterval: (query) => {
      const hasProcessing = query.state.data?.some((doc) => doc.status === "processing");
      return hasProcessing ? 2000 : false;
    },
  });
}

export function useUploadDocument(knowledgeBaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      // fetch cru (nao apiFetch) porque o body e FormData, nao JSON — mas
      // precisa espelhar os mesmos headers de correlacao/i18n, senao a
      // mensagem de erro do servidor nunca chega ao toast (Error puro nao e
      // desembrulhado por errorMessage(), so ApiError e) e o upload some da
      // correlacao de logs da suite E2E (sem x-test-run).
      const requestId = generateRequestId();
      const testRun = typeof window !== "undefined" ? window.__E2E_TEST_RUN__ : undefined;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${getAccessToken() ?? ""}`,
        "x-workspace-id": getWorkspaceId() ?? "",
        "x-lang": getLocale(),
        "x-request-id": requestId,
      };
      if (testRun) headers["x-test-run"] = testRun;

      const response = await fetch(`${API_URL}/knowledge/${knowledgeBaseId}/documents`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new ApiError(response.status, body, requestId);
      }
      return response.json() as Promise<KnowledgeDocument>;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...KEY, knowledgeBaseId, "documents"] }),
  });
}

export function useDeleteDocument(knowledgeBaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) =>
      apiFetch<void>(`/knowledge/${knowledgeBaseId}/documents/${documentId}`, {
        method: "DELETE",
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...KEY, knowledgeBaseId, "documents"] }),
  });
}

export function useSearchKnowledge(knowledgeBaseId: string) {
  return useMutation({
    mutationFn: (query: string) =>
      apiFetch<SearchResult[]>(`/knowledge/${knowledgeBaseId}/search`, {
        method: "POST",
        body: { query, topK: 5 },
      }),
  });
}
