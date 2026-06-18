# Ploot Backend Assessment — WRITEUP

---

## Parte A — Diseño de sistema

### 1. Arquitectura de referencia

Las opciones elegidas en cada sección han sido priorizando la velocidad en las respuestas y la simpleza de estas, para poder dar un servicio fiable y sin alta complejidad. Para garantizar la máxima disponibilidad y eficiencia operativa, hemos diseñado un stack basado en servicios gestionados que optimizan el rendimiento sin añadir complejidad técnica: Cloudflare protege y acelera la red mediante un CDN/WAF global (descartando soluciones como AWS CloudFront por su mayor complejidad de configuración), Vercel permite un despliegue ágil combinando la velocidad del Edge para autenticación con el Node Runtime para renderizado intensivo (evitando el despliegue en Kubernetes, mayor complejidad técnica), mientras que Postgres Neon y su PgBouncer aseguran una persistencia escalable y eficiente (descartando RDS debido a que el mantenimiento manual de parches y backups implica un alto riesgo de error humano). Para la lógica asíncrona y de control, empleamos Railway para ejecutar workers de larga duración (descartando los Cron Jobs de Vercel por sus limitaciones técnicas de tiempo de ejecución), AWS SQS para gestionar colas con resiliencia, y Upstash Redis como gobernador de rate limit nativo para la nube (evitando configurar contenedores Redis propios que añadirían tareas de mantenimiento innecesarias); finalmente, centralizamos la seguridad con Vault para la gestión de secretos (evitando la exposición de credenciales en el código fuente) y garantizamos la observabilidad mediante Datadog, consolidando una arquitectura robusta que prioriza la velocidad de entrega y la estabilidad ante el error humano.

Diagrama de arquitectura — Parte A

El diagrama se puede observar en docs/diagrams/arquitectura-parte-a.png .

El coste mensual aproximado de este sistema para 5k cuentas podría ser el siguiente:

- Vercel pro: 1000€
- Postgres: 1500€ (lo más caro por el número de users)
- Redis: 500€
- Railway: 1000€
- Datahog: 800€

En total unos 4800€ aprox, por mantener el sistema.

### 2. Tokens, rate limits, datos y conexiones

**Tokens OAuth.** Deberíamos guardarlos cifrados en la tabla credentials de Postgres, con el esquema de cifrado en el servicio de gestión de secretos. Usamos un patrón de refresco basado en el valor de access_token_expires_at, si es bajo usaremos refresh_token. Ante mensajes de revocación, moveremos los tokens a la cola DLQ para reconectar manualmente por el user. Finalmente para el modelo de tenacy, cada registro de token debe llevar una columna tenant_id indexada.

**Gobierno del rate limit.** Usaremos nuestro servidor de Redis Upstash para contar por una parte las requests totales de la app (total_requests), y por otra las requests por tenant usando su tenant_id. Esto se ejecutara en el middleware de Next.js, incrementando los contadores y lanzando un mensaje crítico cuando se llegue a alguno de los límites, pero siguiendo dando servicio.

**Query caliente + conexiones bajo serverless.** Usamos PgBouncer en transaction mode, para evitar que cada petición abra una puerta nueva a la base de datos, se organiza una cola eficiente. Así, la base de datos nunca se bloquea, trabaja a su ritmo y nosotros evitamos que el sistema se caiga por exceso de "clientes" (instancias serverless) intentando entrar a la vez. el EXPLAIN debería mostrar un Index Scan sobre idx_posts_scheduled_status, evitando a toda costa un Seq Scan.

**GDPR.** Borrado en producción en las tablas maestras, lo anonimizamos con hashes. En caches de Redis borramos usando el tenant_id, y los backups los restauraremos solamente si es estrictamente necesario, con un script de limpieza posterior. En los logs de Datadog, usaremos TTL para que se borren periódicamente.

---

## Parte B.2 — CI/CD y observabilidad

#### 1. Forma del pipeline

