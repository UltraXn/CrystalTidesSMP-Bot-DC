# syntax=docker/dockerfile:1.7
# Ultra-fast runner: receives pre-built dist from CI runner.

FROM node:24-alpine
WORKDIR /app
RUN apk add --no-cache libc6-compat curl openssh-client \
  && addgroup -g 1001 app && adduser -u 1001 -S -G app app

ENV NODE_ENV=production
ENV PORT=3002

COPY --chown=app:app node_modules ./node_modules
COPY --chown=app:app package.json ./package.json
COPY --chown=app:app apps/discord-bot/dist ./apps/discord-bot/dist
COPY --chown=app:app apps/discord-bot/package.json ./apps/discord-bot/package.json
COPY --chown=app:app packages/shared/dist ./packages/shared/dist
COPY --chown=app:app packages/shared/package.json ./packages/shared/package.json

USER app
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["node", "apps/discord-bot/dist/src/index.js"]
