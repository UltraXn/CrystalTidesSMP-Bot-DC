# syntax=docker/dockerfile:1.7
# Multi-stage bot: build TS -> slim non-root JS runtime.

FROM node:24-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat \
  && npm install -g npm@11.6.4
COPY package.json package-lock.json turbo.json ./
COPY apps/web-server/package.json ./apps/web-server/
COPY apps/web-client/package.json ./apps/web-client/
COPY apps/discord-bot/package.json ./apps/discord-bot/
COPY apps/game-bridge/package.json ./apps/game-bridge/
COPY packages/shared/package.json ./packages/shared/
COPY packages/eslint-config/package.json ./packages/eslint-config/
RUN npm ci

FROM deps AS builder
COPY . .
RUN npx turbo run build --filter=discord-bot...
RUN npm prune --omit=dev

FROM node:24-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat curl openssh-client \
  && addgroup -g 1001 app && adduser -u 1001 -S -G app app

ENV NODE_ENV=production
ENV PORT=3002

COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package.json ./package.json
COPY --from=builder --chown=app:app /app/apps/discord-bot/dist ./apps/discord-bot/dist
COPY --from=builder --chown=app:app /app/apps/discord-bot/package.json ./apps/discord-bot/package.json
COPY --from=builder --chown=app:app /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=app:app /app/packages/shared/package.json ./packages/shared/package.json

USER app
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["node", "apps/discord-bot/dist/src/index.js"]
