import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, Interaction, TextChannel, ButtonInteraction, Guild } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { ChatBridgeService } from './services/chatBridgeService';
import { Logger } from './services/logger';
import { syncMinecraftRoles } from './services/syncService';
import { initGameLogWatcher } from './services/gameLogWatcher';
import { PelicanService } from './services/pelicanService';
import { WOLService } from './services/wolService';
import { PowerManager } from './services/powerManager';

import { pathToFileURL } from 'node:url';

export interface Command {
    data: { name: string };
    execute: (interaction: Interaction) => Promise<void>;
}

declare module 'discord.js' {
    interface Client {
        commands: Collection<string, Command>;
    }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ],
});

client.commands = new Collection();

interface CommandModule {
    data?: { name?: string };
    execute?: (interaction: Interaction) => Promise<void>;
    default?: CommandModule;
}

async function loadCommands() {
    const commandsPath = path.join(__dirname, 'commands');
    if (!fs.existsSync(commandsPath)) {
        console.error(`[Commands] Directory NOT found: ${commandsPath}`);
        return;
    }

    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
    console.log(`[Commands] Scanning ${commandsPath} (${commandFiles.length} files found)...`);

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            let mod: CommandModule | undefined = (await import(pathToFileURL(filePath).href)) as CommandModule;
            while (mod && !mod.data && mod.default) {
                mod = mod.default;
            }
            const cmdName = mod?.data?.name;
            if (cmdName && typeof mod?.execute === 'function') {
                client.commands.set(cmdName, mod as Command);
                console.log(`[Commands] Successfully loaded: /${cmdName}`);
            } else {
                console.warn(`[Commands] File ${file} missing valid data/execute structure. Loaded symbol:`, mod);
            }
        } catch (err) {
            console.error(`[Commands] Failed to import ${file}:`, err);
        }
    }
}

void loadCommands();

const API_PORT = process.env.PORT || process.env.BOT_API_PORT || 3002;

const ALLOWED_ORIGINS = new Set(
    (process.env.BOT_ALLOWED_ORIGINS ||
        'https://crystaltidessmp.net,https://api.crystaltidessmp.net,http://localhost:3000,http://localhost:5173')
        .split(',')
        .map(o => o.trim().toLowerCase())
        .filter(Boolean)
);

function getCorsHeaders(requestOrigin: string): Record<string, string> {
    const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };
    if (ALLOWED_ORIGINS.has(requestOrigin)) {
        headers['Access-Control-Allow-Origin'] = requestOrigin;
    }
    return headers;
}

async function fetchMemberPresenceStatus(guilds: Iterable<Guild>, id: string): Promise<string | null> {
    for (const guild of guilds) {
        let member = guild.members.cache.get(id);
        if (!member?.presence) {
            try {
                member = await guild.members.fetch({ user: id, withPresences: true });
            } catch {
                /* ignore missing member/presence */
            }
        }
        if (member?.presence) {
            return member.presence.status;
        }
    }
    return null;
}

async function handlePresence(url: URL, res: http.ServerResponse, headers: Record<string, string>) {
    const ids = url.searchParams.get('ids')?.split(',') || [];
    const results: Record<string, string> = {};

    for (const id of ids) {
        const status = await fetchMemberPresenceStatus(client.guilds.cache.values(), id);
        if (status) {
            results[id] = status;
        }
    }

    res.writeHead(200, headers);
    res.end(JSON.stringify(results));
}

