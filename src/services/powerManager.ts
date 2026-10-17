import {
  Client,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
  Message,
  Guild,
} from 'discord.js';
import { PelicanService } from './pelicanService';
import { MinecraftService } from './minecraftService';
import { CardCanvasService, CardStateData } from './cardCanvasService';
import { Logger } from './logger';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const execAsync = promisify(exec);

export function makeAsciiBar(percent: number, length = 10): string {
  const p = Math.max(0, Math.min(100, percent));
  const filled = Math.round((p / 100) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

export function generateTransitionAscii(transition: {
  title: string;
  progress: number;
  stepText: string;
}): string {
  const bar = makeAsciiBar(transition.progress, 10);
  const textDetail = (transition.stepText || transition.title)
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 22)
    .padEnd(22);
  return (
    '```text\n' +
    `┌─ TRANSICIÓN EN CURSO ────────┐\n` +
    `│ PROG: [${bar}] ${transition.progress.toString().padStart(3)}% │\n` +
    `│ DET : ${textDetail} │\n` +
    `└──────────────────────────────┘\n` +
    '```'
  );
}

export function generateStandardAscii(
  state: string,
  ramUsedMB: number,
  ramTotalMB: number,
  onlinePlayers: number,
  maxPlayers: number,
  hostIp: string,
): string {
  const ramPct = ramTotalMB > 0 ? (ramUsedMB / ramTotalMB) * 100 : 0;
  const playerPct = maxPlayers > 0 ? (onlinePlayers / maxPlayers) * 100 : 0;
  const ramGB = (ramUsedMB / 1024).toFixed(1);
  const ramTotalGB = (ramTotalMB / 1024).toFixed(1);

  const isRunning = state === 'running';
  const ramBar = makeAsciiBar(isRunning ? ramPct : 0, 10);
  const playBar = makeAsciiBar(isRunning ? playerPct : 0, 10);

  const ipClean = hostIp.slice(0, 22).padEnd(22);
  const ramStr = `${ramGB}/${ramTotalGB}GB`.padStart(9);
  const playStr = `${onlinePlayers}/${maxPlayers} On`.padStart(9);

  return (
    '```text\n' +
    `┌─ CONTROL MATRIX ────────────┐\n` +
    `│ IP : ${ipClean} │\n` +
    `│ RAM: [${ramBar}] ${ramStr} │\n` +
    `│ JUG: [${playBar}] ${playStr} │\n` +
    `└─────────────────────────────┘\n` +
    '```'
  );
}

export function generateEmbedAsciiMatrix(
  state: string,
  ramUsedMB: number,
  ramTotalMB: number,
  onlinePlayers: number,
  maxPlayers: number,
  hostIp: string,
  transition: { title: string; progress: number; stepText: string } | null,
): string {
  if (transition) {
    return generateTransitionAscii(transition);
  }
  return generateStandardAscii(state, ramUsedMB, ramTotalMB, onlinePlayers, maxPlayers, hostIp);
}

export interface StatusDisplay {
  icon: string;
  text: string;
  color: number;
}

export const STATUS_DISPLAYS: Record<CardStateData['state'], StatusDisplay> = {
  running: { icon: '🟢', text: 'En ejecución (Online)', color: 0x10b981 },
  starting: { icon: '🔵', text: 'Iniciando (Cargando mods & plugins...)', color: 0x3b82f6 },
  stopping: { icon: '🟡', text: 'Deteniendo (Guardando terreno...)', color: 0xf59e0b },
  missing: { icon: '⚪', text: 'Laptop Desconectada (Host Offline)', color: 0x4b5563 },
  offline: { icon: '🔴', text: 'Desconectado / Offline', color: 0xef4444 },
};

export function getStatusDisplay(state: CardStateData['state']): StatusDisplay {
  return STATUS_DISPLAYS[state] ?? STATUS_DISPLAYS.offline;
}

export function getStepBullet(
  currentStep: number,
  targetStep: number,
  pendingBullet: string = '⚪',
): string {
  return currentStep >= targetStep ? '🟢' : pendingBullet;
}

export function buildWolStepText(step: number): string {
  const b1 = getStepBullet(step, 1);
  const b2 = getStepBullet(step, 2, '🟡');
  const b3 = getStepBullet(step, 3);
  const b4 = getStepBullet(step, 4);
  return (
    `> ${b1} Paso 1/4: Magic Packet transmitido por red local.\n` +
    `> ${b2} Paso 2/4: Inicializando BIOS y sistema operativo...\n` +
    `> ${b3} Paso 3/4: Verificando daemon de Pelican Wings (Puerto 8080)...\n` +
    `> ${b4} Paso 4/4: Estableciendo socket de control...`
  );
}

export function buildPelicanStartStepText(step: number): string {
  const b1 = getStepBullet(step, 1);
  const b2 = getStepBullet(step, 2, '🟡');
  const b3 = getStepBullet(step, 3, '🟡');
  const b4 = getStepBullet(step, 4);
  return (
    `> ${b1} Paso 1/4: Petición enviada al panel Pelican.\n` +
    `> ${b2} Paso 2/4: Asignando 12 GB RAM y procesadores JVM...\n` +
    `> ${b3} Paso 3/4: Cargando 136 mods NeoForge y plugins Paper...\n` +
    `> ${b4} Paso 4/4: Abriendo socket dev.crystaltidessmp.net:25565...`
  );
}

export function buildTransitionStepText(action: string, step: number): string {
  if (action === 'wol_pc') {
    return buildWolStepText(step);
  }
  if (action === 'pelican_start') {
    return buildPelicanStartStepText(step);
  }
  return (
    `> 🟢 Paso 1/2: Guardando mapa, chunks e inventarios (/save-all).\n` +
    `> 🟡 Paso 2/2: Desconectando jugadores y apagando contenedor...`
  );
}

export function buildControlButtons(
  state: CardStateData['state'],
  activeAction?: string | null,
): [ActionRowBuilder<ButtonBuilder>, ActionRowBuilder<ButtonBuilder>] {
  const isOffline = state === 'offline';
  const isMissing = state === 'missing';
  const isRunning = state === 'running';
  const isStarting = state === 'starting';
  const isStopping = state === 'stopping';
  const isOnlineOrStarting = isRunning || isStarting;
  const hasActiveTransition = Boolean(activeAction);

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('wol_pc')
      .setLabel(activeAction === 'wol_pc' ? '⏳ Encendiendo Laptop...' : '⚡ Encender PC (WOL)')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(hasActiveTransition || !isMissing),
    new ButtonBuilder()
      .setCustomId('pelican_start')
      .setLabel(
        activeAction === 'pelican_start' || isStarting
          ? '⏳ Arrancando Server...'
          : '▶️ Iniciar Minecraft',
      )
      .setStyle(ButtonStyle.Success)
      .setDisabled(hasActiveTransition || (!isOffline && !isMissing)),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('pelican_restart')
      .setLabel(activeAction === 'pelican_restart' ? '⏳ Reiniciando...' : '🔄 Reiniciar')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(hasActiveTransition || !isOnlineOrStarting),
    new ButtonBuilder()
      .setCustomId('pelican_stop')
      .setLabel(activeAction === 'pelican_stop' || isStopping ? '⏳ Deteniendo...' : '🛑 Detener')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(hasActiveTransition || (!isOnlineOrStarting && !isStopping)),
  );

  return [row1, row2];
}

