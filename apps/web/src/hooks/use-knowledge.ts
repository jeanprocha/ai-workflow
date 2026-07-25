import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { getAccessToken, getWorkspaceId } from "@/lib/auth-storage";
import { useDictionary } from "@/lib/i18n";

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
  const t = useDictionary();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_URL}/knowledge/${knowledgeBaseId}/documents`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAccessToken() ?? ""}`,
          "x-workspace-id": getWorkspaceId() ?? "",
        },
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? t.knowledge.detail.uploadErrorFallbackGeneric);
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