**En PR:** `lint + typecheck` → `integration tests` (Postgres + Redis en services) → **preview deploy** en Vercel (URL única por PR). Bloquea merge si tests rojos.

**En merge a `main`:** gate `migrate-production` (1 runner, Vault token efímero) → deploy Vercel production → deploy Railway worker (2 réplicas) → smoke test `/api/health`.

**Bloqueo producción:** tests fallidos, migración fallida, o smoke test roto.

**Aprobación manual:** GitHub Environment `production` requiere aprobación de 1 reviewer antes de `migrate-production`.

**Rollback automático:** job `rollback-watch` monitoriza 5 min post-deploy; si `error_rate > 5%` o `publish_success_rate < 95%` (SLO burn), Vercel instant rollback + Railway redeploy del deployment anterior.

#### 2. Migraciones de BD en deploy

Migraciones corren **una sola vez** en CI (`migrate-production`), nunca en cold start de Route Handlers.

Patrón **expand/contract**:

- **Expand:** añadir columna nullable / nuevo índice CONCURRENTLY → deploy código que escribe en ambos.
- **Contract:** tras validar, deploy código que solo usa lo nuevo → migración que elimina lo viejo.

Compatible con rollback de Next.js: la versión N-1 sigue leyendo columnas que aún existen.

#### 3. Golden signals + métrica de negocio (Datadog)


| Señal      | Métrica                                     | Alerta                           |
| ---------- | ------------------------------------------- | -------------------------------- |
| Latency    | p95 Route Handlers                          | Ticket si > 2s; **page** si > 4s |
| Traffic    | req/s por endpoint                          | Informativo                      |
| Errors     | 5xx rate + `failed` posts                   | **Page** si > 5% en 5 min        |
| Saturation | Postgres pool wait + SQS age + Redis memory | Ticket si pool wait > 100ms p95  |
| Negocio    | `publish_success_rate` por tenant           | **Page** si < 90% en 15 min      |
| Negocio    | `publish_lag_seconds` (now - scheduled_at)  | Ticket si p95 > 300s             |


**Page vs ticket:** pageamos lo que afecta cuentas de clientes (errores masivos, publicaciones fallidas). Ticket para degradación gradual (lag, saturación).

#### 4. Tracing distribuido

- **Cloudflare** → pasa `traceparent` al origen Vercel.
- **Edge middleware:** valida JWT; propaga trace context.
- **Route Handler (Node):** span hijo; encola **AWS SQS** con `traceId` en MessageAttributes.
- **Worker (Railway):** consume SQS → span → header `traceparent` al proveedor.
- **Datadog APM:** correlación end-to-end + logs JSON (`ddsource: nodejs`).

---

## Parte B.3 — Seguridad

#### 1. Inventario de secretos


| Secreto               | Ubicación                                                            | Rotación                                    | Riesgo env vars Next.js                                        |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| OAuth token/Embajador | Postgres (`encrypted_token`, AES-256-GCM con `TOKEN_ENCRYPTION_KEY`) | Refresh proactivo; revocación → soft-delete | N/A (no en env)                                                |
| OAuth client secret   | **Vault** → Vercel/Railway env                                       | Manual trimestral; overlap 24h              | **Alto:** visible en Vercel dashboard, build logs, crash dumps |
| DATABASE_URL          | **Vault** → env por entorno                                          | Neon password rotation → Vault sync         | **Alto:** acceso total a datos                                 |
| TOKEN_ENCRYPTION_KEY  | **Vault** → env                                                      | Envelope rotation + re-encrypt job          | **Crítico:** expone todos los tokens                           |
| JWT_SECRET            | **Vault** → Vercel                                                   | Dual-key validation 24h overlap             | Medio: permite impersonation                                   |
| Upstash Redis token   | **Vault** → Railway worker                                           | Upstash console → Vault sync                | Medio: acceso a rate limits                                    |
| AWS SQS creds         | **Vault dynamic secrets** → Railway                                  | TTL corto; auto-rotación                    | Medio: acceso a cola                                           |


