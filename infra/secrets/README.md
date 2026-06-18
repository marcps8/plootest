# HashiCorp Vault — gestión centralizada de secretos

## Por qué Vault (descartamos credenciales en código / env estáticas)

- **Source of truth único:** rotación, auditoría y políticas de acceso en un sitio.
- **Dynamic secrets:** credenciales de BD efímeras para incidentes (TTL 15 min).
- **Evita exposición en repo:** ningún secreto en git, Terraform state plano ni `.env` commiteado.

## Inventario → path Vault

| Secreto | Path Vault | Consumidor |
|---|---|---|
| `DATABASE_URL` (pooled) | `secret/data/ploot/prod/database-pooled` | Vercel (Node Route Handlers) |
| `DATABASE_URL_DIRECT` | `secret/data/ploot/prod/database-direct` | Railway worker |
| `JWT_SECRET` | `secret/data/ploot/prod/jwt` | Vercel Edge middleware + Node |
| `OAUTH_CLIENT_SECRET` | `secret/data/ploot/prod/oauth-client` | Vercel + Railway |
| `TOKEN_ENCRYPTION_KEY` | `secret/data/ploot/prod/token-encryption` | Vercel + Railway |
| `UPSTASH_REDIS_REST_URL` | `secret/data/ploot/prod/upstash-url` | Railway worker |
| `UPSTASH_REDIS_REST_TOKEN` | `secret/data/ploot/prod/upstash-token` | Railway worker |
| AWS creds SQS | `aws/creds/ploot-worker` (dynamic) | Railway worker |

## Sync hacia plataformas

```
Vault (KV v2)
 ├── Vercel Integration / OIDC → env vars preview + production
 └── Railway Vault agent sidecar → env vars worker
```

## Rotación

- **JWT / OAuth client:** manual trimestral con overlap 24h (aceptar old + new key).
- **DATABASE_URL:** Neon rotation → Vault update → sync Vercel/Railway.
- **TOKEN_ENCRYPTION_KEY:** envelope rotation + job re-encrypt tokens.

## CI/CD

GitHub Actions usa `hashicorp/vault-action` con `VAULT_TOKEN` efímero (role `ci-migrate`, TTL 10 min) para migraciones — nunca password permanente en secrets de GitHub.
