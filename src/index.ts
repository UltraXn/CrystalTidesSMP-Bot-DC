import 'dotenv/config';
// Bun loads .env automatically, no need for dotenv
import { Client, Collection, GatewayIntentBits, REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';

// Extend Client to include commands collection
declare module 'discord.js' {
    interface Client {
        commands: Collection<string, any>;
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

const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath).default || require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        }
    }
}

import { Logger } from './services/logger';
import { initDb } from './config/mysql';
import { syncMinecraftRoles } from './services/syncService';
import { initGameLogWatcher } from './services/gameLogWatcher';

const API_PORT = process.env.PORT || process.env.BOT_API_PORT || 3002;
Bun.serve({
    port: API_PORT,
    async fetch(req: Request) {
        const url = new URL(req.url);

        // CORS Headers
        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Content-Type': 'application/json'
        };

        // Security Check: Bearer Token
        const authHeader = req.headers.get('Authorization');
        const API_KEY = process.env.BOT_API_KEY;
        
        if (!API_KEY) {
            console.error('CRITICAL: BOT_API_KEY is not set in environment!');
            return new Response(JSON.stringify({ error: "Server Configuration Error" }), { status: 500, headers });
        }

        if (authHeader !== `Bearer ${API_KEY}`) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
        }

        // Handle Preflight
        if (req.method === 'OPTIONS') {
            return new Response(null, { headers });
        }

        if (url.pathname === '/presence') {
            const ids = url.searchParams.get('ids')?.split(',') || [];
            const results: Record<string, string> = {};
            
            for (const guild of client.guilds.cache.values()) {
                for (const id of ids) {
                    let member = guild.members.cache.get(id);
                    if (!member || !member.presence) {
                        try {
                            member = await guild.members.fetch({ user: id, withPresences: true });
                        } catch {}
                    }

                    if (member && member.presence) {
                        const status = member.presence.status;
                        if (!results[id] || (status === 'online') || (status === 'dnd' && results[id] !== 'online')) {
                            results[id] = status;
                        }
                    }
                }
            }
            
            return new Response(JSON.stringify(results), { headers });
        }

        if (url.pathname === '/log' && req.method === 'POST') {
            try {
                const body = await req.json();
                const { title, message, level } = body;
                await Logger.log(title || 'System Log', message || 'No content', level || 'info');
                return new Response(JSON.stringify({ success: true }), { headers });
            } catch (e) {
                console.error('Error processing log request:', e);
                return new Response("Bad Request", { status: 400, headers });
            }
        }

        return new Response("Not Found", { status: 404, headers });
    }
});
console.log(`Bot Internal API running on port ${API_PORT}`);

client.once('ready', async () => {
    initGameLogWatcher();
    console.log(`Loggueado como ${client.user?.tag}!`);
    
    // Initial sync
    syncMinecraftRoles(client);
    Logger.log('Bot Started', `CrystalBot v2.0 is now online using Bun!\nAPI Port: ${API_PORT}`, 'success');
    
    // Sync every 30 minutes
    setInterval(() => syncMinecraftRoles(client), 30 * 60 * 1000);
});


client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'Hubo un error al ejecutar el comando.', ephemeral: true });
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.mentions.has(client.user!)) {
        await message.reply('¡Hola! Soy CrystalBot v2.0 funcionando con Bun 🚀');
    }
});

client.login(process.env.DISCORD_TOKEN);
