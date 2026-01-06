import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { dbRequest } from '../config/mysql';

export const data = new SlashCommandBuilder()
    .setName('link')
    .setDescription('Vincula tu cuenta de Discord con Minecraft o la Web.')
    .addStringOption(option => 
        option.setName('codigo')
            .setDescription('El código de vinculación generado en el juego o en la web.')
            .setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
    const codeInput = interaction.options.getString('codigo');
    const discordId = interaction.user.id;
    const username = interaction.user.tag;

    if (!codeInput) {
        // GENERATE CODE
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        const expiresAt = Date.now() + (15 * 60 * 1000);

        try {
            await dbRequest(
                'INSERT INTO universal_links (code, source, source_id, expires_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE expires_at = ?',
                [code, 'discord', discordId, expiresAt, expiresAt]
            );

            await interaction.reply({ 
                content: `Tu código de vinculación universal es: **${code}**\nÚsalo en el juego (\`/link ${code}\`) o en la web para conectar tus cuentas.\n(Expira en 15 minutos)`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error('Database Error:', error);
            await interaction.reply({ content: 'Hubo un error al generar el código.', ephemeral: true });
        }
    } else {
        // VERIFY CODE
        try {
            const results = await dbRequest(
                'SELECT source, source_id, expires_at FROM universal_links WHERE code = ?',
                [codeInput.toUpperCase()]
            ) as any[];

            if (results.length === 0) {
                return interaction.reply({ content: 'Código inválido o inexistente.', ephemeral: true });
            }

            const verification = results[0];
            if (Date.now() > Number(verification.expires_at)) {
                return interaction.reply({ content: 'El código ha expirado.', ephemeral: true });
            }

            const source = verification.source;
            const sourceId = verification.source_id;

            let query = '';
            if (source === 'minecraft') {
                query = 'INSERT INTO linked_accounts (minecraft_uuid, discord_id, discord_tag) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE discord_id = ?, discord_tag = ?';
            } else if (source === 'web') {
                query = 'INSERT INTO linked_accounts (web_user_id, discord_id, discord_tag) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE discord_id = ?, discord_tag = ?';
            }

            if (query) {
                await dbRequest(query, [sourceId, discordId, username, discordId, username]);
                await dbRequest('DELETE FROM universal_links WHERE code = ?', [codeInput.toUpperCase()]);
                
                await interaction.reply({ 
                    content: `¡Éxito! Tu cuenta de Discord ha sido vinculada con **${source}**.`, 
                    ephemeral: true 
                });
            } else {
                await interaction.reply({ content: 'Error en la fuente del código.', ephemeral: true });
            }

        } catch (error) {
            console.error('Link Error:', error);
            await interaction.reply({ content: 'Hubo un error al procesar la vinculación.', ephemeral: true });
        }
    }
}
