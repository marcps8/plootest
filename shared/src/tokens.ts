import type pg from "pg";
import { decryptToken, encryptToken } from "./crypto.js";
import {
  ProviderUnavailableError,
  RateLimitedError,
  TokenRevokedError,
} from "./errors.js";

const PROVIDER_BASE = () => process.env.PROVIDER_BASE_URL ?? "http://localhost:4000";
const CLIENT_SECRET = () => process.env.OAUTH_CLIENT_SECRET ?? "dev-oauth-secret";

export interface OAuthRecord {
  tenant_id: string;
  profile_id: string;
  encrypted_token: string;
  encrypted_refresh_token: string | null;
  expires_at: string;
  revoked_at: string | null;
}

export async function getOAuthToken(
  client: pg.PoolClient,
  tenantId: string,
  profileId: string
): Promise<OAuthRecord | null> {
  const { rows } = await client.query<OAuthRecord>(
    `SELECT tenant_id, profile_id, encrypted_token, encrypted_refresh_token, expires_at, revoked_at
     FROM oauth_tokens
     WHERE tenant_id = $1 AND profile_id = $2`,
    [tenantId, profileId]
  );
  return rows[0] ?? null;
}

export async function resolveAccessToken(
  client: pg.PoolClient,
  tenantId: string,
  profileId: string
): Promise<string> {
  const record = await getOAuthToken(client, tenantId, profileId);
  if (!record || record.revoked_at) {
    throw new TokenRevokedError();
  }

  const expiresAt = new Date(record.expires_at).getTime();
  const now = Date.now();
  if (expiresAt > now + 60_000) {
    return decryptToken(record.encrypted_token);
  }

  const refreshToken = record.encrypted_refresh_token
    ? decryptToken(record.encrypted_refresh_token)
    : "refresh";

  const res = await fetch(`${PROVIDER_BASE()}/provider/oauth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      refresh_token: refreshToken,
      client_secret: CLIENT_SECRET(),
    }),
  });

  if (res.status === 401) {
    await client.query(
      `UPDATE oauth_tokens SET revoked_at = now() WHERE tenant_id = $1 AND profile_id = $2`,
      [tenantId, profileId]
    );
    throw new TokenRevokedError("OAuth refresh failed — token revoked");
  }

  if (!res.ok) {
    throw new ProviderUnavailableError(`OAuth refresh failed with status ${res.status}`);
  }

  const body = (await res.json()) as { access_token: string; expires_in: number };
  const newExpires = new Date(Date.now() + body.expires_in * 1000).toISOString();

  await client.query(
    `UPDATE oauth_tokens
     SET encrypted_token = $3, expires_at = $4, updated_at = now()
     WHERE tenant_id = $1 AND profile_id = $2`,
    [tenantId, profileId, encryptToken(body.access_token), newExpires]
  );

  return body.access_token;
}

export interface ProviderPublishResult {
  status: number;
  externalId?: string;
  retryAfterSeconds?: number;
  errorCode?: string;
}

export async function callProviderPublish(
  accessToken: string,
  content: string,
  traceId?: string
): Promise<ProviderPublishResult> {
  const res = await fetch(`${PROVIDER_BASE()}/provider/publish`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(traceId ? { traceparent: traceId } : {}),
    },
    body: JSON.stringify({ content }),
  });

  if (res.status === 200) {
    const body = (await res.json()) as { external_id: string };
    return { status: 200, externalId: body.external_id };
  }

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? "30");
    throw new RateLimitedError(retryAfter);
  }

  if (res.status === 401) {
    const body = (await res.json()) as { error?: string };
    if (body.error === "token_revoked") {
      throw new TokenRevokedError();
    }
    return { status: 401, errorCode: body.error ?? "token_expired" };
  }

  if (res.status >= 500) {
    throw new ProviderUnavailableError(`Provider returned ${res.status}`);
  }

  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { status: res.status, errorCode: body.error ?? "provider_error" };
}
