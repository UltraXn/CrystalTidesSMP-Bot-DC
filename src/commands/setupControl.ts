import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  TextChannel,
} from 'discord.js';
import { PowerManager } from '../services/powerManager';

export default {
  data: new SlashCommandBuilder()
    .setName('setup-control')
    .setDescription('Establece el panel de control persistente en el canal actual.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: 64 });

    try {
      const embed = new EmbedBuilder()
        .setTitle('⚡ CrystalTides — Control de Nodo & Energía')
        .setDescription('Obteniendo información del nodo y del servidor... 📡')
        .setColor('#4b5563');

      const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('wol_pc')
          .setLabel('⚡ Encender PC (WOL)')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('pelican_start')
          .setLabel('▶️ Iniciar Minecraft')
          .setStyle(ButtonStyle.Success),
      );

      const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('pelican_restart')
          .setLabel('🔄 Reiniciar')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('pelican_stop')
          .setLabel('🛑 Detener')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true),
      );

      const channel = interaction.channel;
      if (!channel || !('send' in channel)) {
        await interaction.editReply('No se pudo encontrar un canal de texto válido.');
        return;
      }

      // Send text-only message; the updateControlEmbed loop (500ms later) adds the canvas via native fetch
      const sentMsg = await (channel as TextChannel).send({
        embeds: [embed],
        components: [row1, row2],
      });
      PowerManager.setControlMessage(sentMsg.channelId, sentMsg.id);

      // Trigger status loop immediately to update content with HD Canvas
      setTimeout(() => {
        PowerManager.updateControlEmbed();
      }, 500);

      await interaction.editReply('¡Panel de control persistente creado con éxito en este canal!');
    } catch (error) {
      console.error('[setup-control] Error executing command:', error);
      const errorMsg = `❌ Error al crear el panel de control: ${error instanceof Error ? error.message : String(error)}`;
      await interaction.editReply(errorMsg);
    }
  },
};
