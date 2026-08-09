import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from 'discord.js';
import { PelicanService } from './pelicanService';
import { MinecraftService } from './minecraftService';
import { CardCanvasService, CardStateData } from './cardCanvasService';
import { Logger } from './logger';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export class PowerManager {
    private static client: Client;
    private static laptopWasWoken = false;
    private static countdownActive = false;
    private static countdownSecondsRemaining = 300; // 5 minutes default
    private static checkInterval: NodeJS.Timeout | null = null;
    private static lastState: string | null = null;
    private static serverStartTimeUnix: number | null = null;
    private static activeTransition: { action: string; step: number; title: string; progress: number } | null = null;

    // Cached control message location — set by setupControl command
    private static controlChannelId: string | null = null;
    private static controlMessageId: string | null = null;
    private static lastUploadedState: string | null = null;
    private static lastUploadTimestamp = 0;

    private static readonly MC_HOST = process.env.MC_SERVER_HOST || process.env.MINECRAFT_SERVER_HOST || "127.0.0.1";
    private static readonly MC_PORT = Number.parseInt(process.env.MC_SERVER_PORT || process.env.MINECRAFT_SERVER_PORT || "25565", 10);
    private static readonly MC_DISPLAY_HOST = process.env.MC_DISPLAY_HOST || "dev.crystaltidessmp.net";
    private static readonly AUTO_SHUTDOWN_ENABLED = process.env.AUTO_SHUTDOWN_ENABLED === 'true';

    /**
     * Initializes the PowerManager loop.
     */
    static init(client: Client) {
        this.client = client;
        
        // Run check loop every 10 seconds for ultra reactivity
        this.checkInterval = setInterval(() => this.checkStatusLoop(), 10000);
        
        // Initial run
        setTimeout(() => this.checkStatusLoop(), 2000);
        
        console.log("[PowerManager] Reactive Canvas update loop initialized (10s interval).");
    }

    /**
     * Triggers a multi-stage step-by-step visual transition (React-like progress animation).
     */
    static async triggerActionTransition(action: 'wol_pc' | 'pelican_start' | 'pelican_restart' | 'pelican_stop') {
        if (action === 'wol_pc') {
            this.activeTransition = { action: 'wol_pc', step: 1, title: '⚡ Despertando Nodo Laptop (Magic Packet WOL)', progress: 25 };
            await this.updateControlEmbed();

            setTimeout(async () => {
                if (this.activeTransition?.action === 'wol_pc') {
                    this.activeTransition = { action: 'wol_pc', step: 2, title: '⚡ Despertando Nodo Laptop (Inicializando Sistema)', progress: 55 };
                    await this.updateControlEmbed();
                }
            }, 3500);

            setTimeout(async () => {
                if (this.activeTransition?.action === 'wol_pc') {
                    this.activeTransition = { action: 'wol_pc', step: 3, title: '⚡ Despertando Nodo Laptop (Conectando Wings)', progress: 85 };
                    await this.updateControlEmbed();
                }
            }, 7500);

            setTimeout(() => {
                this.activeTransition = null;
                this.updateControlEmbed();
            }, 11000);

        } else if (action === 'pelican_start') {
            this.activeTransition = { action: 'pelican_start', step: 1, title: '🎮 Arrancando Servidor de Minecraft (Paper 1.21.1)', progress: 25 };
            await this.updateControlEmbed();

            setTimeout(async () => {
                if (this.activeTransition?.action === 'pelican_start') {
                    this.activeTransition = { action: 'pelican_start', step: 2, title: '🎮 Arrancando Minecraft (Asignando RAM & JVM)', progress: 50 };
                    await this.updateControlEmbed();
                }
            }, 4000);

            setTimeout(async () => {
                if (this.activeTransition?.action === 'pelican_start') {
                    this.activeTransition = { action: 'pelican_start', step: 3, title: '🎮 Arrancando Minecraft (Cargando 136 Mods NeoForge)', progress: 80 };
                    await this.updateControlEmbed();
                }
            }, 10000);

            setTimeout(() => {
                this.activeTransition = null;
                this.updateControlEmbed();
            }, 18000);

        } else if (action === 'pelican_stop' || action === 'pelican_restart') {
            this.activeTransition = { action: action, step: 1, title: '🔴 Deteniendo & Guardando Terreno (/save-all)', progress: 50 };
            await this.updateControlEmbed();

            setTimeout(() => {
                this.activeTransition = null;
                this.updateControlEmbed();
            }, 6000);
        }
    }

    /**
     * Registers the control message location so the loop doesn't need to scan all channels.
     * Called by setupControl after sending the initial embed.
     */
    static setControlMessage(channelId: string, messageId: string) {
        this.controlChannelId = channelId;
        this.controlMessageId = messageId;
    }

    /**
     * Fetches the cached control embed message directly by channel+message ID.
     * Falls back to a single-channel scan only on first boot (when IDs are unknown).
     */
    static async findControlMessage() {
        console.log(`[PowerManager] findControlMessage called. cached channel: ${this.controlChannelId}, cached message: ${this.controlMessageId}`);
        // Fast path: use cached IDs
        if (this.controlChannelId && this.controlMessageId) {
            try {
                const channel = await this.client.channels.fetch(this.controlChannelId) as TextChannel;
                if (channel && 'messages' in channel) {
                    const msg = await channel.messages.fetch(this.controlMessageId);
                    return msg;
                }
            } catch {
                // Message was deleted — clear cache
                this.controlChannelId = null;
                this.controlMessageId = null;
            }
        }

        // Slow path fallback: scan all channels once on startup
        for (const guild of this.client.guilds.cache.values()) {
            try {
                const channels = await guild.channels.fetch();
                for (const channel of channels.values()) {
                    if (channel && channel.isTextBased() && 'messages' in channel) {
                        try {
                            const textChannel = channel as TextChannel;
                            const messages = await textChannel.messages.fetch({ limit: 25 });
                            const controlMsg = messages.find(m =>
                                m.author.id === this.client.user?.id &&
                                (m.embeds[0]?.title?.includes('Control') || m.embeds[0]?.title?.includes('Nodo') ||
                                 m.embeds[0]?.title?.includes('Despertando') || m.embeds[0]?.title?.includes('Arrancando'))
                            );
                            if (controlMsg) {
                                // Cache for future calls
                                this.controlChannelId = textChannel.id;
                                this.controlMessageId = controlMsg.id;
                                return controlMsg;
                            }
                        } catch {
                            // Ignored per-channel fetch errors
                        }
                    }
                }
            } catch (err) {
                console.warn(`[PowerManager] Failed fetching channels for guild ${guild.id}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        return null;
    }

    /**
     * Updates the persistent control embed with the current state and renders a fresh Canvas PNG.
     */
    static async updateControlEmbed() {
        const controlMsg = await this.findControlMessage();
        if (!controlMsg) return;

        try {
            const status = await PelicanService.getServerStatus();
            const state = (status?.state || 'offline') as CardStateData['state'];
            const nowUnix = Math.floor(Date.now() / 1000);

            let onlinePlayers = 0;
            let maxPlayers = 20;
            let pingMs = 0;

            if (state === 'running') {
                if (!this.serverStartTimeUnix) {
                    this.serverStartTimeUnix = nowUnix;
                }
                const pingStart = Date.now();
                const mcPing = await MinecraftService.pingServer(this.MC_HOST, this.MC_PORT);
                pingMs = mcPing ? (Date.now() - pingStart) : 0;
                if (mcPing) {
                    onlinePlayers = mcPing.players;
                    maxPlayers = mcPing.max || 20;
                }
            } else {
                this.serverStartTimeUnix = null;
            }

            // Build Canvas Card Data
            const ramUsedMB = status?.utilization ? Math.round(status.utilization.memory_bytes / 1024 / 1024) : 0;
            const ramTotalMB = 12288; // 12 GB

            let stepText = '';
            if (this.activeTransition) {
                const tr = this.activeTransition;
                if (tr.action === 'wol_pc') {
                    stepText = 
                        `> ${tr.step >= 1 ? '🟢' : '⚪'} Paso 1/4: Magic Packet transmitido por red local.\n` +
                        `> ${tr.step >= 2 ? '🟢' : '🟡'} Paso 2/4: Inicializando BIOS y sistema operativo...\n` +
                        `> ${tr.step >= 3 ? '🟢' : '⚪'} Paso 3/4: Verificando daemon de Pelican Wings (Puerto 8080)...\n` +
                        `> ${tr.step >= 4 ? '🟢' : '⚪'} Paso 4/4: Estableciendo socket de control...`;
                } else if (tr.action === 'pelican_start') {
                    stepText = 
                        `> ${tr.step >= 1 ? '🟢' : '⚪'} Paso 1/4: Petición enviada al panel Pelican.\n` +
                        `> ${tr.step >= 2 ? '🟢' : '🟡'} Paso 2/4: Asignando 12 GB RAM y procesadores JVM...\n` +
                        `> ${tr.step >= 3 ? '🟢' : '🟡'} Paso 3/4: Cargando 136 mods NeoForge y plugins Paper...\n` +
                        `> ${tr.step >= 4 ? '🟢' : '⚪'} Paso 4/4: Abriendo socket dev.crystaltidessmp.net:25565...`;
                } else {
                    stepText = 
                        `> 🟢 Paso 1/2: Guardando mapa, chunks e inventarios (/save-all).\n` +
                        `> 🟡 Paso 2/2: Desconectando jugadores y apagando contenedor...`;
                }
            }

            const cardData: CardStateData = {
                state: state,
                serverHost: this.MC_DISPLAY_HOST,
                serverPort: this.MC_PORT,
                onlinePlayers: onlinePlayers,
                maxPlayers: maxPlayers,
                ramUsedMB: ramUsedMB,
                ramTotalMB: ramTotalMB,
                pingMs: pingMs,
                transition: this.activeTransition ? {
                    actionTitle: this.activeTransition.title,
                    progress: this.activeTransition.progress,
                    step: this.activeTransition.step,
                    stepText: stepText
                } : null
            };

            let statusIcon = '🔴';
            let statusText = 'Desconectado / Offline';
            let embedColor = 0xef4444;

            if (state === 'running') {
                statusIcon = '🟢';
                statusText = 'En ejecución (Online)';
                embedColor = 0x10b981;
            } else if (state === 'starting') {
                statusIcon = '🔵';
                statusText = 'Iniciando (Cargando mods & plugins...)';
                embedColor = 0x3b82f6;
            } else if (state === 'stopping') {
                statusIcon = '🟡';
                statusText = 'Deteniendo (Guardando terreno...)';
                embedColor = 0xf59e0b;
            } else if (state === 'missing') {
                statusIcon = '⚪';
                statusText = 'Laptop Desconectada (Host Offline)';
                embedColor = 0x4b5563;
            }

            const ramFormatted = (ramUsedMB / 1024).toFixed(2);
            const ramTotalFormatted = (ramTotalMB / 1024).toFixed(2);

            let desc = `### ${statusIcon} Estado del Servidor: **${statusText}**\n\n`;

            if (this.activeTransition) {
                desc += `**Transición en curso**: ${this.activeTransition.title} (${this.activeTransition.progress}%)\n`;
                if (stepText) desc += `${stepText}\n\n`;
            }

            desc += 
                `> 💻 **Nodo / Host**: ${this.laptopWasWoken ? 'Laptop Conectada (Wings OK)' : 'Laptop Apagada'}\n` +
                `> 👥 **Jugadores**: ${onlinePlayers} / ${maxPlayers}\n` +
                `> 💾 **Memoria RAM**: ${ramFormatted} GB / ${ramTotalFormatted} GB\n` +
                `> 📡 **Conexión IP**: \`${this.MC_DISPLAY_HOST}:${this.MC_PORT}\``;

            const embed = new EmbedBuilder()
                .setTitle('⚡ CrystalTides — Control de Nodo & Energía')
                .setDescription(desc)
                .setColor(embedColor)
                .setTimestamp()
                .setFooter({ text: '⚡ Sincronización en vivo • Panel de Control' });

            const isOffline = state === 'offline';
            const isMissing = state === 'missing';
            const isRunning = state === 'running';
            const isStarting = state === 'starting';
            const isStopping = state === 'stopping';
            const isOnlineOrStarting = isRunning || isStarting;

            const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId('wol_pc')
                    .setLabel(this.activeTransition?.action === 'wol_pc' ? '⏳ Encendiendo Laptop...' : '⚡ Encender PC (WOL)')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(this.activeTransition !== null || !isMissing),
                new ButtonBuilder()
                    .setCustomId('pelican_start')
                    .setLabel(this.activeTransition?.action === 'pelican_start' || isStarting ? '⏳ Arrancando Server...' : '▶️ Iniciar Minecraft')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(this.activeTransition !== null || (!isOffline && !isMissing)),
            );

            const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId('pelican_restart')
                    .setLabel(this.activeTransition?.action === 'pelican_restart' ? '⏳ Reiniciando...' : '🔄 Reiniciar')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(this.activeTransition !== null || !isOnlineOrStarting),
                new ButtonBuilder()
                    .setCustomId('pelican_stop')
                    .setLabel(this.activeTransition?.action === 'pelican_stop' || isStopping ? '⏳ Deteniendo...' : '🛑 Detener')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(this.activeTransition !== null || (!isOnlineOrStarting && !isStopping)),
            );

            // Smart Canvas: only re-upload image when state actually changes (avoids Discord socket flood)
            const stateKey = `${state}_${this.activeTransition?.action || 'none'}_${this.activeTransition?.step || 0}`;
            const shouldUploadCanvas = stateKey !== this.lastUploadedState || (Date.now() - this.lastUploadTimestamp > 120_000);

            if (shouldUploadCanvas) {
                let canvasUploaded = false;

                try {
                    const cardBuffer = await CardCanvasService.renderCardBuffer(cardData);
                    embed.setImage('attachment://dashboard.png');

                    // Use native fetch to bypass discord.js's undici (which gets 'other side closed' errors)
                    canvasUploaded = await this.editMessageWithCanvasNative(
                        controlMsg.channelId,
                        controlMsg.id,
                        embed,
                        [row1, row2],
                        cardBuffer
                    );

                    if (canvasUploaded) {
                        this.lastUploadedState = stateKey;
                        this.lastUploadTimestamp = Date.now();
                        console.log(`[PowerManager] Control embed updated with CANVAS via native fetch (state: ${stateKey}).`);
                    }
                } catch (renderErr) {
                    console.warn(`[PowerManager] Canvas render failed:`, renderErr instanceof Error ? renderErr.message : String(renderErr));
                }

                if (!canvasUploaded) {
                    // Native fetch failed — fall back to text-only via discord.js
                    const existingAttachment = controlMsg.attachments.first();
                    if (existingAttachment) {
                        embed.setImage(existingAttachment.url);
                    } else {
                        embed.setImage(null);
                    }
                    await controlMsg.edit({ embeds: [embed], components: [row1, row2] });
                    console.log(`[PowerManager] Control embed updated (text-only fallback).`);
                }
            } else {
                // No state change — just update text & buttons, keep existing image
                const existingAttachment = controlMsg.attachments.first();
                if (existingAttachment) {
                    embed.setImage(existingAttachment.url);
                }
                await controlMsg.edit({ embeds: [embed], components: [row1, row2] });
            }
        } catch (error) {
            console.error('[PowerManager] Error updating control embed:', error);
        }
    }
    /**
     * Uploads a canvas PNG to Discord using Node 24's native fetch + FormData.
     * This bypasses discord.js's undici HTTP client which causes persistent
     * 'other side closed' (UND_ERR_SOCKET) errors on Oracle ARM64 VPS.
     */
    private static async editMessageWithCanvasNative(
        channelId: string,
        messageId: string,
        embed: EmbedBuilder,
        components: ActionRowBuilder<ButtonBuilder>[],
        pngBuffer: Buffer
    ): Promise<boolean> {
        const token = process.env.DISCORD_TOKEN;
        if (!token) return false;

        const form = new FormData();
        form.append('payload_json', JSON.stringify({
            embeds: [embed.toJSON()],
            components: components.map(c => c.toJSON()),
        }));
        form.append('files[0]', new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' }), 'dashboard.png');

        const res = await globalThis.fetch(
            `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
            {
                method: 'PATCH',
                headers: { 'Authorization': `Bot ${token}` },
                body: form,
            }
        );

        if (!res.ok) {
            const body = await res.text().catch(() => '(no body)');
            console.warn(`[PowerManager] Native fetch upload failed: HTTP ${res.status} — ${body}`);
        }
        return res.ok;
    }

    private static updateLaptopState(state: string) {
        if (state !== 'offline' && !this.laptopWasWoken) {
            this.laptopWasWoken = true;
            Logger.log('Energía', '💻 La Laptop se ha activado y Wings reporta conexión.', 'info');
        } else if (state === 'offline' && this.laptopWasWoken) {
            this.laptopWasWoken = false;
            this.countdownActive = false;
            Logger.log('Energía', '💤 La Laptop se encuentra desconectada.', 'info');
        }
    }

    private static async handleCountdownRunning(onlinePlayers: number) {
        if (onlinePlayers > 0) {
            if (this.countdownActive) {
                this.countdownActive = false;
                Logger.log('Energía', '🎮 Jugador conectado. Apagado automático cancelado.', 'success');
            }
            return;
        }

        if (!this.countdownActive) {
            this.countdownActive = true;
            const minutes = Number.parseInt(process.env.AUTO_SHUTDOWN_MINUTES || '15', 10);
            this.countdownSecondsRemaining = minutes * 60;
            Logger.log('Energía', `⚠️ No hay jugadores conectados. Se iniciará el apagado automático en ${minutes} minutos.`, 'warn');
            return;
        }

        // Interval runs every 10 seconds, decrement by 10s
        this.countdownSecondsRemaining -= 10;
        if (this.countdownSecondsRemaining <= 0) {
            this.countdownActive = false;
            await this.executeShutdownSequence();
        }
    }

    /**
     * Periodically runs status checks, transitions, and countdown handling.
     */
    private static async checkStatusLoop() {
        try {
            const status = await PelicanService.getServerStatus();
            const state = status?.state || 'offline';

            this.updateLaptopState(state);

            if (this.AUTO_SHUTDOWN_ENABLED && this.laptopWasWoken && state === 'running') {
                const mcPing = await MinecraftService.pingServer(this.MC_HOST, this.MC_PORT);
                if (mcPing !== null) {
                    await this.handleCountdownRunning(mcPing.players);
                } else if (this.countdownActive) {
                    this.countdownActive = false;
                }
            } else if (this.countdownActive) {
                this.countdownActive = false;
            }

            this.lastState = state;
            await this.updateControlEmbed();
        } catch (error) {
            console.error('[PowerManager] Error in loop check:', error);
        }
    }

    /**
     * Stops the Minecraft server and issues the SSH poweroff command.
     */
    private static async executeShutdownSequence() {
        Logger.log('Energía', '🛑 Ejecutando apagado automático: Deteniendo servidor Minecraft...', 'warn');
        await PelicanService.sendPowerAction('stop');
        
        let attempts = 0;
        while (attempts < 6) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            const status = await PelicanService.getServerStatus();
            if (!status || status.state === 'offline') break;
            attempts++;
        }

        Logger.log('Energía', '💤 Servidor detenido. Enviando señal de apagado (poweroff) a la Laptop por SSH...', 'warn');
        
        try {
            const { stdout, stderr } = await execAsync(
                'ssh -i /app/id_minecraft_pem -p 8022 -o StrictHostKeyChecking=no nerofernoultranix@frps "sudo poweroff"'
            );
            console.log("[PowerManager] SSH output:", stdout, stderr);
            Logger.log('Energía', '✅ Comando de apagado enviado con éxito a la Laptop.', 'success');
        } catch (e: unknown) {
            const errMsg = (e as Error).message || String(e);
            console.error('[PowerManager] Failed to SSH shutdown:', e);
            Logger.log('Energía', `❌ Error al apagar la Laptop por SSH: ${errMsg}`, 'error');
        }

        this.laptopWasWoken = false;
    }
}
