-- Schema inicial para el scheduler (Parte C compartirá este esquema)
-- Ejecutar via migraciones en CI, no en runtime serverless

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE post_status AS ENUM (
  'draft',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'cancelled'
);

CREATE TABLE tenants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE posts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  profile_id   UUID NOT NULL REFERENCES profiles(id),
  content      TEXT NOT NULL,
  status       post_status NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  external_id  TEXT,
  error_code   TEXT,
  error_detail TEXT,
  publish_attempts INT NOT NULL DEFAULT 0,
  publishing_started_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_posts_tenant_status ON posts (tenant_id, status);
CREATE INDEX idx_posts_scheduled_due ON posts (scheduled_at) WHERE status = 'scheduled';

CREATE TABLE oauth_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  profile_id      UUID NOT NULL REFERENCES profiles(id),
  encrypted_token TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, profile_id)
);

CREATE TABLE idempotency_keys (
  key        TEXT NOT NULL,
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  post_id    UUID NOT NULL REFERENCES posts(id),
  response   JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);