function handleBodyPost(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    headers: Record<string, string>,
    callback: (body: Record<string, unknown>) => Promise<void>
) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
        try {
            const data = JSON.parse(body) as Record<string, unknown>;
            await callback(data);
            res.writeHead(200, headers);
            res.end(JSON.stringify({ success: true }));
        } catch (error) {
            console.error('Error processing endpoint request:', error);
            res.writeHead(400, headers);
            res.end(JSON.stringify({ error: "Bad Request" }));
        }
    });
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const requestOrigin = req.headers.origin?.toLowerCase() || '';
    const headers = getCorsHeaders(requestOrigin);

    if (url.pathname === '/health' || url.pathname === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', discord: client.isReady() ? 'ready' : 'starting' }));
        return;
    }

    if (req.method === 'OPTIONS') {
        res.writeHead(ALLOWED_ORIGINS.has(requestOrigin) ? 204 : 403, headers);
        res.end();
        return;
    }

    const authHeader = req.headers['authorization'];
    const API_KEY = process.env.BOT_API_KEY;

    if (!API_KEY) {
        console.error('CRITICAL: BOT_API_KEY is not set in environment!');
        res.writeHead(500, headers);
        res.end(JSON.stringify({ error: "Server Configuration Error" }));
        return;
    }

    if (authHeader !== `Bearer ${API_KEY}`) {
        res.writeHead(401, headers);
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
    }

    if (url.pathname === '/presence') {
        void handlePresence(url, res, headers);
        return;
    }

    if (url.pathname === '/log' && req.method === 'POST') {
        handleBodyPost(req, res, headers, async (data) => {
            const title = typeof data.title === 'string' ? data.title : 'System Log';
            const message = typeof data.message === 'string' ? data.message : 'No content';
            const levelInput = typeof data.level === 'string' ? data.level : 'info';
            const level = (['info', 'warn', 'error', 'success', 'action'].includes(levelInput)
                ? levelInput
                : 'info') as 'info' | 'warn' | 'error' | 'success' | 'action';
            await Logger.log(title, message, level);
        });
        return;
    }

    if (url.pathname === '/chat/bridge' && req.method === 'POST') {
        handleBodyPost(req, res, headers, async (data) => {
            const username = typeof data.username === 'string' ? data.username : 'Minecraft';
            const message = typeof data.message === 'string' ? data.message : '';
            await ChatBridgeService.sendMinecraftToDiscord(client, username, message);
        });
        return;
    }

    if (url.pathname === '/ticket/notify' && req.method === 'POST') {
        handleBodyPost(req, res, headers, async (data) => {
            const ticketId = typeof data.ticketId === 'string' || typeof data.ticketId === 'number' ? String(data.ticketId) : '';
            const subject = typeof data.subject === 'string' ? data.subject : 'Soporte';
            const user = typeof data.user === 'string' ? data.user : 'Usuario';
            const action = typeof data.action === 'string' ? data.action : 'Actualizado';
            const TICKET_CHANNEL_ID = process.env.DISCORD_TICKET_STAFF_CHANNEL_ID;
            if (TICKET_CHANNEL_ID) {
                const channel = await client.channels.fetch(TICKET_CHANNEL_ID);
                if (channel?.isTextBased() && 'send' in channel) {
                    await (channel as TextChannel).send({
                        embeds: [{
                            title: `🎫 Ticket #${ticketId} — ${action}`,
                            description: `**Asunto**: ${subject}\n**Usuario**: ${user}`,
                            color: action === 'Creado' ? 0x10B981 : 0x3B82F6,
                            timestamp: new Date().toISOString()
                        }]
                    });
                }
            }
        });
        return;
    }

    res.writeHead(404, headers);
    res.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(API_PORT, () => {
    console.log(`Bot Internal API running on port ${API_PORT}`);
});

client.once('ready', async () => {
    initGameLogWatcher();
    console.log(`Loggueado como ${client.user?.tag}!`);

    syncMinecraftRoles(client);
    Logger.log('Bot Started', `CrystalBot v2.0 is now online!\nAPI Port: ${API_PORT}`, 'success');

    ChatBridgeService.init(client);
    PowerManager.init(client);

    setInterval(() => syncMinecraftRoles(client), 30 * 60 * 1000);
});

async function handleButtonAction(interaction: ButtonInteraction) {
    const actionId = interaction.customId as 'wol_pc' | 'pelican_start' | 'pelican_restart' | 'pelican_stop';
    
    // Trigger real-time step-by-step UI transition animation immediately
    PowerManager.triggerActionTransition(actionId);

    switch (interaction.customId) {
        case 'wol_pc': {
            console.log('[WOL] Attempting to wake PC...');
            const wolSuccess = await WOLService.wakePC();
            await interaction.followUp({ content: wolSuccess ? '⚡ Magic Packet WOL enviado a la Laptop.' : '❌ Error al enviar el paquete WOL.', ephemeral: true });
            break;
        }
        case 'pelican_start': {
            const startRes = await PelicanService.sendPowerAction('start');
            await interaction.followUp({ content: startRes ? '🚀 Señal de INICIO transmitida a Pelican Wings.' : '❌ Error al enviar la señal de inicio.', ephemeral: true });
            break;
        }
        case 'pelican_restart': {
            const restartRes = await PelicanService.sendPowerAction('restart');
            await interaction.followUp({ content: restartRes ? '🔄 Señal de REINICIO transmitida.' : '❌ Error al enviar señal de reinicio.', ephemeral: true });
            break;
        }
        case 'pelican_stop': {
            const stopRes = await PelicanService.sendPowerAction('stop');
            await interaction.followUp({ content: stopRes ? '🛑 Señal de APAGADO transmitida. Guardando terreno.' : '❌ Error al detener el servidor.', ephemeral: true });
            break;
        }
    }
}

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        console.log(`[Interaction] Command /${interaction.commandName} by ${interaction.user.tag}`);
        const command = client.commands.get(interaction.commandName);
        if (!command) {
            console.warn(`[Interaction] Command /${interaction.commandName} NOT found in client.commands`);
            const msg = '❌ Este comando no está cargado en el bot.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: msg });
            } else {
                await interaction.reply({ content: msg, ephemeral: true });
            }
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`[Interaction] Error in /${interaction.commandName}:`, error);
            const errorContent = `❌ Error al ejecutar /${interaction.commandName}: ${error instanceof Error ? error.message : String(error)}`;
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: errorContent });
            } else {
                await interaction.reply({ content: errorContent, ephemeral: true });
            }
        }
    } else if (interaction.isButton()) {
        try {
            console.log(`[Button] Received: ${interaction.customId} from ${interaction.user.tag}`);
            await interaction.deferUpdate();
            await handleButtonAction(interaction);
        } catch (error) {
            console.error('Button interaction error:', error);
        }
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.mentions.has(client.user!)) {
        await message.reply('¡Hola! Soy CrystalBot v2.0 🚀');
    }
});

void client.login(process.env.DISCORD_TOKEN);

let shuttingDown = false;
function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] received ${signal}`);
    server.close(() => {
        client.destroy();
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
