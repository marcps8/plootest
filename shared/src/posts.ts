import type { QueryResult, QueryResultRow } from "pg";
import type { AuthContext, Post, PostStatus } from "./types.js";
import { ConflictError, NotFoundError, ValidationError } from "./errors.js";
import { madridLocalToUtc } from "./timezone.js";
import { getPool } from "./db.js";

export class PostsRepository {
  constructor(private readonly ctx: AuthContext) {}

  async create(input: {
    content: string;
    status?: "draft" | "scheduled";
    scheduled_at?: string | null;
  }): Promise<Post> {
    const status = input.status ?? "draft";
    let scheduledAt: string | null = null;

    if (status === "scheduled") {
      if (!input.scheduled_at) {
        throw new ValidationError("scheduled_at is required when status is scheduled");
      }
      scheduledAt = madridLocalToUtc(input.scheduled_at);
    }

    const { rows } = await this.query<Post>(
      `INSERT INTO posts (tenant_id, profile_id, content, status, scheduled_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [this.ctx.tenantId, this.ctx.profileId, input.content, status, scheduledAt]
    );
    return rows[0];
  }

  async getById(id: string): Promise<Post> {
    const { rows } = await this.query<Post>(
      `SELECT * FROM posts WHERE id = $1 AND tenant_id = $2`,
      [id, this.ctx.tenantId]
    );
    if (rows.length === 0) {
      throw new NotFoundError("Post");
    }
    return rows[0];
  }

  async update(
    id: string,
    input: { content?: string; status?: "draft" | "scheduled"; scheduled_at?: string | null }
  ): Promise<Post> {
    const current = await this.getById(id);
    if (current.status === "published") {
      throw new ConflictError("Cannot edit a published post");
    }
    if (current.status === "publishing") {
      throw new ConflictError("Cannot edit a post while publishing");
    }

    const content = input.content ?? current.content;
    let status = (input.status ?? current.status) as PostStatus;
    let scheduledAt = current.scheduled_at;

    if (input.scheduled_at !== undefined) {
      scheduledAt = input.scheduled_at ? madridLocalToUtc(input.scheduled_at) : null;
    }

    if (input.status === "draft") {
      status = "draft";
      scheduledAt = null;
    }

    if (status === "scheduled" && !scheduledAt) {
      throw new ValidationError("scheduled_at is required when status is scheduled");
    }

    const { rows } = await this.query<Post>(
      `UPDATE posts
       SET content = $3, status = $4, scheduled_at = $5, updated_at = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [id, this.ctx.tenantId, content, status, scheduledAt]
    );
    return rows[0];
  }

  async cancel(id: string): Promise<Post> {
    const current = await this.getById(id);
    if (current.status === "published") {
      throw new ConflictError("Cannot cancel a published post");
    }

    const { rows } = await this.query<Post>(
      `UPDATE posts
       SET status = 'cancelled', updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND status != 'published'
       RETURNING *`,
      [id, this.ctx.tenantId]
    );
    if (rows.length === 0) {
      throw new NotFoundError("Post");
    }
    return rows[0];
  }

  async list(input: {
    status?: PostStatus;
    limit?: number;
    cursor?: string;
  }): Promise<{ items: Post[]; nextCursor: string | null }> {
    const limit = Math.min(input.limit ?? 20, 100);
    const params: unknown[] = [this.ctx.tenantId];
    let where = "tenant_id = $1";

    if (input.status) {
      params.push(input.status);
      where += ` AND status = $${params.length}`;
    }

    if (input.cursor) {
      const decoded = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")) as {
        created_at: string;
        id: string;
      };
      params.push(decoded.created_at, decoded.id);
      where += ` AND (created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
    }

    params.push(limit + 1);
    const { rows } = await this.query<Post>(
      `SELECT * FROM posts
       WHERE ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT $${params.length}`,
      params
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last
        ? Buffer.from(JSON.stringify({ created_at: last.created_at, id: last.id }), "utf8").toString(
            "base64url"
          )
        : null;

    return { items, nextCursor };
  }

  async getIdempotencyResponse(key: string): Promise<unknown | null> {
    const { rows } = await this.query<{ response: unknown }>(
      `SELECT response FROM idempotency_keys WHERE tenant_id = $1 AND key = $2`,
      [this.ctx.tenantId, key]
    );
    return rows[0]?.response ?? null;
  }

  async saveIdempotencyResponse(key: string, postId: string, response: unknown): Promise<void> {
    await this.query(
      `INSERT INTO idempotency_keys (tenant_id, key, post_id, response)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, key) DO NOTHING`,
      [this.ctx.tenantId, key, postId, JSON.stringify(response)]
    );
  }

  private query<T extends QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    return getPool().query<T>(text, params);
  }
}

/** Cross-tenant access attempt — always scoped by tenant_id in SQL */
export async function getPostForTenant(
  client: import("pg").PoolClient,
  postId: string,
  tenantId: string
): Promise<Post | null> {
  const { rows } = await client.query<Post>(
    `SELECT * FROM posts WHERE id = $1 AND tenant_id = $2`,
    [postId, tenantId]
  );
  return rows[0] ?? null;
}
