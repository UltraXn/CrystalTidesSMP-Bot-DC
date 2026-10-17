import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { supabase } from '../config/supabase.js';
import crypto from 'node:crypto';

function generateRandomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    const randomIndex = crypto.randomInt(0, chars.length);
    code += chars.charAt(randomIndex);
  }
  return code;
}

async function handleGenerateCode(interaction: ChatInputCommandInteraction) {
  const discordId = interaction.user.id;
  const discordTag = interaction.user.tag;
  const discordAvatar = interaction.user.displayAvatarURL({ extension: 'png', size: 256 }) || null;
  const code = generateRandomCode();
  const expiresAt = Date.now() + 15 * 60 * 1000;

  try {
    const { error } = await supabase.from('universal_links').upsert({
      code: code.toUpperCase(),
      source: 'discord',
      source_id: discordId,
      player_name: discordTag,
      avatar_url: discordAvatar,
      expires_at: expiresAt,
    });

    if (error) throw error;

    await interaction.reply({
      content: `Tu código de vinculación universal es: **${code}**\nÚsalo en la web o en el juego (\`/link ${code}\`) para conectar tus cuentas.\n*(Expira en 15 minutos)*`,
      ephemeral: true,
    });
  } catch (error) {
    console.error('Database Error:', error);
    await interaction.reply({ content: 'Hubo un error al generar el código.', ephemeral: true });
  }
}

async function handleLinkMinecraft(
  interaction: ChatInputCommandInteraction,
  sourceId: string,
  playerName: string,
  codeInput: string,
) {
  const discordId = interaction.user.id;
  const discordTag = interaction.user.tag;

  await supabase
    .from('profiles')
    .update({ social_discord: null, discord_tag: null })
    .eq('social_discord', discordId);
  await supabase
    .from('profiles')
    .update({ social_discord: null, discord_tag: null })
    .eq('minecraft_uuid', sourceId);

  const { error: linkError } = await supabase
    .from('profiles')
    .update({
      social_discord: discordId,
      discord_tag: discordTag,
      minecraft_name: playerName,
    })
    .eq('minecraft_uuid', sourceId);

  if (linkError) throw linkError;

  await supabase.from('universal_links').delete().eq('code', codeInput.toUpperCase());

  // Instant Discord Role Sync
  try {
    const { syncMinecraftRoles } = await import('../services/syncService.js');
    await syncMinecraftRoles(interaction.client);
  } catch (syncErr) {
    console.error('Error triggering role sync after link:', syncErr);
  }

  await interaction.reply({
    content: `✅ ¡Éxito! Tu cuenta de Discord (**${discordTag}**) ha sido vinculada con el jugador **${playerName}**.`,
    ephemeral: true,
  });
}

async function handleLinkWeb(
  interaction: ChatInputCommandInteraction,
  sourceId: string,
  codeInput: string,
) {
  const discordId = interaction.user.id;
  const discordTag = interaction.user.tag;

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

  // Instant Discord Role Sync
  try {
    const { syncMinecraftRoles } = await import('../services/syncService.js');
    await syncMinecraftRoles(interaction.client);
  } catch (syncErr) {
    console.error('Error triggering role sync after web link:', syncErr);
  }

  await interaction.reply({
    content: '✅ ¡Éxito! Tu Discord ha sido vinculado a tu perfil web.',
    ephemeral: true,
  });
}

async function handleVerifyCode(interaction: ChatInputCommandInteraction, codeInput: string) {
  const cleanCode = codeInput.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(cleanCode)) {
    return interaction.reply({
      content: '❌ Formato de código inválido. Debe ser de 6 caracteres alfanuméricos.',
      ephemeral: true,
    });
  }

  try {
    const { data: results, error: fetchError } = await supabase
      .from('universal_links')
      .select('source, source_id, player_name, expires_at')
      .eq('code', cleanCode);

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

    if (source === 'minecraft') {
      await handleLinkMinecraft(interaction, sourceId, playerName, codeInput);
    } else if (source === 'web') {
      await handleLinkWeb(interaction, sourceId, codeInput);
    } else {
      await interaction.reply({ content: '❌ Fuente de código no soportada.', ephemeral: true });
    }
  } catch (error) {
    console.error('Link Error:', error);
    await interaction.reply({
      content: 'Hubo un error al procesar la vinculación.',
      ephemeral: true,
    });
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Vincula tu cuenta de Discord con Minecraft o la Web.')
    .addStringOption((option) =>
      option
        .setName('codigo')
        .setDescription('El código de vinculación generado en el juego o en la web.')
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const codeInput = interaction.options.getString('codigo');
    if (!codeInput) {
      await handleGenerateCode(interaction);
    } else {
      await handleVerifyCode(interaction, codeInput);
    }
  },
};
