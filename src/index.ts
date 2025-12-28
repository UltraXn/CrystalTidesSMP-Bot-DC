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
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
// Ensure directory exists or handle reading recursively... 
// For now, flat structure
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

import { initDb } from './config/mysql';

client.once('ready', async () => {
    await initDb();
    console.log(`Loggueado como ${client.user?.tag}!`);
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

client.login(process.env.DISCORD_TOKEN);
