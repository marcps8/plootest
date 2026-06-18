# Cloudflare — edge CDN/WAF (delante de Vercel)

## Por qué Cloudflare (descartamos AWS CloudFront)

- **Configuración simple:** DNS proxy + WAF managed rules en minutos vs. distribuciones CloudFront + OAI + WAFv2 separados.
- **Protección global:** CDN/WAF/DDoS en un solo panel; menos piezas que operar.
- **Velocidad de entrega:** cache estática y TLS termination en edge antes de llegar a Vercel.

## Configuración

1. Dominio `api.ploot.ai` → CNAME a `cname.vercel-dns.com` (proxied ☁️).
2. **SSL/TLS:** Full (strict) hacia origen Vercel.
3. **WAF managed rules:** OWASP Core, Bot Fight Mode en `/api/*`.
4. **Rate limiting Cloudflare:** cap adicional por IP en `/api/v1/*` (defensa perimetral; el rate limit de app OAuth sigue en Upstash).
5. **Región UE:** preferencia de enrutado EU donde aplique; datos sensibles persisten en Neon (Frankfurt).

## Alternativa descartada

| Opción | Por qué no |
|---|---|
| AWS CloudFront + WAF | Mayor complejidad de IaC, certificados, behaviors por path; overkill pre-PMF |
| Solo Vercel edge | Sin WAF/rate limit perimetral dedicado ante ataques volumétricos |
