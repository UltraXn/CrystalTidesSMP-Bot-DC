import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { PelicanService } from '../services/pelicanService';

export default {
    data: new SlashCommandBuilder()
        .setName('control')
        .setDescription('Panel de control para el servidor de Minecraft y el hardware.'),

    async execute(interaction: any) {
        const status = await PelicanService.getServerStatus();
        
        const embed = new EmbedBuilder()
            .setTitle('🎮 CrystalTides - Control de Energía')
            .setDescription(`Estado actual del servidor: **${status?.state || 'Desconocido'}**`)
            .setColor(status?.state === 'running' ? '#00ff00' : '#ff9900')
            .addFields(
                { name: '🌐 Panel', value: '[Ir al Panel](https://panel.crystaltidessmp.net)', inline: true },
                { name: '💾 RAM', value: status?.utilization ? `${(status.utilization.memory_bytes / 1024 / 1024).toFixed(2)} MB` : 'N/A', inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'CrystalBot v2.0 - Gestión Remota' });

        const row1 = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('wol_pc')
                    .setLabel('⚡ Encender PC (WOL)')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('pelican_start')
                    .setLabel('▶️ Iniciar Minecraft')
                    .setStyle(ButtonStyle.Success),
            );

        const row2 = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('pelican_restart')
                    .setLabel('🔄 Reiniciar')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('pelican_stop')
                    .setLabel('🛑 Detener')
                    .setStyle(ButtonStyle.Danger),
            );

        await interaction.reply({ embeds: [embed], components: [row1, row2] });
    },
};
