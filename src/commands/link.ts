import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { supabase } from '../config/supabase';

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
        const discordAvatar = interaction.user.displayAvatarURL({ extension: 'png', size: 256 }) || null;

        if (!codeInput) {
            // --- GENERATE CODE ---
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            let code = '';
            for (let i = 0; i < 6; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            
            const expiresAt = Date.now() + (15 * 60 * 1000);

            try {
                const { error } = await supabase
                    .from('universal_links')
                    .upsert({
                        code: code.toUpperCase(),
                        source: 'discord',
                        source_id: discordId,
                        player_name: discordTag,
                        avatar_url: discordAvatar,
                        expires_at: expiresAt
                    });

                if (error) throw error;

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
                const { data: results, error: fetchError } = await supabase
                    .from('universal_links')
                    .select('source, source_id, player_name, expires_at')
                    .eq('code', codeInput.toUpperCase());

                if (fetchError) throw fetchError;

                if (!results || results.length === 0) {
                    return interaction.reply({ content: '❌ Código inválido o inexistente.', ephemeral: true });
                }

                const verification = results[0];
                if (Date.now() > Number(verification.expires_at)) {
                    await supabase.from('universal_links').delete().eq('code', codeInput.toUpperCase());
                    return interaction.reply({ content: '⏰ El código ha expirado.', ephemeral: true });
                }

                const { source, source_id: sourceId, player_name: playerName } = verification;

                // Robust Linking Logic (Supabase Profiles)
                if (source === 'minecraft') {
                    // 1. Cleanup: Remove this Discord ID from any other profile
                    await supabase
                        .from('profiles')
                        .update({ social_discord: null, discord_tag: null })
                        .eq('social_discord', discordId);
                    
                    // 2. Clear target Minecraft account of any PREVIOUS Discord link
                    await supabase
                        .from('profiles')
                        .update({ social_discord: null, discord_tag: null })
                        .eq('minecraft_uuid', sourceId);

                    // 3. Perform the link (Find profile by Minecraft UUID)
                    const { error: linkError } = await supabase
                        .from('profiles')
                        .update({ 
                            social_discord: discordId, 
                            discord_tag: discordTag,
                            minecraft_name: playerName // Sync name while we are at it
                        })
                        .eq('minecraft_uuid', sourceId);

                    if (linkError) throw linkError;

                    await supabase.from('universal_links').delete().eq('code', codeInput.toUpperCase());
                    
                    await interaction.reply({ 
                        content: `✅ ¡Éxito! Tu cuenta de Discord (**${discordTag}**) ha sido vinculada con el jugador **${playerName}**.`, 
                        ephemeral: true 
                    });
                } else if (source === 'web') {
                    // sourceId here is the web_user_id (id in profiles)
                    await supabase
                        .from('profiles')
                        .update({ social_discord: null, discord_tag: null })
                        .eq('social_discord', discordId);

                    const { error: linkError } = await supabase
                        .from('profiles')
                        .update({ social_discord: discordId, discord_tag: discordTag })
                        .eq('id', sourceId);

                    if (linkError) throw linkError;
                        
                    await supabase.from('universal_links').delete().eq('code', codeInput.toUpperCase());
                    await interaction.reply({ content: '✅ ¡Éxito! Tu Discord ha sido vinculado a tu perfil web.', ephemeral: true });
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
