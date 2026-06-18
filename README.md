# Ploot Scheduler — Backend Assessment

Scheduler de publicación para signal-based selling.

## Contenido del repo

| Ruta | Parte | Descripción |
|------|-------|-------------|
| [`WRITEUP.md`](WRITEUP.md) | A, B.2, B.3, D, E | Respuestas escritas (en ese orden) + declaración de IA al final |
| [`infra/`](infra/) | B.1 | IaC y config de despliegue (Vercel, Railway, SQS, Redis, Vault, Datadog) |
| [`app/`](app/) + [`worker/`](worker/) | C | Route Handlers Next.js + worker separado (SQS + Postgres poller) |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | B.2 | Pipeline CI/CD (no requiere credenciales para revisar) |
| [`shared/`](shared/) | C | Lógica compartida (DB, auth, publish, tokens) |

**Stack:** Cloudflare → Vercel (Edge + Node) · Neon Postgres · Railway workers · AWS SQS · Upstash Redis · Vault · Datadog

## Requisitos

- **Docker Desktop** (o Docker Engine + Compose v2)
- **Node.js 22+** y npm

## Levantar en local (< 10 min)

Desde la raíz del repo:

```bash
git clone <repo-url> plootest && cd plootest

npm install --prefix shared && npm run build --prefix shared
npm install --prefix app
npm install --prefix worker
npm install --prefix mock-provider

docker compose -f infra/docker-compose.yml up --build
```

Primera vez: el build de imágenes puede tardar ~5 min; arranques siguientes ~1 min.

### Comprobar que funciona

```bash
curl http://localhost:3000/api/health   # app (Next.js)
curl http://localhost:8080/health         # worker
curl http://localhost:4000/health       # mock-provider
```

| Servicio | Puerto | Rol |
|----------|--------|-----|
| app | 3000 | Next.js — Edge auth + Node API |
| worker | 8080 | Consumer SQS + poller Postgres |
| postgres | 5432 | BD local (schema en `infra/neon/`) |
| redis | 6379 | Rate limit (Upstash-like) |
| localstack | 4566 | AWS SQS + DLQ local |
| mock-provider | 4000 | Proveedor externo simulado |

## Parte C — API rápida

JWT validado en Edge middleware (`app/src/middleware.ts`) y en handlers.

```bash
npm run build --prefix shared
TOKEN=$(node scripts/get-token.mjs)

curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/posts
```

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/v1/posts` | Crear post (`draft` \| `scheduled`) |
| GET | `/api/v1/posts?status=&limit=&cursor=` | Listar posts del tenant |
| PATCH | `/api/v1/posts/:id` | Editar (rechazado si `published`) |
| DELETE | `/api/v1/posts/:id` | Cancelar (rechazado si `published`) |
| POST | `/api/v1/posts/:id/publish` | Publicación inmediata (`Idempotency-Key`) |

**Worker:** poll Postgres (`FOR UPDATE SKIP LOCKED`) → SQS → rate limit Redis → publish. Sin `SQS_QUEUE_URL`, procesa inline (tests CI).

## Tests

```bash
docker compose -f infra/docker-compose.yml up -d postgres redis
npm run build --prefix shared
DATABASE_URL=postgresql://ploot:ploot_dev@localhost:5432/ploot npm run test --prefix shared
DATABASE_URL=postgresql://ploot:ploot_dev@localhost:5432/ploot npm run test --prefix worker
```

`worker` compila `shared` automáticamente vía `pretest` si falta `dist/`.

## Producción

Ver [`infra/README.md`](infra/README.md).
