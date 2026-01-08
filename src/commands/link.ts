import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { dbRequest } from '../config/mysql';

export default {
    data: new SlashCommandBuilder()
        .setName('link')
        .setDescription('Vincula tu cuenta de Discord con Minecraft o la Web.')
        .addStringOption(option => 
            option.setName('codigo')
                .setDescription('El código de vinculación generado en el juego o en la web.')
                .setRequired(false)),

    async execute(interaction: ChatInputCommandInteraction) {
        const codeInput = interaction.options.getString('codigo');
        const discordId = interaction.user.id;
        const discordTag = interaction.user.tag;

        if (!codeInput) {
            // --- GENERATE CODE ---
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            let code = '';
            for (let i = 0; i < 6; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            
            const expiresAt = Date.now() + (15 * 60 * 1000);

            try {
                await dbRequest(
                    'INSERT INTO universal_links (code, source, source_id, player_name, expires_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE expires_at = ?',
                    [code, 'discord', discordId, discordTag, expiresAt, expiresAt]
                );

                await interaction.reply({ 
                    content: `Tu código de vinculación universal es: **${code}**\nÚsalo en la web o en el juego (\`/link ${code}\`) para conectar tus cuentas.\n*(Expira en 15 minutos)*`, 
                    ephemeral: true 
                });
            } catch (error) {
                console.error('Database Error:', error);
                await interaction.reply({ content: 'Hubo un error al generar el código.', ephemeral: true });
            }
        } else {
            // --- VERIFY CODE ---
            try {
                const results = await dbRequest(
                    'SELECT source, source_id, player_name, expires_at FROM universal_links WHERE code = ?',
                    [codeInput.toUpperCase()]
                ) as any[];

                if (results.length === 0) {
                    return interaction.reply({ content: '❌ Código inválido o inexistente.', ephemeral: true });
                }

                const verification = results[0];
                if (Date.now() > Number(verification.expires_at)) {
                    await dbRequest('DELETE FROM universal_links WHERE code = ?', [codeInput.toUpperCase()]);
                    return interaction.reply({ content: '⏰ El código ha expirado.', ephemeral: true });
                }

                const { source, source_id: sourceId, player_name: playerName } = verification;

                // Robust Linking Logic (Similar to Web/Plugin)
                if (source === 'minecraft') {
                    // 1. Cleanup: Remove this Discord ID from any other row
                    await dbRequest('UPDATE linked_accounts SET discord_id = NULL, discord_tag = NULL WHERE discord_id = ?', [discordId]);
                    
                    // 2. Clear target Minecraft account of any PREVIOUS Discord link to avoid duplicate entry
                    await dbRequest('UPDATE linked_accounts SET discord_id = NULL, discord_tag = NULL WHERE minecraft_uuid = ?', [sourceId]);

                    // 3. Perform the link
                    const query = `
                        INSERT INTO linked_accounts (minecraft_uuid, minecraft_name, discord_id, discord_tag) 
                        VALUES (?, ?, ?, ?) 
                        ON DUPLICATE KEY UPDATE 
                            minecraft_name = VALUES(minecraft_name),
                            discord_id = VALUES(discord_id),
                            discord_tag = VALUES(discord_tag)
                    `;
                    await dbRequest(query, [sourceId, playerName, discordId, discordTag]);

                    await dbRequest('DELETE FROM universal_links WHERE code = ?', [codeInput.toUpperCase()]);
                    
                    await interaction.reply({ 
                        content: `✅ ¡Éxito! Tu cuenta de Discord (**${discordTag}**) ha sido vinculada con el jugador **${playerName}**.`, 
                        ephemeral: true 
                    });
                } else if (source === 'web') {
                    // To link Discord to Web, we need an existing row (because MC is the PK)
                    // If the user doesn't have an MC link yet, this logic needs a fallback or a schema change.
                    const userCheck = await dbRequest('SELECT * FROM linked_accounts WHERE web_user_id = ?', [sourceId]) as any[];
                    
                    if (userCheck.length > 0) {
                        await dbRequest('UPDATE linked_accounts SET discord_id = NULL, discord_tag = NULL WHERE discord_id = ?', [discordId]);
                        await dbRequest('UPDATE linked_accounts SET discord_id = ?, discord_tag = ? WHERE web_user_id = ?', [discordId, discordTag, sourceId]);
                        
                        await dbRequest('DELETE FROM universal_links WHERE code = ?', [codeInput.toUpperCase()]);
                        await interaction.reply({ content: '✅ ¡Éxito! Tu Discord ha sido vinculado a tu perfil web.', ephemeral: true });
                    } else {
                        await interaction.reply({ 
                            content: '⚠️ Primero debes vincular tu cuenta de Minecraft en el juego para poder usar esta función via Discord.', 
                            ephemeral: true 
                        });
                    }
                } else {
                    await interaction.reply({ content: '❌ Fuente de código no soportada.', ephemeral: true });
                }

            } catch (error) {
                console.error('Link Error:', error);
                await interaction.reply({ content: 'Hubo un error al procesar la vinculación.', ephemeral: true });
            }
        }
    }
};
