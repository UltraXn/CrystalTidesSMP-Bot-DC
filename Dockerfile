# syntax=docker/dockerfile:1.7
# Debian (glibc) runner for native @napi-rs/canvas arm64 support

FROM node:24-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates openssh-client \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -g 1001 app && useradd -u 1001 -g app -s /bin/sh app

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
