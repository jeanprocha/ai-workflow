import type { OAuthProviderConfig } from './providers';

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

/**
 * Sinal especifico do provedor pra "esse refresh_token nao vale mais" —
 * distinto de falha transitoria (rede, 5xx). So esse caso marca a credencial
 * como oauthStatus: "error" (CredentialsService.resolve); os demais deixam o
 * status como estava, pra nao esconder um blip de rede atras de "reconecte".
 */
export class OAuthInvalidGrantError extends Error {}

const REFRESH_TIMEOUT_MS = 8_000;

export async function exchangeRefreshToken(
  config: OAuthProviderConfig,
  refreshToken: string,
): Promise<OAuthTokenResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
  try {
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token',
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        error_description?: string;
      } | null;
      if (body?.error === 'invalid_grant') {
        throw new OAuthInvalidGrantError(
          body.error_description ?? 'invalid_grant',
        );
      }
      throw new Error(`Renovacao de token falhou (${response.status}).`);
    }

    return (await response.json()) as OAuthTokenResponse;
  } finally {
    clearTimeout(timeout);
  }
}
