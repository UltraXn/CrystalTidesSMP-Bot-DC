# 🤖 Bot de Discord CrystalTides

Bot oficial de Discord para el ecosistema **CrystalTides SMP**. Conecta la comunidad de Discord con el servidor de Minecraft y la plataforma web.

## ✨ Características

- **Vinculación de Cuentas**: Conecta cuentas de Discord con perfiles de Minecraft/Web usando `/link`.
- **Sincronización de Roles**: Sincroniza automáticamente rangos del juego (VIP, Staff) con roles de Discord.
- **Monitoreo del Servidor**: Actualizaciones en tiempo real del estado del servidor de Minecraft.
- **Tickets de Soporte**: Integración con el sistema de tickets web (Planeado).

## 🛠️ Comandos

| Comando          | Descripción                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `/link [codigo]` | Vincula tu cuenta de Discord a tu perfil de CrystalTides usando un código del panel web. |
| `/ping`          | Verifica la latencia y salud del bot.                                                    |

## 🚀 Configuración y Desarrollo

Este bot está construido con **Discord.js** y corre sobre **Bun**.

### Prerrequisitos

- Runtime [Bun](https://bun.sh/).
- Una Aplicación de Discord con scopes "Bot" y "applications.commands".

### Instalación

```bash
# Instalar dependencias
bun install
```

### Variables de Entorno (.env)

Crea un archivo `.env` en este directorio:

```env
DISCORD_TOKEN=tu_token_del_bot
DISCORD_CLIENT_ID=tu_client_id
DISCORD_GUILD_ID=tu_guild_id

# Supabase (para conexión a base de datos)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# MySQL (para datos avanzados del juego)
DB_HOST=...
DB_USER=...
```

### Ejecución

```bash
# Modo desarrollo (watch)
bun dev

# Desplegar comandos slash (ejecutar una vez cuando cambien los comandos)
bun deploy

# Inicio en producción
bun start
```
