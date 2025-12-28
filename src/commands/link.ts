import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('link')
    .setDescription('Vincula tu cuenta de Discord con la web de CrystalTides.');

import { dbRequest } from '../config/mysql';

export async function execute(interaction: any) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const discordId = interaction.user.id;
    const username = interaction.user.username;

    // Save to DB
    try {
        await dbRequest(
            'INSERT INTO verification_codes (code, discord_id, discord_username) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE code = ?, created_at = CURRENT_TIMESTAMP',
            [code, discordId, username, code]
        );

        await interaction.reply({ 
            content: `Tu código de vinculación es: **${code}**\nVe a tu perfil en la web e ingrésalo para conectar tu cuenta.\n(Expira en 10 minutos)`, 
            ephemeral: true 
        });
    } catch (error) {
        console.error('Database Error:', error);
        await interaction.reply({ content: 'Hubo un error al generar el código. Intenta de nuevo.', ephemeral: true });
    }
}
