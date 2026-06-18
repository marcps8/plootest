# Datadog — observabilidad consolidada

## Por qué Datadog

- **Golden signals + negocio en un panel:** latencia, errores, saturación y `publish_success_rate` por tenant.
- **Tracing distribuido:** OpenTelemetry → Datadog APM; correlación Route Handler → SQS → worker → proveedor.
- **Logs JSON estructurados:** el worker emite `{ ddsource: "nodejs", traceId, event, ... }` listos para ingest.

## Métricas clave

| Métrica | Tipo | Alerta |
|---|---|---|
| `ploot.api.latency.p95` | Latency | Page > 4s |
| `ploot.publish.success_rate` | Negocio | Page < 90% / 15 min |
| `ploot.publish.lag_seconds.p95` | Negocio | Ticket > 300s |
| `ploot.sqs.approximate_age_of_oldest_message` | Saturation | Ticket |
| `ploot.postgres.pool.wait_ms` | Saturation | Ticket |

## Tracing (W3C → Datadog)

1. **Edge middleware (Vercel):** valida JWT; propaga `traceparent`.
2. **Route Handler (Node):** span hijo; al encolar SQS incluye `traceId` en message attributes.
3. **Worker (Railway):** extrae trace de SQS → span → header `traceparent` al proveedor.
4. **Datadog:** flamegraph end-to-end.

## Variables

```bash
DD_API_KEY=@vault/datadog-api-key
DD_SITE=datadoghq.eu          # residencia UE
DD_SERVICE=ploot-scheduler
DD_ENV=production
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.datadoghq.eu
```

## Alternativa descartada

Honeycomb/Grafana self-hosted — más piezas que operar; Datadog reduce time-to-insight para equipo pequeño.