export class PowerManager {
  private static client: Client;
  private static laptopWasWoken = false;
  private static countdownActive = false;
  private static countdownSecondsRemaining = 300; // 5 minutes default
  private static checkInterval: NodeJS.Timeout | null = null;
  private static lastState: string | null = null;
  private static serverStartTimeUnix: number | null = null;
  private static activeTransition: {
    action: string;
    step: number;
    title: string;
    progress: number;
  } | null = null;

  // Cached control message location — persisted to disk
  private static readonly CONTROL_FILE = path.join(__dirname, '../../.control_msg.json');
  private static controlChannelId: string | null = null;
  private static controlMessageId: string | null = null;
  private static lastUploadedState: string | null = null;
  private static lastUploadTimestamp = 0;

  private static readonly MC_HOST =
    process.env.MC_SERVER_HOST ?? process.env.MINECRAFT_SERVER_HOST ?? '127.0.0.1';
  private static readonly MC_PORT = Number.parseInt(
    process.env.MC_SERVER_PORT ?? process.env.MINECRAFT_SERVER_PORT ?? '25565',
    10,
  );
  private static readonly MC_DISPLAY_HOST =
    process.env.MC_DISPLAY_HOST ?? 'dev.crystaltidessmp.net';
  private static readonly AUTO_SHUTDOWN_ENABLED = process.env.AUTO_SHUTDOWN_ENABLED === 'true';

