# Base Image
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies into temp cache
# This layer caches dependencies if package.json doesn't change
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json /temp/dev/
COPY apps/discord-bot/package.json /temp/dev/apps/discord-bot/
COPY packages/shared/package.json /temp/dev/packages/shared/
COPY packages/eslint-config/package.json /temp/dev/packages/eslint-config/

# We only need the bot dependencies
WORKDIR /temp/dev/apps/discord-bot
# Bun treats workspaces differently in Docker, simplest is to copy all dependency declarations
# and install. But for now, let's try a simpler approach since we are isolated.
# Actually, since it's a monorepo, we might need the root lockfile.
# Let's clean copy relevant files.

WORKDIR /app
COPY package.json bun.lockb* ./
COPY apps/discord-bot/package.json ./apps/discord-bot/
COPY packages/shared/package.json ./packages/shared/
COPY packages/eslint-config/package.json ./packages/eslint-config/

# Install
RUN bun install

# Production build/prune stage is less critical for simple bot, 
# let's just copy source and run.
COPY . .

WORKDIR /app/apps/discord-bot

# Start via Bun directly (no build step needed for TS!)
CMD ["bun", "src/index.ts"]
