# Neon Postgres — configuración gestionada

## Por qué Neon (vs RDS autogestionado)

- **Pooler integrado**: endpoint `-pooler` en transaction mode → compatible con serverless Vercel sin agotar `max_connections`.
- **Región UE**: proyecto en `aws-eu-central-1` (Frankfurt) para GDPR/residencia de datos.
- **Backups automáticos**: PITR (point-in-time recovery) incluido en plan Pro.
- **Cifrado en reposo**: AES-256 por defecto.
- **Branching**: branches de BD para preview deploys (opcional, ver `branching.md`).

## Variables de entorno

Crear en Neon Console → Project Settings → Connection Details:

```bash
# Conexión directa (solo worker de larga vida)
DATABASE_URL_DIRECT=postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/ploot?sslmode=require

# Conexión pooled (Route Handlers serverless en Vercel)
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.eu-central-1.aws.neon.tech/ploot?sslmode=require&pgbouncer=true
```

## Índice recomendado (query caliente del worker)

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_scheduled_due
  ON posts (scheduled_at)
  WHERE status = 'scheduled';
```

## Migraciones

Las migraciones NO corren en el arranque de cada instancia serverless.
Ver `.github/workflows/ci.yml` → job `migrate-production` (un solo runner, expand/contract).
