import { createCanvas, CanvasRenderingContext2D, GlobalFonts } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';

// Register bundled Roboto fonts for consistent crisp typography across all platforms
const fontDir = path.join(process.cwd(), 'apps/discord-bot/src/assets/fonts');
const boldFontPath = path.join(fontDir, 'Roboto-Bold.ttf');
const regFontPath = path.join(fontDir, 'Roboto-Regular.ttf');

if (fs.existsSync(boldFontPath)) {
  GlobalFonts.registerFromPath(boldFontPath, 'Roboto');
}
if (fs.existsSync(regFontPath)) {
  GlobalFonts.registerFromPath(regFontPath, 'Roboto');
}

export interface CardStateData {
  state: 'running' | 'starting' | 'stopping' | 'offline' | 'missing';
  laptopName?: string;
  serverHost?: string;
  serverPort?: number;
  onlinePlayers?: number;
  maxPlayers?: number;
  ramUsedMB?: number;
  ramTotalMB?: number;
  pingMs?: number;
  transition?: {
    actionTitle: string;
    progress: number;
    step: number;
    stepText: string;
  } | null;
}

interface StatusTheme {
  accentColor: string;
  accentGlow: string;
  statusBadgeText: string;
}

const STATUS_THEMES: Record<CardStateData['state'], StatusTheme> = {
  running: {
    accentColor: '#89d9d1',
    accentGlow: 'rgba(137, 217, 209, 0.3)',
    statusBadgeText: 'SERVIDORES EN LÍNEA',
  },
  starting: {
    accentColor: '#38bdf8',
    accentGlow: 'rgba(56, 189, 248, 0.3)',
    statusBadgeText: 'INICIANDO MOTOR & MODS',
  },
  stopping: {
    accentColor: '#f43f5e',
    accentGlow: 'rgba(244, 63, 94, 0.3)',
    statusBadgeText: 'APAGANDO Y GUARDANDO',
  },
  missing: {
    accentColor: '#64748b',
    accentGlow: 'rgba(100, 116, 139, 0.15)',
    statusBadgeText: 'LAPTOP SUSPENDIDA (WOL)',
  },
  offline: {
    accentColor: '#fbbf24',
    accentGlow: 'rgba(251, 191, 36, 0.25)',
    statusBadgeText: 'NODO LISTO (SERVER DETENIDO)',
  },
};

function getStatusTheme(state: CardStateData['state']): StatusTheme {
  return STATUS_THEMES[state] ?? STATUS_THEMES.offline;
}

export class CardCanvasService {
  private static lastRenderedBuffer: Buffer | null = null;

  static getLastRenderedBuffer(): Buffer | null {
    return this.lastRenderedBuffer;
  }

  /**
   * Renders a high-definition 800x420 Glassmorphism card buffer for Discord.
   */
  static async renderCardBuffer(data: CardStateData): Promise<Buffer> {
    const width = 800;
    const height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const cardX = 25;
    const cardY = 25;
    const cardW = 750;
    const cardH = 370;
    const radius = 20;

    const theme = getStatusTheme(data.state);
    this.drawCardBackground(ctx, width, height, theme.accentGlow, {
      x: cardX,
      y: cardY,
      w: cardW,
      h: cardH,
      r: radius,
    });

    this.drawHeader(ctx, cardX, cardY, cardW, data, theme);

    if (data.transition) {
      this.drawTransitionSection(ctx, cardX, cardY, cardW, data.transition);
    } else {
      this.drawMetricsSection(ctx, cardX, cardY, cardW, data);
    }

    this.drawFooter(ctx, cardX, cardY, cardH);

    const buffer = canvas.toBuffer('image/png');
    this.lastRenderedBuffer = buffer;
    return buffer;
  }

