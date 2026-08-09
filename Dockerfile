# syntax=docker/dockerfile:1.7
# Pre-built runner: CI ships dist + ARM64 native binaries in node_modules

FROM node:24-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates openssh-client fonts-dejavu-core fontconfig \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -g 1001 app && useradd -u 1001 -g app -s /bin/sh -d /home/app app \
  && mkdir -p /home/app && chown app:app /home/app

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
