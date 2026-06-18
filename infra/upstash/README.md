# Upstash Redis — gobernador de rate limit (NO cola de jobs)

## Por qué Upstash (descartamos Redis autogestionado)

- **Serverless-native:** pago por request; sin instancia 24/7 que parchear.
- **Rol acotado:** solo token buckets de rate limit — la cola de publicación vive en **AWS SQS**.
- **Región UE:** `eu-central-1` (Frankfurt) al crear la base.
- **Alta disponibilidad gestionada:** sin failover manual ni upgrades de cluster.

## Claves Redis

| Clave | Propósito |
|---|---|
| `ratelimit:app:global` | Presupuesto OAuth compartido (cap por app) |
| `ratelimit:ambassador:{profile_id}` | Cap por Embajador (evita ráfagas → baneo) |
| `ratelimit:tenant:{tenant_id}` | Fair-share entre tenants |

Implementación: `worker/src/throttle.ts` (semáforos con TTL).

## Alternativa descartada

| Opción | Por qué no |
|---|---|
| ElastiCache / Redis en contenedor | Mantenimiento, parches, replicas — riesgo de error humano |
| BullMQ + Redis como cola | Duplica responsabilidad; SQS ya ofrece DLQ, retries y visibilidad nativos |

## Variables

```bash
# Producción (Upstash REST — sin conexión TCP persistente desde serverless)
UPSTASH_REDIS_REST_URL=https://eu1-xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# Local dev (docker redis)
REDIS_URL=redis://localhost:6379
```
