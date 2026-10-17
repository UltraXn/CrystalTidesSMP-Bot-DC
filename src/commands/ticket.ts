import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';

async function handleViewTicket(
  interaction: ChatInputCommandInteraction,
  webServerUrl: string,
  apiKey: string,
  ticketId: string,
) {
  const res = await fetch(`${webServerUrl}/api/tickets/${encodeURIComponent(ticketId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    await interaction.editReply({
      content: `❌ Ticket #${ticketId} no encontrado o error en el servidor.`,
    });
    return;
  }

  const ticket = await res.json();
  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket #${ticket.id ?? ticketId} — ${ticket.subject ?? 'Soporte'}`)
    .setColor(ticket.status === 'CLOSED' ? 0x6b7280 : 0x10b981)
    .addFields(
      { name: '👤 Usuario', value: ticket.user_email ?? 'Desconocido', inline: true },
      { name: '📌 Estado', value: `\`${ticket.status ?? 'OPEN'}\``, inline: true },
      { name: '🔥 Prioridad', value: `\`${ticket.priority ?? 'NORMAL'}\``, inline: true },
      { name: '💬 Mensaje Original', value: ticket.message ?? 'Sin contenido' },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleCloseTicket(
  interaction: ChatInputCommandInteraction,
  webServerUrl: string,
  apiKey: string,
  ticketId: string,
) {
  const res = await fetch(`${webServerUrl}/api/tickets/${encodeURIComponent(ticketId)}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ status: 'CLOSED' }),
  });

  if (res.ok) {
    await interaction.editReply({
      content: `✅ Ticket #${ticketId} ha sido marcado como **CERRADO** exitosamente.`,
    });
  } else {
    await interaction.editReply({ content: `❌ Error al cerrar el ticket #${ticketId}.` });
  }
}

async function handleReplyTicket(
  interaction: ChatInputCommandInteraction,
  webServerUrl: string,
  apiKey: string,
  ticketId: string,
) {
  const replyText = interaction.options.getString('mensaje', true);
  const res = await fetch(`${webServerUrl}/api/tickets/${encodeURIComponent(ticketId)}/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      message: replyText,
      author: `Discord Staff (${interaction.user.tag})`,
    }),
  });

  if (res.ok) {
    await interaction.editReply({
      content: `✅ Respuesta enviada al ticket #${ticketId} exitosamente.`,
    });
  } else {
    await interaction.editReply({
      content: `❌ Error al enviar respuesta al ticket #${ticketId}.`,
    });
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Gestión de tickets de soporte técnico desde Discord')
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription('Ver detalles de un ticket de soporte')
        .addStringOption((opt) =>
          opt.setName('id').setDescription('ID del ticket').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('close')
        .setDescription('Cerrar un ticket de soporte')
        .addStringOption((opt) =>
          opt.setName('id').setDescription('ID del ticket').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('reply')
        .setDescription('Responder a un ticket de soporte')
        .addStringOption((opt) =>
          opt.setName('id').setDescription('ID del ticket').setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName('mensaje').setDescription('Respuesta para el usuario').setRequired(true),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const ticketId = interaction.options.getString('id', true).trim();
    const webServerUrl = process.env.WEB_SERVER_URL ?? 'http://localhost:3001';
    const apiKey = process.env.BOT_API_KEY ?? '';

    await interaction.deferReply({ ephemeral: true });

    if (!/^[a-zA-Z0-9_-]+$/.test(ticketId)) {
      await interaction.editReply({ content: '❌ ID de ticket inválido.' });
      return;
    }

    try {
      if (subcommand === 'view') {
        await handleViewTicket(interaction, webServerUrl, apiKey, ticketId);
      } else if (subcommand === 'close') {
        await handleCloseTicket(interaction, webServerUrl, apiKey, ticketId);
      } else if (subcommand === 'reply') {
        await handleReplyTicket(interaction, webServerUrl, apiKey, ticketId);
      }
    } catch (error) {
      console.error('[TicketCommand] Error:', error);
      await interaction.editReply({
        content: '❌ Ocurrió un error al procesar el comando de ticket.',
      });
    }
  },
};