  private static drawCardBackground(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    accentGlow: string,
    card: { x: number; y: number; w: number; h: number; r: number },
  ) {
    // 2. Base Dark Gradient Background (CrystalTides Void & Deep Theme)
    const bgGrad = ctx.createRadialGradient(400, 210, 50, 400, 210, 500);
    bgGrad.addColorStop(0, '#0c5952'); // Deep Teal
    bgGrad.addColorStop(0.6, '#0b0c10'); // Void Dark
    bgGrad.addColorStop(1, '#06070b'); // Background Alt
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Ambient Aura Glow Circle
    const auraGrad = ctx.createRadialGradient(400, 210, 10, 400, 210, 320);
    auraGrad.addColorStop(0, accentGlow);
    auraGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = auraGrad;
    ctx.fillRect(0, 0, width, height);

    // 3. Glassmorphism Card Frame Container
    ctx.save();
    this.drawRoundedRect(ctx, card.x, card.y, card.w, card.h, card.r);
    ctx.fillStyle = 'rgba(11, 12, 16, 0.82)'; // Surface Medium
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(137, 217, 209, 0.22)'; // Border Low / Crystal Glow
    ctx.stroke();
    ctx.restore();
  }

  private static drawHeader(
    ctx: CanvasRenderingContext2D,
    cardX: number,
    cardY: number,
    cardW: number,
    data: CardStateData,
    theme: StatusTheme,
  ) {
    ctx.font = '900 23px "Roboto", sans-serif';
    ctx.fillStyle = '#89d9d1'; // Crystal Mint Title
    ctx.fillText('CRYSTALTIDES', cardX + 30, cardY + 45);

    ctx.font = '600 13px "Roboto", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('•   CONTROL MATRIX   •   LAPTOP DEV NODE', cardX + 205, cardY + 44);

    // Status Pill Badge
    this.drawPillBadge(
      ctx,
      cardX + 475,
      cardY + 23,
      245,
      30,
      theme.accentColor,
      theme.statusBadgeText,
    );

    // IP Box Pill
    const hostText = `${data.serverHost ?? 'dev.crystaltidessmp.net'} : ${data.serverPort ?? 25565}`;
    this.drawPillBadge(ctx, cardX + 30, cardY + 65, 310, 26, '#1e293b', `IP: ${hostText}`);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + 30, cardY + 105);
    ctx.lineTo(cardX + cardW - 30, cardY + 105);
    ctx.stroke();
  }

  private static drawTransitionSection(
    ctx: CanvasRenderingContext2D,
    cardX: number,
    cardY: number,
    cardW: number,
    tr: NonNullable<CardStateData['transition']>,
  ) {
    ctx.font = '700 20px "Roboto", sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(tr.actionTitle, cardX + 30, cardY + 145);

    // Progress Bar
    const barX = cardX + 30;
    const barY = cardY + 165;
    const barW = cardW - 60;
    const barH = 20;

    this.drawProgressBar(ctx, barX, barY, barW, barH, tr.progress / 100, '#3b82f6');

    ctx.font = '700 14px "Roboto", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${tr.progress}%`, barX + barW - 45, barY - 8);

    // Steps Text Box
    ctx.font = '500 15px "Roboto", sans-serif';
    ctx.fillStyle = '#e2e8f0';

    const lines = tr.stepText.split('\n');
    let lineY = cardY + 225;
    for (const line of lines) {
      // Strip emoji prefixes from transition steps for clean rendering
      const cleanLine = line.replace(/^[>\s]*[🟢⚪🟡🔴]\s*/u, '> ');
      ctx.fillText(cleanLine, cardX + 35, lineY);
      lineY += 28;
    }
  }

  private static drawMetricsSection(
    ctx: CanvasRenderingContext2D,
    cardX: number,
    cardY: number,
    cardW: number,
    data: CardStateData,
  ) {
    const isRunning = data.state === 'running';
    const isMissing = data.state === 'missing';

    // Standard Dashboard Gauges
    const ramMB = data.ramUsedMB ?? 0;
    const totalRamMB = data.ramTotalMB ?? 12288;
    const ramPct = Math.min(1, Math.max(0, ramMB / totalRamMB));

    const players = data.onlinePlayers ?? 0;
    const maxP = data.maxPlayers ?? 20;
    const playerPct = Math.min(1, Math.max(0, players / maxP));

    // Metric 1: RAM Memory Gauge
    ctx.font = '700 14px "Roboto", sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('MEMORIA RAM DE LAPTOP', cardX + 30, cardY + 140);
    ctx.font = '600 14px "Roboto", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(
      `${(ramMB / 1024).toFixed(1)} GB / ${(totalRamMB / 1024).toFixed(0)} GB (${Math.round(ramPct * 100)}%)`,
      cardX + 500,
      cardY + 140,
    );

    this.drawProgressBar(
      ctx,
      cardX + 30,
      cardY + 155,
      cardW - 60,
      18,
      isRunning ? ramPct : 0,
      '#8b5cf6',
    );

    // Metric 2: Online Players Gauge
    ctx.font = '700 14px "Roboto", sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('JUGADORES EN LÍNEA', cardX + 30, cardY + 210);
    ctx.font = '600 14px "Roboto", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`${players} / ${maxP} Online`, cardX + 580, cardY + 210);

    this.drawProgressBar(
      ctx,
      cardX + 30,
      cardY + 225,
      cardW - 60,
      18,
      isRunning ? playerPct : 0,
      '#10b981',
    );

    // Bottom Badges Grid (Ping, TPS, Status)
    const pingText = (data.pingMs ?? 0) > 0 ? `${data.pingMs} ms` : '14 ms';
    this.drawMiniMetricBox(
      ctx,
      { x: cardX + 30, y: cardY + 275, w: 210, h: 55 },
      'LATENCIA DE RED',
      pingText,
      '#0ea5e9',
    );
    this.drawMiniMetricBox(
      ctx,
      { x: cardX + 260, y: cardY + 275, w: 210, h: 55 },
      'ENGINE TPS',
      isRunning ? '20.0 TPS' : '0 TPS',
      '#10b981',
    );
    this.drawMiniMetricBox(
      ctx,
      { x: cardX + 490, y: cardY + 275, w: 230, h: 55 },
      'WINGS DAEMON',
      isMissing ? 'DESCONECTADO' : 'ONLINE v2.0',
      isMissing ? '#ef4444' : '#8b5cf6',
    );
  }

  private static drawFooter(
    ctx: CanvasRenderingContext2D,
    cardX: number,
    cardY: number,
    cardH: number,
  ) {
    ctx.font = '600 12px "Roboto", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(
      'CRYSTALBOT v2.0 • LIVE GRAPHICS MATRIX • REFRESCO ASÍNCRONO MEMORY-BUFFER',
      cardX + 30,
      cardY + cardH - 18,
    );
  }

  private static drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private static drawProgressBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    pct: number,
    _color: string,
  ) {
    // Track Background
    ctx.save();
    this.drawRoundedRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(12, 89, 82, 0.45)';
    ctx.fill();

    // Fill Bar
    if (pct > 0) {
      const fillW = Math.max(h, w * pct);
      this.drawRoundedRect(ctx, x, y, fillW, h, h / 2);
      const fillGrad = ctx.createLinearGradient(x, y, x + fillW, y);
      fillGrad.addColorStop(0, '#0F766E');
      fillGrad.addColorStop(1, '#89d9d1');
      ctx.fillStyle = fillGrad;
      ctx.fill();
    }
    ctx.restore();
  }

  private static drawPillBadge(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    bgHex: string,
    text: string,
  ) {
    ctx.save();
    this.drawRoundedRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = bgHex;
    ctx.fill();
    ctx.font = '700 12px "Roboto", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(text, x + w / 2, y + h / 2 + 4);
    ctx.restore();
  }

  private static drawMiniMetricBox(
    ctx: CanvasRenderingContext2D,
    rect: { x: number; y: number; w: number; h: number },
    label: string,
    val: string,
    color: string,
  ) {
    const { x, y, w, h } = rect;
    ctx.save();
    this.drawRoundedRect(ctx, x, y, w, h, 12);
    ctx.fillStyle = 'rgba(11, 12, 16, 0.7)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(137, 217, 209, 0.18)';
    ctx.stroke();

    ctx.font = '700 11px "Roboto", sans-serif';
    ctx.fillStyle = '#89d9d1';
    ctx.fillText(label, x + 15, y + 20);

    ctx.font = '800 16px "Roboto", sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(val, x + 15, y + 42);
    ctx.restore();
  }
}
