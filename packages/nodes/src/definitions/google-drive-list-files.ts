import jwt from "jsonwebtoken";
import type { NodeDefinition } from "../types.js";
import { requireCredentialObject } from "../credential-payload.js";
import {
  googleDriveListFilesMeta,
  type GoogleDriveListFilesConfig,
} from "./google-drive-list-files.meta.js";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

async function getAccessToken(
  serviceAccountJson: string,
  credentialName: string,
): Promise<string> {
  const key = requireCredentialObject(
    serviceAccountJson,
    credentialName,
    "client_email, private_key",
  ) as unknown as ServiceAccountKey;
  const now = Math.floor(Date.now() / 1000);

  const assertion = jwt.sign(
    {
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    key.private_key,
    { algorithm: "RS256" },
  );

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });

  const body = (await response.json().catch(() => null)) as { access_token?: string } | null;
  if (!response.ok || !body?.access_token) {
    throw new Error(`Falha ao obter access token do Google: ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

export const googleDriveListFilesNode: NodeDefinition<GoogleDriveListFilesConfig> = {
  ...googleDriveListFilesMeta,
  execute: async (ctx) => {
    const serviceAccountJson = await ctx.getCredential(ctx.config.credential);
    const accessToken = await getAccessToken(serviceAccountJson, ctx.config.credential);

    const params = new URLSearchParams({ pageSize: String(ctx.config.pageSize) });
    if (ctx.config.query) params.set("q", ctx.config.query);

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`Google Drive retornou status ${response.status}: ${JSON.stringify(body)}`);
    }
    ctx.log("googledrive.files.listed", { status: response.status });
    return { output: body };
  },
};
