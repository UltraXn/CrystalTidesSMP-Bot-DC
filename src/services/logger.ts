import { WebhookClient, EmbedBuilder, Colors } from 'discord.js';

const WEBHOOK_URL = 'https://discord.com/api/webhooks/1455655329860813055/GGRJHVqz-vwvV7PMkGUkLhwAddubklV8iNYeAC-lj3fGd7czmFsr6bmiGccI8ZYakzQ_';

const webhookClient = new WebhookClient({ url: WEBHOOK_URL });

type LogLevel = 'info' | 'warn' | 'error' | 'success' | 'action';

export const Logger = {
    async log(title: string, message: string, level: LogLevel = 'info') {
        // Console log for local debugging
        console.log(`[${level.toUpperCase()}] ${title}: ${message}`);

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(message)
            .setTimestamp();

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
                embed.setColor(0x9B59B6); 
                break;
            default:
                embed.setColor(Colors.Grey);
        }

        try {
            await webhookClient.send({
                embeds: [embed]
            });
        } catch (error) {
            console.error('Failed to send log to Discord Webhook:', error);
        }
    }
};
