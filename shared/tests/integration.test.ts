import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostsRepository,
  getPostForTenant,
  madridLocalToUtc,
  utcToMadrid,
} from "../src/index.js";
import { createPool, resetDatabase, TENANT_A, TENANT_B, PROFILE_A, PROFILE_B, insertScheduledPost } from "./helpers.js";

describe("cross-tenant isolation (SQL layer)", () => {
  const pool = createPool();

  beforeAll(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("rejects cross-tenant access at SQL level — returns null, not another tenant's post", async () => {
    const postId = await insertScheduledPost(pool, { tenantId: TENANT_A, profileId: PROFILE_A });

    const client = await pool.connect();
    try {
      const wrongTenant = await getPostForTenant(client, postId, TENANT_B);
      expect(wrongTenant).toBeNull();

      const repoB = new PostsRepository({ tenantId: TENANT_B, profileId: PROFILE_B });
      await expect(repoB.getById(postId)).rejects.toMatchObject({ code: "not_found" });
    } finally {
      client.release();
    }
  });
});

describe("Europe/Madrid DST", () => {
  it("spring forward: 2025-03-30 09:00 Madrid → 07:00 UTC", () => {
    const utc = madridLocalToUtc("2025-03-30T09:00:00");
    const local = utcToMadrid(utc);
    expect(local.hour).toBe(9);
    expect(local.minute).toBe(0);
    expect(utc).toContain("07:00:00");
  });

  it("fall back: 2025-10-26 09:00 Madrid → 08:00 UTC", () => {
    const utc = madridLocalToUtc("2025-10-26T09:00:00");
    const local = utcToMadrid(utc);
    expect(local.hour).toBe(9);
    expect(utc).toContain("08:00:00");
  });

  it("winter time: 2025-01-15 09:00 Madrid → 08:00 UTC", () => {
    const utc = madridLocalToUtc("2025-01-15T09:00:00");
    expect(utc).toContain("08:00:00");
  });
});

describe("idempotency keys", () => {
  const pool = createPool();

  beforeAll(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("returns cached response for duplicate idempotency key", async () => {
    const postId = await insertScheduledPost(pool);
    const repo = new PostsRepository({ tenantId: TENANT_A, profileId: PROFILE_A });
    const payload = { id: postId, status: "published" };
    await repo.saveIdempotencyResponse("key-1", postId, payload);
    const cached = await repo.getIdempotencyResponse("key-1");
    expect(cached).toEqual(payload);
  });
});
