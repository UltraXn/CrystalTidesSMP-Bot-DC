import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

export default {
  data: new SlashCommandBuilder().setName('ping').setDescription('Responde con Pong!'),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply('Pong! 🏓');
  },
};
