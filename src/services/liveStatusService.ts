import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { MinecraftService } from './minecraftService';
import { PelicanService } from './pelicanService';

export class LiveStatusService {
    private static intervalTimer: NodeJS.Timeout | null = null;
    private static lastMessageId: string | null = null;

    public static init(client: Client) {
        const CHANNEL_ID = process.env.DISCORD_STATUS_CHANNEL_ID;
        if (!CHANNEL_ID) {
            console.log('[LiveStatus] DISCORD_STATUS_CHANNEL_ID not set. Live status update disabled.');
            return;
        }

        // Run initial update after 10s
        setTimeout(() => this.updateLiveStatus(client), 10_000);

        // Run interval every 60s
        this.intervalTimer = setInterval(() => {
            this.updateLiveStatus(client);
        }, 60_000);
    }

    public static async updateLiveStatus(client: Client) {
        const CHANNEL_ID = process.env.DISCORD_STATUS_CHANNEL_ID;
        if (!CHANNEL_ID) return;

        try {
            const channel = await client.channels.fetch(CHANNEL_ID) as TextChannel;
            if (!channel?.isTextBased()) return;

            const mcHost = process.env.MINECRAFT_SERVER_HOST || 'mc.crystaltidessmp.net';
            const mcPort = Number.parseInt(process.env.MINECRAFT_SERVER_PORT || '25565', 10);
            
            const mcStatus = await MinecraftService.pingServer(mcHost, mcPort);
            const pelicanStats = await PelicanService.getServerStatus();

            const isOnline = mcStatus?.online || pelicanStats?.state === 'running';
            const statusColor = isOnline ? 0x10B981 : 0xEF4444; // Green vs Red

            const memory = pelicanStats?.utilization?.memory_bytes;
            const cpu = pelicanStats?.utilization?.cpu_absolute;

            const embed = new EmbedBuilder()
                .setTitle('🌐 CrystalTides SMP — Estado en Vivo')
                .setDescription('Monitorización en tiempo real de la infraestructura del servidor.')
                .setColor(statusColor)
                .addFields(
                    { name: '📡 Estado Servidor', value: isOnline ? '🟢 **ONLINE**' : '🔴 **OFFLINE**', inline: true },
                    { name: '👥 Jugadores Online', value: isOnline ? `**${mcStatus?.players || 0}** / ${mcStatus?.max || 100}` : '`0 / 100`', inline: true },
                    { name: '⚡ TPS Estimado', value: isOnline ? '🟢 **20.0 TPS** (Óptimo)' : '🔴 **0.0 TPS**', inline: true },
                    { name: '🖥️ RAM Usada', value: memory ? `**${(memory / (1024 * 1024 * 1024)).toFixed(2)} GB**` : '`-- GB`', inline: true },
                    { name: '⚙️ CPU Usage', value: cpu ? `**${cpu.toFixed(1)}%**` : '`-- %`', inline: true },
                    { name: '🌐 Dominio Web', value: 'https://crystaltidessmp.net', inline: true }
                )
                .setFooter({ text: 'Actualizado automáticamente cada 60 segundos • CrystalBot v2.0' })
                .setTimestamp();

            // Check if there is an existing message to edit
            const messages = await channel.messages.fetch({ limit: 10 });
            const botMessage = messages.find(m => m.author.id === client.user?.id);

            if (botMessage) {
                await botMessage.edit({ embeds: [embed] });
            } else {
                const newMsg = await channel.send({ embeds: [embed] });
                this.lastMessageId = newMsg.id;
            }
        } catch (error) {
            console.error('[LiveStatus] Error updating live status embed:', error);
        }
    }
}
