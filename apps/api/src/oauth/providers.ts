/**
 * Registry de provedores OAuth em codigo, nao em banco (spec-oauth-
 * credencial.md, decisao 8). Um provedor so aparece habilitado quando as
 * envs dele existem — permite adicionar provedor novo sem migration.
 */
export interface OAuthProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  defaultScopes: string[];
  clientId: string;
  clientSecret: string;
  /** Params extras na URL de autorizacao alem de client_id/redirect_uri/response_type/scope/state. */
  extraAuthorizeParams?: Record<string, string>;
}

export interface OAuthProviderSummary {
  provider: string;
  label: string;
}

function google(): OAuthProviderConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    defaultScopes: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
    clientId,
    clientSecret,
    // Sem isso o Google so devolve refresh_token na PRIMEIRA autorizacao —
    // toda reconexao subsequente viria sem refresh_token nenhum.
    extraAuthorizeParams: { access_type: 'offline', prompt: 'consent' },
  };
}

/**
 * Provedor fake pro e2e (fixture local com /authorize + /token) — nunca em
 * producao, e so aparece se as envs estiverem setadas (molde
 * OBS_DEBUG_ENDPOINT condicional em observability.module.ts).
 */
function testProvider(): OAuthProviderConfig | null {
  if (process.env.NODE_ENV === 'production') return null;
  const authorizeUrl = process.env.OAUTH_TEST_AUTHORIZE_URL;
  const tokenUrl = process.env.OAUTH_TEST_TOKEN_URL;
  if (!authorizeUrl || !tokenUrl) return null;
  return {
    authorizeUrl,
    tokenUrl,
    defaultScopes: ['test'],
    clientId: process.env.OAUTH_TEST_CLIENT_ID ?? 'test-client-id',
    clientSecret: process.env.OAUTH_TEST_CLIENT_SECRET ?? 'test-client-secret',
  };
}

const REGISTRY: Record<string, () => OAuthProviderConfig | null> = {
  google,
  _test: testProvider,
};

const LABELS: Record<string, string> = {
  google: 'Google',
  _test: 'Provedor de teste',
};

export function getOAuthProvider(provider: string): OAuthProviderConfig | null {
  return REGISTRY[provider]?.() ?? null;
}

export function listEnabledProviders(): OAuthProviderSummary[] {
  return Object.keys(REGISTRY)
    .filter((provider) => REGISTRY[provider]() !== null)
    .map((provider) => ({ provider, label: LABELS[provider] ?? provider }));
}
