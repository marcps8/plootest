# Infraestructura — Parte B.1

Topología alineada con el principio de **velocidad, simplicidad y servicios gestionados** — maximizar disponibilidad sin añadir complejidad operativa ni riesgo de error humano.

## Principio de diseño

Priorizamos respuestas rápidas y arquitectura simple para un servicio fiable. Cada pieza gestionada sustituye una alternativa autogestionada con mayor riesgo operativo:

| Capa | Elegido | Descartado | Motivo |
|---|---|---|---|
| Edge CDN/WAF | **Cloudflare** | AWS CloudFront | Configuración más simple; WAF/CDN/DDoS en un panel |
| App API | **Vercel** (Edge auth + Node runtime) | Kubernetes | Despliegue ágil; sin operar clusters |
| Persistencia | **Neon Postgres + PgBouncer** | RDS | Pooler incluido; sin parches/backups manuales |
| Workers | **Railway** (long-lived) | Vercel Cron Jobs | Cron tiene timeout; worker necesita proceso persistente |
| Cola + DLQ | **AWS SQS** | BullMQ/Redis como cola | Resiliencia nativa (DLQ, redrive, visibilidad) |
| Rate limit | **Upstash Redis** | Redis autogestionado | Solo gobernador; sin mantener cluster |
| Secretos | **HashiCorp Vault** | Credenciales en repo/env | Rotación, auditoría, dynamic secrets |
| Observabilidad | **Datadog** | Stack self-hosted | Golden signals + tracing consolidados |

## Arquitectura

```
          ┌──────────────────────────────────────────────┐
          │     Cloudflare (CDN · WAF · DDoS · TLS)       │
          └─────────────────────┬────────────────────────┘
                                │
          ┌─────────────────────▼────────────────────────┐
          │              Vercel (fra1 — UE)                 │
          │  Edge Runtime → JWT auth (middleware)           │
          │  Node Runtime  → Route Handlers + Postgres pool │
          └────────────┬───────────────────┬─────────────────┘
                       │                   │
                       ▼                   ▼
              ┌──────────────┐    ┌──────────────────┐
              │ Neon Postgres │    │  Mock/Proveedor   │
              │ + PgBouncer   │    │  externo          │
              └───────┬──────┘    └──────────────────┘
                      │
          ┌───────────▼───────────┐
          │  Railway Worker        │
          │  (long-lived process)  │
          └───┬──────────────┬────┘
              │              │
              ▼              ▼
     ┌─────────────┐  ┌──────────────┐
     │  AWS SQS     │  │ Upstash Redis │
     │  jobs + DLQ  │  │ rate limit    │
     └─────────────┘  └──────────────┘

          ┌──────────────────────────────────────────────┐
          │  Vault (secretos)  ·  Datadog (observabilidad) │
          └──────────────────────────────────────────────┘
```

## Flujo del scheduler (Parte C)

1. **Poll Postgres** — `FOR UPDATE SKIP LOCKED` reclama posts due → `publishing`.
2. **Encola AWS SQS** — mensaje con `postId`, `profileId`, `traceId` (atributo SQS).
3. **Worker consume SQS** — long polling; tras 5 receives → **DLQ** automática.
4. **Rate limit Upstash** — antes de llamar al proveedor; cap global + por Embajador.
5. **429** — re-encola SQS con `DelaySeconds` (= Retry-After); no retry-storm.

## Piezas y config

| Componente | Plataforma | Config |
|---|---|---|
| CDN/WAF | Cloudflare | `infra/cloudflare/` |
| Next.js API | Vercel | `infra/vercel.json` |
| Worker | Railway | `infra/railway.toml` |
| Postgres + pooler | Neon | `infra/neon/` |
| Cola + DLQ | AWS SQS | `infra/aws/sqs.tf` |
| Rate limit | Upstash Redis | `infra/upstash/` |
| Secretos | Vault | `infra/secrets/` |
| Observabilidad | Datadog | `infra/datadog/` |
| Local dev | Docker Compose | `infra/docker-compose.yml` |
| Diagrama Parte A | Imagen original | [`docs/diagrams/arquitectura-parte-a.png`](../docs/diagrams/arquitectura-parte-a.png) |

## Despliegue

Ver [README.md](../README.md).