  private static loadControlMessageLocation() {
    try {
      if (fs.existsSync(this.CONTROL_FILE)) {
        const data = JSON.parse(fs.readFileSync(this.CONTROL_FILE, 'utf-8'));
        if (data.channelId && data.messageId) {
          this.controlChannelId = data.channelId;
          this.controlMessageId = data.messageId;
          console.log(
            `[PowerManager] Loaded control message location from file: channel ${data.channelId}, message ${data.messageId}`,
          );
        }
      }
    } catch (e) {
      console.warn('[PowerManager] Failed to load control message location file:', e);
    }
  }

  /**
   * Initializes the PowerManager loop.
   */
  static init(client: Client) {
    this.client = client;
    this.loadControlMessageLocation();

    // Run check loop every 10 seconds for ultra reactivity
    this.checkInterval = setInterval(() => this.checkStatusLoop(), 10000);

    // Initial run
    setTimeout(() => this.checkStatusLoop(), 2000);

    console.log('[PowerManager] Reactive Canvas update loop initialized (10s interval).');
  }

  private static async triggerWolTransition() {
    this.activeTransition = {
      action: 'wol_pc',
      step: 1,
      title: '⚡ Despertando Nodo Laptop (Magic Packet WOL)',
      progress: 25,
    };
    await this.updateControlEmbed();

    setTimeout(async () => {
      if (this.activeTransition?.action === 'wol_pc') {
        this.activeTransition = {
          action: 'wol_pc',
          step: 2,
          title: '⚡ Despertando Nodo Laptop (Inicializando Sistema)',
          progress: 55,
        };
        await this.updateControlEmbed();
      }
    }, 3500);

    setTimeout(async () => {
      if (this.activeTransition?.action === 'wol_pc') {
        this.activeTransition = {
          action: 'wol_pc',
          step: 3,
          title: '⚡ Despertando Nodo Laptop (Conectando Wings)',
          progress: 85,
        };
        await this.updateControlEmbed();
      }
    }, 7500);

    setTimeout(() => {
      this.activeTransition = null;
      this.updateControlEmbed();
    }, 11000);
  }

  private static async triggerStartTransition() {
    this.activeTransition = {
      action: 'pelican_start',
      step: 1,
      title: '🎮 Arrancando Servidor de Minecraft (Paper 1.21.1)',
      progress: 25,
    };
    await this.updateControlEmbed();

    setTimeout(async () => {
      if (this.activeTransition?.action === 'pelican_start') {
        this.activeTransition = {
          action: 'pelican_start',
          step: 2,
          title: '🎮 Arrancando Minecraft (Asignando RAM & JVM)',
          progress: 50,
        };
        await this.updateControlEmbed();
      }
    }, 4000);

    setTimeout(async () => {
      if (this.activeTransition?.action === 'pelican_start') {
        this.activeTransition = {
          action: 'pelican_start',
          step: 3,
          title: '🎮 Arrancando Minecraft (Cargando 136 Mods NeoForge)',
          progress: 80,
        };
        await this.updateControlEmbed();
      }
    }, 10000);

    setTimeout(() => {
      this.activeTransition = null;
      this.updateControlEmbed();
    }, 18000);
  }

