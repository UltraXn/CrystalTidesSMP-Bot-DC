# Dockerfile simplificado para Discord-Bot
FROM node:22-alpine

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copiar bases para dependencias
COPY package*.json ./
COPY apps/discord-bot/package*.json ./apps/discord-bot/
COPY packages/shared/package*.json ./packages/shared/

# Instalar dependencias
RUN npm ci --omit=dev

# Copiar código fuente (el bot corre con tsx directo)
COPY apps/discord-bot/src ./apps/discord-bot/src

EXPOSE 3002
ENV NODE_ENV=production

CMD ["npx", "tsx", "apps/discord-bot/src/index.ts"]
