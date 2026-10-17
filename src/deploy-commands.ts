import { REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import 'dotenv/config';

interface CommandModule {
  data?: { toJSON: () => unknown };
  default?: CommandModule;
}

(async () => {
  try {
    const commands = [];
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs
      .readdirSync(commandsPath)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      let mod: CommandModule | undefined = (await import(
        pathToFileURL(filePath).href
      )) as CommandModule;
      while (mod && !mod.data && mod.default) {
        mod = mod.default;
      }
      if (mod?.data) {
        commands.push(mod.data.toJSON());
      }
    }

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

    console.log('Empezando a refrescar los comandos de aplicación (/).');

    // Note: For development, using Guild commands updates instantly.
    // For production, use Routes.applicationCommands(clientId)
    // We'll use global for now assuming user wants it everywhere or fill CLIENT_ID later.

    // NEED CLIENT ID.
    // We can fetch it from the token but better to put in ENV.
    // Or we can fetch it after login? No, this is a separate script.
    // User needs to add DISCORD_CLIENT_ID to env.

    if (!process.env.DISCORD_CLIENT_ID) {
      throw new Error('Missing DISCORD_CLIENT_ID in .env');
    }

    if (process.env.DISCORD_GUILD_ID) {
      console.log(`Registrando comandos para el gremio: ${process.env.DISCORD_GUILD_ID}`);
      await rest.put(
        Routes.applicationGuildCommands(
          process.env.DISCORD_CLIENT_ID,
          process.env.DISCORD_GUILD_ID,
        ),
        { body: commands },
      );
    }

    console.log('Registrando comandos globalmente...');
    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands });

    console.log('Comandos de aplicación (/) refrescados exitosamente.');
  } catch (error) {
    console.error(error);
  }
})();
