-- Seed data for local development
INSERT INTO tenants (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Acme Corp'),
  ('22222222-2222-2222-2222-222222222222', 'Beta Inc');

INSERT INTO profiles (id, tenant_id, name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Embajador Alice'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Embajador Bob');

INSERT INTO oauth_tokens (tenant_id, profile_id, encrypted_token, encrypted_refresh_token, expires_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'valid-token', 'refresh-a', now() + interval '1 hour'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'valid-token', 'refresh-b', now() + interval '1 hour');

INSERT INTO posts (tenant_id, profile_id, content, status, scheduled_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Hello from Alice', 'scheduled', now() - interval '1 minute'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Hello from Bob', 'scheduled', now() + interval '5 minutes');
