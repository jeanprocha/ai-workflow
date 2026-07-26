import type { APIRequestContext } from "@playwright/test";
import { API_URL, type AuthTokens } from "./auth";
import { workspaceHeaders } from "./settings";

export interface KnowledgeBaseSummary {
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

export interface CreateKnowledgeBasePayload {
  name: string;
  description?: string;
  credential?: string;
  chunkSize?: number;
  chunkOverlap?: number;
}

export type DocumentStatus = "processing" | "ready" | "failed";

export interface DocumentSummary {
  id: string;
  name: string;
  sourceType: string;
  status: DocumentStatus;
  error: string | null;
  chunkCount: number;
  createdAt: string;
}

/** Setup rapido: base de conhecimento criada direto na API. */
export async function createKnowledgeBaseViaApi(
  request: APIRequestContext,
  tokens: AuthTokens,
  workspaceId: string,
  payload: CreateKnowledgeBasePayload,
): Promise<KnowledgeBaseSummary> {
  const response = await request.post(`${API_URL}/knowledge`, {
    headers: workspaceHeaders(tokens, workspaceId),
    data: payload,
  });
  if (!response.ok()) {
    throw new Error(
      `createKnowledgeBaseViaApi falhou (${response.status()}): ${await response.text()}`,
    );
  }
  return response.json() as Promise<KnowledgeBaseSummary>;
}

/**
 * Upload multipart direto na API. `headers` NAO deve incluir Content-Type —
 * o Playwright monta o boundary do multipart sozinho a partir de `multipart`.
 */
export async function uploadDocumentViaApi(
  request: APIRequestContext,
  tokens: AuthTokens,
  workspaceId: string,
  knowledgeBaseId: string,
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  return request.post(`${API_URL}/knowledge/${knowledgeBaseId}/documents`, {
    headers: workspaceHeaders(tokens, workspaceId),
    multipart: { file },
  });
}

export async function listDocumentsViaApi(
  request: APIRequestContext,
  tokens: AuthTokens,
  workspaceId: string,
  knowledgeBaseId: string,
): Promise<DocumentSummary[]> {
  const response = await request.get(`${API_URL}/knowledge/${knowledgeBaseId}/documents`, {
    headers: workspaceHeaders(tokens, workspaceId),
  });
  if (!response.ok()) {
    throw new Error(`listDocumentsViaApi falhou (${response.status()})`);
  }
  return response.json() as Promise<DocumentSummary[]>;
}

/**
 * Poll em GET /knowledge/:id/documents ate o documento atingir `status`.
 * Generoso de proposito: o worker roda num processo separado (concurrency 2)
 * e a suite completa enfileira varios jobs de ingestao em paralelo.
 */
export async function waitForDocumentStatus(
  request: APIRequestContext,
  tokens: AuthTokens,
  workspaceId: string,
  knowledgeBaseId: string,
  documentId: string,
  status: DocumentStatus,
  timeoutMs = 30_000,
): Promise<DocumentSummary> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const documents = await listDocumentsViaApi(request, tokens, workspaceId, knowledgeBaseId);
    const document = documents.find((doc) => doc.id === documentId);
    if (!document) {
      throw new Error(`waitForDocumentStatus: documento ${documentId} nao encontrado na lista`);
    }
    if (document.status === status) return document;
    if (Date.now() > deadline) {
      throw new Error(
        `waitForDocumentStatus timeout: esperava "${status}", ultimo status foi "${document.status}"`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}
