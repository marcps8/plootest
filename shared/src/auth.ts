import { SignJWT, jwtVerify } from "jose";
import type { AuthContext } from "./types.js";
import { AppError } from "./errors.js";

const ISSUER = "ploot-scheduler";

function secret(): Uint8Array {
  const value = process.env.JWT_SECRET ?? "dev-jwt-secret-change-in-prod";
  return new TextEncoder().encode(value);
}

export async function signAuthToken(ctx: AuthContext, expiresIn = "1h"): Promise<string> {
  return new SignJWT({
    tenant_id: ctx.tenantId,
    profile_id: ctx.profileId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret());
}

export async function verifyAuthHeader(header: string | null): Promise<AuthContext> {
  if (!header?.startsWith("Bearer ")) {
    throw new AppError("Missing or invalid Authorization header", "unauthorized", 401, true);
  }
  const token = header.slice("Bearer ".length);
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER });
    const tenantId = payload.tenant_id;
    const profileId = payload.profile_id;
    if (typeof tenantId !== "string" || typeof profileId !== "string") {
      throw new AppError("Invalid JWT claims", "unauthorized", 401, true);
    }
    return { tenantId, profileId };
  } catch {
    throw new AppError("Invalid or expired JWT", "unauthorized", 401, true);
  }
}
