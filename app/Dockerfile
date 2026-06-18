FROM node:22-alpine AS builder
WORKDIR /app

COPY shared/package*.json ./shared/
COPY app/package*.json ./app/
RUN npm install --prefix shared && npm install --prefix app

COPY shared/ ./shared/
COPY app/ ./app/

RUN npm run build --prefix shared
RUN npm run build --prefix app

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/app/.next/standalone ./
COPY --from=builder /app/app/.next/static ./app/.next/static
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/shared/package.json ./shared/package.json
COPY --from=builder /app/shared/node_modules ./shared/node_modules

EXPOSE 3000
ENV PORT=3000
CMD ["node", "app/server.js"]