Mitigación env vars: least-privilege en Vercel team, no loguear env, **Vault Agent sync** (no copiar manual), rotar tras offboarding.

#### 2. Cero credenciales permanentes de BD + debug en minutos

- Neon **branching** o **read-only role** con TTL para incidentes.
- Acceso via **Vault dynamic secrets** (DB creds 15 min) o Neon Console con SSO + audit log.
- Flujo: on-call abre ticket → approver autoriza → Vault grant read-only → expira automáticamente.
- Break-glass: cuenta `breakglass@` con MFA + alerta inmediata a #security + Datadog.

#### 3. Tres controles diferidos (6 meses) — y por qué

1. **Pentest externo formal:** pre-PMF, superficie acotada, CI + dependabot cubren 80%. Diferir hasta primer cliente enterprise.
2. **SIEM/SOC centralizado:** Datadog Security Monitoring bastan; SIEM dedicado necesita analista. Diferir hasta >10 eng.
3. **Rotación automática agresiva (<7 días) de todos los secretos:** alta fricción operativa; rotación trimestral + post-incident es suficiente ahora. Documentado en ADR-003.

---

## Parte D — Operaciones

### D.1 — 09:00 CET: 429 masivos + Postgres agotado + cola acumulándose

Datadog ve 429 + `Retry-After` → confirmas que es un pico a las 09:00 (no un bug) → Redis frena publicaciones y respetas el delay → la causa es falta de jitter → el fix es espaciar con `hash(profile_id)`

---

### D.2 — Oleada de revocación masiva de tokens OAuth (TTL acortado)

Redis avisa antes de que explote todo porque detecta que los tokens caducan mucho antes de lo normal → confirmas que afecta a muchos tenants → paras reintentos y mandas enlaces OAuth masivos para reconectar → la causa es un cambio del proveedor → previenes monitorizando TTL en Redis.

---

## Parte E — Producto y estrategia

### E.1 — Integración de nuevas plataformas (petición de cliente)

Lo primero que haría, antes de descartar cualquier salto a nuevas plataformas, es estudiar la compatibilidad con la estructura actual para entender el coste real de dar el salto. En base a eso respondería al cliente y lo debatiría con el equipo de ventas.

Como opinión personal, haría lo posible por integrar nuevas plataformas de cara a expandir mercado, dotando el producto de mayor versatilidad y competitividad. En caso de tener que adaptar todo drásticamente (nuevo flujo OAuth, rate limits distintos en Upstash Redis, cambios en el esquema de `oauth_tokens` o en el worker), le comentaría al cliente que en un futuro nos gustaría hacerlo pero en estos momentos todavía no; en caso de ser compatible y no suponer un gran esfuerzo — por ejemplo, añadir un adaptador de proveedor reutilizando el pipeline actual (API → SQS → worker → publish) — trataría de abordar el reto.

### E.2 — Dashboard de rendimiento para el Embajador

Mostraría un infograma circular donde detallar distintos parámetros, como los posts publicados, meetings realizados, feedback en los posts, etc. A modo de que el usuario vea gráficamente la comparación de estos puntos con el tiempo (mes actual vs. anterior), alimentado con datos de `posts` por `profile_id` y métricas de negocio ya expuestas en Datadog.

---

## Declaración de uso de IA

Usé **Cursor** (Claude / Composer) para generar el esqueleto de `infra/`, `app/`, `worker/` y `.github/workflows/ci.yml`, y para iterar el código de la Parte C.
Usé **Gemini Web** para aclarar conceptos de arquitectura (PgBouncer, SQS, OAuth) cuando dudaba del enfoque.
Las decisiones de stack, el diagrama de la Parte A y las respuestas de operaciones/producto (D, E) son propias; la IA aceleró redacción y depuración, no sustituyó el criterio técnico.
