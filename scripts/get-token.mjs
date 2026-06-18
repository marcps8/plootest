#!/usr/bin/env node
/**
 * Generate a dev JWT for API testing.
 * Usage: node scripts/get-token.mjs [tenant_id] [profile_id]
 */
import { signAuthToken } from "../shared/dist/auth.js";

const tenantId = process.argv[2] ?? "11111111-1111-1111-1111-111111111111";
const profileId = process.argv[3] ?? "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

process.env.JWT_SECRET ??= "dev-jwt-secret-change-in-prod";

const token = await signAuthToken({ tenantId, profileId });
console.log(token);
