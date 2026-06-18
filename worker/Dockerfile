FROM node:22-alpine AS builder
WORKDIR /app

COPY shared/package*.json ./shared/
COPY worker/package*.json ./worker/
RUN npm install --prefix shared && npm install --prefix worker

COPY shared/ ./shared/
COPY worker/ ./worker/

RUN npm run build --prefix shared
RUN npm run build --prefix worker

FROM node:22-alpine
WORKDIR /app/worker
ENV NODE_ENV=production

COPY --from=builder /app/worker/dist ./dist
COPY --from=builder /app/worker/node_modules ./node_modules
COPY --from=builder /app/worker/package.json ./
COPY --from=builder /app/shared/dist /app/shared/dist
COPY --from=builder /app/shared/package.json /app/shared/package.json
COPY --from=builder /app/shared/node_modules /app/shared/node_modules

EXPOSE 8080
ENV PORT=8080
CMD ["npm", "start"]
