import { Client, Message, TextChannel } from 'discord.js';
import { supabase } from '../config/supabase';

export class ChatBridgeService {
    public static init(client: Client) {
        client.on('messageCreate', async (message: Message) => {
            if (message.author.bot) return;

            const CHAT_CHANNEL_ID = process.env.DISCORD_CHAT_CHANNEL_ID;
            if (!CHAT_CHANNEL_ID || message.channelId !== CHAT_CHANNEL_ID) return;

            await this.forwardDiscordToMinecraft(message);
        });
    }

    private static async forwardDiscordToMinecraft(message: Message) {
        try {
            const discordId = message.author.id;
            let minecraftName: string | null = null;

            // 1. Check Supabase profiles table for linked Minecraft account
            try {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('minecraft_name')
                    .eq('social_discord', discordId)
                    .maybeSingle();

                if (profile?.minecraft_name) {
                    minecraftName = profile.minecraft_name;
                } else {
                    // Fallback check in linked_accounts table
                    const { data: linked } = await supabase
                        .from('linked_accounts')
                        .select('minecraft_name')
                        .eq('discord_id', discordId)
                        .maybeSingle();

                    if (linked?.minecraft_name) {
                        minecraftName = linked.minecraft_name;
                    }
                }
            } catch (dbErr) {
                console.error('[ChatBridge] Error checking verification in Supabase:', dbErr);
            }

            // 2. Enforce verification requirement
            if (!minecraftName) {
                try {
                    const warning = await message.reply({
                        content: `❌ **No estás verificado.** Para chatear en el juego desde Discord, debes vincular tu cuenta de Minecraft.\nUsa \`/link\` en Minecraft o usa \`/link <code>\` en Discord.`
                    });

                    setTimeout(() => {
                        message.delete().catch(() => {});
                        warning.delete().catch(() => {});
                    }, 7000);
                } catch (e) {
                    console.error('[ChatBridge] Error sending non-verified warning:', e);
                }
                return;
            }

            const text = message.content.split('"').join('\\"');
            const webServerUrl = process.env.WEB_SERVER_URL || 'http://localhost:3001';
            const apiKey = process.env.BOT_API_KEY || 'crystaltides_bot_secret_key';

            // Forward message as /tellraw using verified Minecraft username
            const tellrawJson = JSON.stringify([
                { text: "[Discord] ", color: "blue", bold: true },
                { text: `<${minecraftName}> `, color: "aqua" },
                { text: text, color: "white" }
            ]);

            const command = `tellraw @a ${tellrawJson}`;

            await fetch(`${webServerUrl}/api/bridge/queue`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    command,
                    issuer: `Discord:${minecraftName}`
                })
            });

            console.log(`[ChatBridge] Sent message from verified user <${minecraftName}> (Discord: ${message.author.tag}) to Minecraft`);
        } catch (error) {
            console.error('[ChatBridge] Error forwarding message to Minecraft:', error);
        }
    }

    public static async sendMinecraftToDiscord(client: Client, username: string, messageText: string) {
        const CHAT_CHANNEL_ID = process.env.DISCORD_CHAT_CHANNEL_ID;
        const WEBHOOK_URL = process.env.DISCORD_CHAT_WEBHOOK_URL;
        if (!CHAT_CHANNEL_ID && !WEBHOOK_URL) return;

        try {
            if (WEBHOOK_URL) {
                // Publish directly with player's skin head avatar via Webhook
                await fetch(WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: username,
                        avatar_url: `https://mc-heads.net/avatar/${username}`,
                        content: messageText
                    })
                });
            } else if (CHAT_CHANNEL_ID) {
                // Fallback to bot message
                const channel = await client.channels.fetch(CHAT_CHANNEL_ID) as TextChannel;
                if (channel?.isTextBased()) {
                    await channel.send(`💬 **[MC] <${username}>**: ${messageText}`);
                }
            }
        } catch (error) {
            console.error('[ChatBridge] Error broadcasting Minecraft message to Discord:', error);
        }
    }
}

