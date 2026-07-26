import type { APIRequestContext } from "@playwright/test";
import { API_URL, type AuthTokens } from "./auth";
import { workspaceHeaders } from "./settings";

export interface AgentSummary {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  provider: string;
  model: string;
  credential: string;
  temperature: number;
  tools: string[];
  knowledgeBaseId: string | null;
  createdAt: string;
}

export interface CreateAgentPayload {
  name: string;
  description?: string;
  systemPrompt?: string;
  provider?: string;
  model?: string;
  credential?: string;
  temperature?: number;
  tools?: string[];
  knowledgeBaseId?: string;
}

/**
 * Setup rapido: agente criado direto na API (teste de UI que so precisa de um
 * existente). systemPrompt e model tem default porque sao obrigatorios no DTO
 * mas irrelevantes pra maioria dos testes — o que importa e o nome e as tools.
 */
export async function createAgentViaApi(
  request: APIRequestContext,
  tokens: AuthTokens,
  workspaceId: string,
  payload: CreateAgentPayload,
): Promise<AgentSummary> {
  const response = await request.post(`${API_URL}/agents`, {
    headers: workspaceHeaders(tokens, workspaceId),
    data: {
      systemPrompt: "Voce e um agente de teste.",
      model: "claude-sonnet-5",
      ...payload,
    },
  });
  if (!response.ok()) {
    throw new Error(
      `createAgentViaApi falhou (${response.status()}): ${await response.text()}`,
    );
  }
  return response.json() as Promise<AgentSummary>;
}
