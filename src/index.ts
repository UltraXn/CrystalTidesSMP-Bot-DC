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
import { syncMinecraftRoles } from './services/syncService';
import { initGameLogWatcher } from './services/gameLogWatcher';

const API_PORT = process.env.PORT || process.env.BOT_API_PORT || 3002;
import http from 'http';

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // CORS Headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    // Handle Preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, headers);
        res.end();
        return;
    }

    // Security Check: Bearer Token
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
        
        res.writeHead(200, headers);
        res.end(JSON.stringify(results));
        return;
    }

    if (url.pathname === '/log' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const { title, message, level } = data;
                await Logger.log(title || 'System Log', message || 'No content', level || 'info');
                res.writeHead(200, headers);
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                console.error('Error processing log request:', e);
                res.writeHead(400, headers);
                res.end(JSON.stringify({ error: "Bad Request" }));
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
    
    // Initial sync
    syncMinecraftRoles(client);
    Logger.log('Bot Started', `CrystalBot v2.0 is now online!\nAPI Port: ${API_PORT}`, 'success');
    
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
        await message.reply('¡Hola! Soy CrystalBot v2.0 🚀');
    }
});

client.login(process.env.DISCORD_TOKEN);
