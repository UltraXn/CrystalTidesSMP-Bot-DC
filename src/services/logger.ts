import { WebhookClient, EmbedBuilder, Colors } from 'discord.js';

const WEBHOOK_URL = process.env.DISCORD_LOG_WEBHOOK_URL ?? process.env.DISCORD_WEBHOOK_URL ?? '';

const webhookClient = WEBHOOK_URL ? new WebhookClient({ url: WEBHOOK_URL }) : null;

type LogLevel = 'info' | 'warn' | 'error' | 'success' | 'action';

export const Logger = {
  async log(title: string, message: string, level: LogLevel = 'info') {
    // Console log for local debugging
    console.log(`[${level.toUpperCase()}] ${title}: ${message}`);

    const embed = new EmbedBuilder().setTitle(title).setDescription(message).setTimestamp();

    switch (level) {
      case 'info':
        embed.setColor(Colors.Blue);
        break;
      case 'warn':
        embed.setColor(Colors.Yellow);
        break;
      case 'error':
        embed.setColor(Colors.Red);
        break;
      case 'success':
        embed.setColor(Colors.Green);
        break;
      case 'action':
        // Purple for Admin Actions
        embed.setColor(0x9b59b6);
        break;
      default:
        embed.setColor(Colors.Grey);
    }

    if (!webhookClient) {
      return;
    }

    try {
      await webhookClient.send({
        embeds: [embed],
      });
    } catch (error) {
      console.error('Failed to send log to Discord Webhook:', error);
    }
  },
};