  private static async triggerStopTransition(action: 'pelican_stop' | 'pelican_restart') {
    this.activeTransition = {
      action,
      step: 1,
      title: '🔴 Deteniendo & Guardando Terreno (/save-all)',
      progress: 50,
    };
    await this.updateControlEmbed();

    setTimeout(() => {
      this.activeTransition = null;
      this.updateControlEmbed();
    }, 6000);
  }

  /**
   * Triggers a multi-stage step-by-step visual transition (React-like progress animation).
   */
  static async triggerActionTransition(
    action: 'wol_pc' | 'pelican_start' | 'pelican_restart' | 'pelican_stop',
  ) {
    if (action === 'wol_pc') {
      await this.triggerWolTransition();
    } else if (action === 'pelican_start') {
      await this.triggerStartTransition();
    } else {
      await this.triggerStopTransition(action);
    }
  }

  /**
   * Registers the control message location so the loop doesn't need to scan all channels.
   * Called by setupControl after sending the initial embed.
   */
  static setControlMessage(channelId: string, messageId: string) {
    this.controlChannelId = channelId;
    this.controlMessageId = messageId;
    try {
      fs.writeFileSync(this.CONTROL_FILE, JSON.stringify({ channelId, messageId }), 'utf-8');
      console.log(
        `[PowerManager] Saved control message location to file: channel ${channelId}, message ${messageId}`,
      );
    } catch (e) {
      console.warn('[PowerManager] Failed to save control message location file:', e);
    }
  }

  private static async fetchCachedControlMessage(): Promise<Message | null> {
    if (!this.controlChannelId || !this.controlMessageId) return null;
    try {
      const channel = (await this.client.channels.fetch(this.controlChannelId)) as TextChannel;
      if (channel && 'messages' in channel) {
        return await channel.messages.fetch(this.controlMessageId);
      }
    } catch {
      this.controlChannelId = null;
      this.controlMessageId = null;
    }
    return null;
  }

  private static isControlMessage(message: Message, botId?: string): boolean {
    if (message.author.id !== botId) return false;
    const title = message.embeds[0]?.title ?? '';
    return (
      title.includes('Control') ||
      title.includes('Nodo') ||
      title.includes('Despertando') ||
      title.includes('Arrancando')
    );
  }

