import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import {
  claimDueScheduledPosts,
  claimPostForPublishing,
  publishClaimedPost,
  recoverStalePublishing,
} from "@ploot/shared";
import {
  createPool,
  resetDatabase,
  insertScheduledPost,
  TENANT_A,
  PROFILE_A,
} from "../../shared/tests/helpers.js";

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      const auth = headers.get("authorization") ?? "";

      if (url.includes("/provider/publish")) {
        if (auth.includes("revoked-token")) {
          return new Response(JSON.stringify({ error: "token_revoked" }), { status: 401 });
        }
        return new Response(JSON.stringify({ external_id: "ext_crash_test" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/provider/oauth/refresh")) {
        return new Response(JSON.stringify({ access_token: "valid-token", expires_in: 3600 }), {
          status: 200,
        });
      }
      return new Response("not found", { status: 404 });
    })
  );
}

describe("crash safety — N worker replicas", () => {
  const pool = createPool();

  beforeAll(async () => {
    process.env.DETERMINISTIC = "1";
  });

  beforeEach(async () => {
    installFetchMock();
    await resetDatabase(pool);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await pool.end();
  });

  it("only one worker claims the same scheduled post (FOR UPDATE SKIP LOCKED)", async () => {
    const postId = await insertScheduledPost(pool, { content: "race-test-1" });

    const clientA = await pool.connect();
    const clientB = await pool.connect();
    try {
      await clientA.query("BEGIN");
      await clientB.query("BEGIN");

      const claimedA = await claimDueScheduledPosts(clientA, 10);
      const claimedB = await claimDueScheduledPosts(clientB, 10);

      await clientA.query("COMMIT");
      await clientB.query("COMMIT");

      const allIds = [...claimedA, ...claimedB].map((p) => p.id);
      expect(allIds.filter((id) => id === postId)).toHaveLength(1);
    } finally {
      clientA.release();
      clientB.release();
    }
  });

  it("crash mid-publish: recovery prevents duplicate claim while publishing", async () => {
    const postId = await insertScheduledPost(pool, { content: "crash-test-2" });
    const client = await pool.connect();

    try {
      const claimed = await claimDueScheduledPosts(client, 1);
      expect(claimed[0]?.id).toBe(postId);

      const secondClaim = await claimDueScheduledPosts(client, 10);
      expect(secondClaim.find((p) => p.id === postId)).toBeUndefined();

      await recoverStalePublishing(client, 0);

      const { rows } = await client.query<{ status: string; external_id: string | null }>(
        `SELECT status, external_id FROM posts WHERE id = $1`,
        [postId]
      );
      expect(rows[0].status).toBe("scheduled");
      expect(rows[0].external_id).toBeNull();

      const reclaimed = await claimPostForPublishing(client, postId);
      expect(reclaimed?.id).toBe(postId);

      await publishClaimedPost(client, reclaimed as never);
      const { rows: final } = await client.query<{ status: string; external_id: string | null }>(
        `SELECT status, external_id FROM posts WHERE id = $1`,
        [postId]
      );
      expect(final[0].status).toBe("published");
      expect(final[0].external_id).toBe("ext_crash_test");
    } finally {
      client.release();
    }
  });

  it("token revoked marks failed without retry storm", async () => {
    await pool.query(
      `UPDATE oauth_tokens SET encrypted_token = 'revoked-token', encrypted_refresh_token = 'revoked'
       WHERE tenant_id = $1 AND profile_id = $2`,
      [TENANT_A, PROFILE_A]
    );
    const postId = await insertScheduledPost(pool, { content: "revoked-test" });
    const client = await pool.connect();
    try {
      const claimed = await claimPostForPublishing(client, postId);
      expect(claimed?.id).toBe(postId);
      await expect(publishClaimedPost(client, claimed as never)).rejects.toMatchObject({
        code: "token_revoked",
      });
      const { rows } = await client.query<{ status: string; error_code: string }>(
        `SELECT status, error_code FROM posts WHERE id = $1`,
        [postId]
      );
      expect(rows[0].status).toBe("failed");
      expect(rows[0].error_code).toBe("token_revoked");
    } finally {
      client.release();
    }
  });
});
