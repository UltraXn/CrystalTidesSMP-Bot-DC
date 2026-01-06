# 🤖 CrystalTides Discord Bot

Official Discord bot for the **CrystalTides SMP** ecosystem. It bridges the gap between the Discord community, the Minecraft server, and the web platform.

## ✨ Features

- **Account Linking**: Connects Discord accounts with Minecraft/Web profiles via `/link`.
- **Role Synchronization**: Automatically syncs in-game ranks (VIP, Staff) to Discord roles.
- **Server Monitoring**: Real-time status updates of the Minecraft server.
- **Support Tickets**: Integration with the web-based ticket system (Planned).

## 🛠️ Commands

| Command        | Description                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------- |
| `/link [code]` | Links your Discord account to your CrystalTides profile using a code from the web dashboard. |
| `/ping`        | Checks the bot's latency and health.                                                         |

## 🚀 Setup & Development

This bot is built with **Discord.js** and runs on **Bun**.

### Prerequisites

- [Bun](https://bun.sh/) runtime.
- A Discord Application with "Bot" and "applications.commands" scopes.

### Installation

```bash
# Install dependencies
bun install
```

### Environment Variables (.env)

Create a `.env` file in this directory:

```env
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_GUILD_ID=your_guild_id

# Supabase (for database connection)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# MySQL (for advanced game data)
DB_HOST=...
DB_USER=...
```

### Running

```bash
# Development mode (watch)
bun dev

# Deploy slash commands (run once when commands change)
bun deploy

# Production start
bun start
```
