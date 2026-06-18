import type pg from "pg";
import type { Post } from "./types.js";

const CLAIMABLE = ["scheduled", "draft"];

export async function claimPostForPublishing(
  client: pg.PoolClient,
  postId: string,
  tenantId?: string
): Promise<Post | null> {
  if (tenantId) {
    const { rows } = await client.query<Post>(
      `UPDATE posts
       SET status = 'publishing', publishing_started_at = now(), updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND status = ANY($3::post_status[])
       RETURNING *`,
      [postId, tenantId, CLAIMABLE]
    );
    return rows[0] ?? null;
  }

  const { rows } = await client.query<Post>(
    `UPDATE posts
     SET status = 'publishing', publishing_started_at = now(), updated_at = now()
     WHERE id = $1 AND status = ANY($2::post_status[])
     RETURNING *`,
    [postId, CLAIMABLE]
  );
  return rows[0] ?? null;
}