  private static async scanGuildForControlMessage(guild: Guild): Promise<Message | null> {
    try {
      const channels = await guild.channels.fetch();
      for (const channel of channels.values()) {
        if (!channel || !channel.isTextBased() || !('messages' in channel)) continue;
        try {
          const textChannel = channel as TextChannel;
          const messages = await textChannel.messages.fetch({ limit: 25 });
          const controlMsg = messages.find((m) => this.isControlMessage(m, this.client.user?.id));
          if (controlMsg) return controlMsg;
        } catch {
          // Ignored per-channel fetch errors
        }
      }
    } catch (err) {
      console.warn(
        `[PowerManager] Failed fetching channels for guild ${guild.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return null;
  }

  /**
   * Fetches the cached control embed message directly by channel+message ID.
   * Falls back to a single-channel scan only on first boot (when IDs are unknown).
   */
  static async findControlMessage(): Promise<Message | null> {
    console.log(
      `[PowerManager] findControlMessage called. cached channel: ${this.controlChannelId}, cached message: ${this.controlMessageId}`,
    );
    const cached = await this.fetchCachedControlMessage();
    if (cached) return cached;

    for (const guild of this.client.guilds.cache.values()) {
      const controlMsg = await this.scanGuildForControlMessage(guild);
      if (controlMsg) {
        this.controlChannelId = controlMsg.channelId;
        this.controlMessageId = controlMsg.id;
        return controlMsg;
      }
    }
    return null;
  }

  private static async resolveLiveMetrics(state: CardStateData['state']) {
    if (state !== 'running') {
      this.serverStartTimeUnix = null;
      return { onlinePlayers: 0, maxPlayers: 20, pingMs: 0 };
    }

    if (!this.serverStartTimeUnix) {
      this.serverStartTimeUnix = Math.floor(Date.now() / 1000);
    }

    const pingStart = Date.now();
    const mcPing = await MinecraftService.pingServer(this.MC_HOST, this.MC_PORT);
    const pingMs = mcPing ? Date.now() - pingStart : 0;
    return {
      onlinePlayers: mcPing?.players ?? 0,
      maxPlayers: mcPing?.max ?? 20,
      pingMs,
    };
  }

  static async syncControlMessage(
    controlMsg: Message,
    embed: EmbedBuilder,
    components: ActionRowBuilder<ButtonBuilder>[],
    cardData: CardStateData,
    stateKey: string,
  ) {
    const shouldUploadCanvas =
      stateKey !== this.lastUploadedState || Date.now() - this.lastUploadTimestamp > 120_000;
    const baseUrl = process.env.BOT_PUBLIC_URL ?? 'https://bot.crystaltidessmp.net';

    if (!shouldUploadCanvas) {
      const currentImg = controlMsg.embeds[0]?.image?.url ?? `${baseUrl}/canvas/dashboard.png`;
      embed.setImage(currentImg);
      await controlMsg.edit({ embeds: [embed], components });
      return;
    }

    try {
      await CardCanvasService.renderCardBuffer(cardData);
      const imageUrl = `${baseUrl}/canvas/dashboard.png?t=${Date.now()}`;
      embed.setImage(imageUrl);

      await controlMsg.edit({ embeds: [embed], components });
      this.lastUploadedState = stateKey;
      this.lastUploadTimestamp = Date.now();
      console.log(`[PowerManager] Control embed updated with CANVAS URL (state: ${stateKey}).`);
    } catch (renderErr) {
      console.warn(
        `[PowerManager] Canvas render failed:`,
        renderErr instanceof Error ? renderErr.message : String(renderErr),
      );
      await controlMsg.edit({ embeds: [embed], components });
    }
  }

  /**
   * Updates the persistent control embed with the current state and renders a fresh Canvas PNG.
   */
  static async updateControlEmbed() {
    const controlMsg = await this.findControlMessage();
    if (!controlMsg) return;

    try {
      const status = await PelicanService.getServerStatus();
      const state: CardStateData['state'] = status?.state ?? 'offline';
      const metrics = await this.resolveLiveMetrics(state);

      const ramUsedMB = status?.utilization
        ? Math.round(status.utilization.memory_bytes / 1024 / 1024)
        : 0;
      const ramTotalMB = 12288; // 12 GB

      const stepText = this.activeTransition
        ? buildTransitionStepText(this.activeTransition.action, this.activeTransition.step)
        : '';

      const cardData: CardStateData = {
        state,
        serverHost: this.MC_DISPLAY_HOST,
        serverPort: this.MC_PORT,
        onlinePlayers: metrics.onlinePlayers,
        maxPlayers: metrics.maxPlayers,
        ramUsedMB,
        ramTotalMB,
        pingMs: metrics.pingMs,
        transition: this.activeTransition
          ? {
              actionTitle: this.activeTransition.title,
              progress: this.activeTransition.progress,
              step: this.activeTransition.step,
              stepText,
            }
          : null,
      };

      const statusDisplay = getStatusDisplay(state);
      const desc =
        `### ${statusDisplay.icon} Estado del Servidor: **${statusDisplay.text}**\n\n` +
        generateEmbedAsciiMatrix(
          state,
          ramUsedMB,
          ramTotalMB,
          metrics.onlinePlayers,
          metrics.maxPlayers,
          `${this.MC_DISPLAY_HOST}:${this.MC_PORT}`,
          this.activeTransition
            ? {
                title: this.activeTransition.title,
                progress: this.activeTransition.progress,
                stepText: stepText || this.activeTransition.title,
              }
            : null,
        );

      const embed = new EmbedBuilder()
        .setTitle('⚡ CrystalTides — Control de Nodo & Energía')
        .setDescription(desc)
        .setColor(statusDisplay.color)
        .setTimestamp()
        .setFooter({ text: '⚡ Sincronización en vivo • Panel de Control' });

      const components = buildControlButtons(state, this.activeTransition?.action);
      const stateKey = `${state}_${this.activeTransition?.action ?? 'none'}_${this.activeTransition?.step ?? 0}`;

      await this.syncControlMessage(controlMsg, embed, components, cardData, stateKey);
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
    pngBuffer: Buffer,
  ): Promise<boolean> {
    const token = process.env.DISCORD_TOKEN;
    if (!token) return false;

    const form = new FormData();
    form.append(
      'payload_json',
      JSON.stringify({
        embeds: [embed.toJSON()],
        components: components.map((c) => c.toJSON()),
        attachments: [{ id: '0', filename: 'dashboard.png' }],
      }),
    );
    form.append(
      'files[0]',
      new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' }),
      'dashboard.png',
    );

    const res = await globalThis.fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bot ${token}` },
        body: form,
      },
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
      const minutes = Number.parseInt(process.env.AUTO_SHUTDOWN_MINUTES ?? '15', 10);
      this.countdownSecondsRemaining = minutes * 60;
      Logger.log(
        'Energía',
        `⚠️ No hay jugadores conectados. Se iniciará el apagado automático en ${minutes} minutos.`,
        'warn',
      );
      return;
    }

    // Interval runs every 10 seconds, decrement by 10s
    this.countdownSecondsRemaining -= 10;
    if (this.countdownSecondsRemaining <= 0) {
      this.countdownActive = false;
      await this.executeShutdownSequence();
    }
  }

  static async evaluateAutoShutdown(state: string) {
    if (!this.AUTO_SHUTDOWN_ENABLED || !this.laptopWasWoken || state !== 'running') {
      if (this.countdownActive) {
        this.countdownActive = false;
      }
      return;
    }

    const mcPing = await MinecraftService.pingServer(this.MC_HOST, this.MC_PORT);
    if (mcPing !== null) {
      await this.handleCountdownRunning(mcPing.players);
    } else if (this.countdownActive) {
      this.countdownActive = false;
    }
  }

  /**
   * Periodically runs status checks, transitions, and countdown handling.
   */
  private static async checkStatusLoop() {
    try {
      const status = await PelicanService.getServerStatus();
      const state = status?.state ?? 'offline';

      this.updateLaptopState(state);
      await this.evaluateAutoShutdown(state);

      this.lastState = state;
      await this.updateControlEmbed();
    } catch (error) {
      console.error('[PowerManager] Error in loop check:', error);
    }
  }

  private static async waitForServerOffline(): Promise<void> {
    let attempts = 0;
    while (attempts < 6) {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      const status = await PelicanService.getServerStatus();
      if (!status || status.state === 'offline') break;
      attempts++;
    }
  }

  private static async sendPoweroffSsh(): Promise<void> {
    try {
      const { stdout, stderr } = await execAsync(
        'ssh -i /app/id_minecraft_pem -p 8022 -o StrictHostKeyChecking=no nerofernoultranix@frps "sudo poweroff"',
      );
      console.log('[PowerManager] SSH output:', stdout, stderr);
      Logger.log('Energía', '✅ Comando de apagado enviado con éxito a la Laptop.', 'success');
    } catch (e: unknown) {
      const errMsg = (e as Error).message || String(e);
      console.error('[PowerManager] Failed to SSH shutdown:', e);
      Logger.log('Energía', `❌ Error al apagar la Laptop por SSH: ${errMsg}`, 'error');
    }
  }

  /**
   * Stops the Minecraft server and issues the SSH poweroff command.
   */
  private static async executeShutdownSequence() {
    Logger.log(
      'Energía',
      '🛑 Ejecutando apagado automático: Deteniendo servidor Minecraft...',
      'warn',
    );
    await PelicanService.sendPowerAction('stop');

    await this.waitForServerOffline();

    Logger.log(
      'Energía',
      '💤 Servidor detenido. Enviando señal de apagado (poweroff) a la Laptop por SSH...',
      'warn',
    );

    await this.sendPoweroffSsh();
    this.laptopWasWoken = false;
  }
}
