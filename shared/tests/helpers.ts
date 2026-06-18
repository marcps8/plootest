import pg from "pg";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, "../../infra/neon/schema.sql");

export const TENANT_A = "11111111-1111-1111-1111-111111111111";
export const TENANT_B = "22222222-2222-2222-2222-222222222222";
export const PROFILE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
export const PROFILE_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

export function createPool(): pg.Pool {
  return new pg.Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://ploot:ploot_dev@localhost:5432/ploot?sslmode=disable",
  });
}

async function execSqlFile(pool: pg.Pool, filePath: string): Promise<void> {
  const sql = readFileSync(filePath, "utf8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));
  for (const statement of statements) {
    await pool.query(statement);
  }
}

export async function resetDatabase(pool: pg.Pool): Promise<void> {
  await pool.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
  await execSqlFile(pool, schemaPath);
  await pool.query(
    `INSERT INTO tenants (id, name) VALUES ($1, 'Acme Corp'), ($2, 'Beta Inc')`,
    [TENANT_A, TENANT_B]
  );
  await pool.query(
    `INSERT INTO profiles (id, tenant_id, name) VALUES ($1, $3, 'Alice'), ($2, $4, 'Bob')`,
    [PROFILE_A, PROFILE_B, TENANT_A, TENANT_B]
  );
  await pool.query(
    `INSERT INTO oauth_tokens (tenant_id, profile_id, encrypted_token, encrypted_refresh_token, expires_at)
     VALUES ($1, $3, 'valid-token', 'refresh-a', now() + interval '1 hour'),
            ($2, $4, 'valid-token', 'refresh-b', now() + interval '1 hour')`,
    [TENANT_A, TENANT_B, PROFILE_A, PROFILE_B]
  );
}

export async function insertScheduledPost(
  pool: pg.Pool,
  input: {
    tenantId?: string;
    profileId?: string;
    content?: string;
    scheduledAt?: Date;
  } = {}
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO posts (tenant_id, profile_id, content, status, scheduled_at)
     VALUES ($1, $2, $3, 'scheduled', $4)
     RETURNING id`,
    [
      input.tenantId ?? TENANT_A,
      input.profileId ?? PROFILE_A,
      input.content ?? "test post",
      input.scheduledAt ?? new Date(Date.now() - 60_000),
    ]
  );
  return rows[0].id;
}
