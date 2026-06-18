import type pg from "pg";
import type { Post } from "./types.js";
import {
  AppError,
  ProviderUnavailableError,
  RateLimitedError,
  TokenRevokedError,
} from "./errors.js";
import { callProviderPublish, resolveAccessToken } from "./tokens.js";

export interface PublishOutcome {
  post: Post;
  retryAfterSeconds?: number;
}


export { claimPostForPublishing } from "./claim.js";

export async function publishClaimedPost(
  client: pg.PoolClient,
  post: Post,
  traceId?: string
): Promise<PublishOutcome> {
  try {
    const accessToken = await resolveAccessToken(client, post.tenant_id, post.profile_id);
    const result = await callProviderPublish(accessToken, post.content, traceId);

    if (result.status === 200 && result.externalId) {
      const { rows } = await client.query<Post>(
        `UPDATE posts
         SET status = 'published', external_id = $2, error_code = NULL, error_detail = NULL, updated_at = now()
         WHERE id = $1 AND status = 'publishing'
         RETURNING *`,
        [post.id, result.externalId]
      );
      return { post: rows[0] ?? post };
    }

    if (result.errorCode === "token_revoked") {
      await markFailed(client, post.id, "token_revoked", "Token revoked by provider", false);
      throw new TokenRevokedError();
    }

    await markFailed(client, post.id, "provider_error", result.errorCode ?? "unknown", true);
    throw new AppError("Provider rejected publish", "provider_error", 502, true);
  } catch (e) {
    if (e instanceof RateLimitedError) {
      await client.query(
        `UPDATE posts SET status = 'scheduled', updated_at = now() WHERE id = $1 AND status = 'publishing'`,
        [post.id]
      );
      throw e;
    }
    if (e instanceof TokenRevokedError) {
      await markFailed(client, post.id, "token_revoked", e.message, false);
      throw e;
    }
    if (e instanceof ProviderUnavailableError) {
      const attempts = post.publish_attempts + 1;
      if (attempts >= 5) {
        await markFailed(client, post.id, "provider_unavailable", e.message, false);
      } else {
        await client.query(
          `UPDATE posts
           SET status = 'scheduled', publish_attempts = $2, updated_at = now()
           WHERE id = $1 AND status = 'publishing'`,
          [post.id, attempts]
        );
      }
      throw e;
    }
    throw e;
  }
}

async function markFailed(
  client: pg.PoolClient,
  postId: string,
  code: string,
  detail: string,
  revertToScheduled: boolean
): Promise<void> {
  if (revertToScheduled) {
    await client.query(
      `UPDATE posts SET status = 'scheduled', error_code = $2, error_detail = $3, updated_at = now()
       WHERE id = $1`,
      [postId, code, detail]
    );
    return;
  }
  await client.query(
    `UPDATE posts SET status = 'failed', error_code = $2, error_detail = $3, updated_at = now()
     WHERE id = $1`,
    [postId, code, detail]
  );
}

/** Recover posts stuck in publishing after a crash (worker restart). */
export async function recoverStalePublishing(
  client: pg.PoolClient,
  staleMinutes = 5
): Promise<number> {
  if (staleMinutes === 0) {
    const { rowCount } = await client.query(
      `UPDATE posts
       SET status = 'scheduled', updated_at = now()
       WHERE status = 'publishing' AND external_id IS NULL`
    );
    return rowCount ?? 0;
  }

  const { rowCount } = await client.query(
    `UPDATE posts
     SET status = 'scheduled', updated_at = now()
     WHERE status = 'publishing'
       AND publishing_started_at < now() - ($1 || ' minutes')::interval
       AND external_id IS NULL`,
    [String(staleMinutes)]
  );
  return rowCount ?? 0;
}

export async function claimDueScheduledPosts(
  client: pg.PoolClient,
  limit = 50
): Promise<Post[]> {
  const { rows } = await client.query<Post>(
    `WITH due AS (
       SELECT id
       FROM posts
       WHERE status = 'scheduled'
         AND scheduled_at <= now()
       ORDER BY scheduled_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE posts p
     SET status = 'publishing', publishing_started_at = now(), updated_at = now()
     FROM due
     WHERE p.id = due.id
     RETURNING p.*`,
    [limit]
  );
  return rows;
}
