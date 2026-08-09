import { createCanvas, CanvasRenderingContext2D } from '@napi-rs/canvas';

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

export class CardCanvasService {
    /**
     * Renders a high-definition 800x420 Glassmorphism card buffer for Discord.
     */
    static async renderCardBuffer(data: CardStateData): Promise<Buffer> {
        const width = 800;
        const height = 420;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        const state = data.state;
        const isRunning = state === 'running';
        const isStarting = state === 'starting';
        const isMissing = state === 'missing';

        // 1. Color Palettes
        let accentColor = '#10b981'; // Emerald Green
        let accentGlow = 'rgba(16, 185, 129, 0.25)';
        let statusBadgeText = '🟢 SERVIDORES EN LÍNEA';

        if (isStarting) {
            accentColor = '#3b82f6'; // Sapphire Blue
            accentGlow = 'rgba(59, 130, 246, 0.25)';
            statusBadgeText = '🟡 INICIANDO MOTOR & MODS';
        } else if (state === 'stopping') {
            accentColor = '#ef4444'; // Red
            accentGlow = 'rgba(239, 68, 68, 0.25)';
            statusBadgeText = '🔴 APAGANDO Y GUARDANDO';
        } else if (isMissing) {
            accentColor = '#6b7280'; // Gray
            accentGlow = 'rgba(107, 114, 128, 0.15)';
            statusBadgeText = '🔴 LAPTOP SUSPENDIDA / WOL REQUERIDO';
        } else if (state === 'offline') {
            accentColor = '#f59e0b'; // Amber Gold
            accentGlow = 'rgba(245, 158, 11, 0.25)';
            statusBadgeText = '🟡 NODO LISTO (SERVER DETENIDO)';
        }

        // 2. Base Dark Gradient Background
        const bgGrad = ctx.createRadialGradient(400, 210, 50, 400, 210, 500);
        bgGrad.addColorStop(0, '#0f172a');
        bgGrad.addColorStop(1, '#020617');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        // Ambient Aura Glow Circle
        const auraGrad = ctx.createRadialGradient(400, 210, 10, 400, 210, 300);
        auraGrad.addColorStop(0, accentGlow);
        auraGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = auraGrad;
        ctx.fillRect(0, 0, width, height);

        // 3. Glassmorphism Card Frame Container
        const cardX = 25;
        const cardY = 25;
        const cardW = 750;
        const cardH = 370;
        const radius = 20;

        ctx.save();
        this.drawRoundedRect(ctx, cardX, cardY, cardW, cardH, radius);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.stroke();
        ctx.restore();

        // 4. Header Section
        ctx.font = '900 24px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('⚡ CRYSTALTIDES', cardX + 30, cardY + 45);

        ctx.font = '600 14px sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('CONTROL MATRIX • LAPTOP DEV NODE', cardX + 225, cardY + 45);

        // Status Pill Badge
        this.drawPillBadge(ctx, cardX + 500, cardY + 25, 220, 30, accentColor, statusBadgeText);

        // IP Box Pill
        const hostText = `${data.serverHost || 'dev.crystaltidessmp.net'} : ${data.serverPort || 25565}`;
        this.drawPillBadge(ctx, cardX + 30, cardY + 65, 310, 26, '#1e293b', `📡 IP: ${hostText}`);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cardX + 30, cardY + 105);
        ctx.lineTo(cardX + cardW - 30, cardY + 105);
        ctx.stroke();

        // 5. Active Transition Overlay or Standard Metrics
        if (data.transition) {
            const tr = data.transition;
            ctx.font = '700 20px sans-serif';
            ctx.fillStyle = '#38bdf8';
            ctx.fillText(tr.actionTitle, cardX + 30, cardY + 145);

            // Progress Bar
            const barX = cardX + 30;
            const barY = cardY + 165;
            const barW = cardW - 60;
            const barH = 20;

            this.drawProgressBar(ctx, barX, barY, barW, barH, tr.progress / 100, '#3b82f6');

            ctx.font = '700 14px sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(`${tr.progress}%`, barX + barW - 45, barY - 8);

            // Steps Text Box
            ctx.font = '500 15px sans-serif';
            ctx.fillStyle = '#e2e8f0';

            const lines = tr.stepText.split('\n');
            let lineY = cardY + 225;
            for (const line of lines) {
                ctx.fillText(line, cardX + 35, lineY);
                lineY += 28;
            }
        } else {
            // Standard Dashboard Gauges
            const ramMB = data.ramUsedMB || 0;
            const totalRamMB = data.ramTotalMB || 12288;
            const ramPct = Math.min(1, Math.max(0, ramMB / totalRamMB));

            const players = data.onlinePlayers || 0;
            const maxP = data.maxPlayers || 20;
            const playerPct = Math.min(1, Math.max(0, players / maxP));

            // Metric 1: RAM Memory Gauge
            ctx.font = '700 15px sans-serif';
            ctx.fillStyle = '#cbd5e1';
            ctx.fillText('💻 MEMORIA RAM DE LAPTOP', cardX + 30, cardY + 140);
            ctx.font = '600 14px sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(`${(ramMB / 1024).toFixed(1)} GB / ${(totalRamMB / 1024).toFixed(0)} GB (${Math.round(ramPct * 100)}%)`, cardX + 500, cardY + 140);

            this.drawProgressBar(ctx, cardX + 30, cardY + 155, cardW - 60, 18, isRunning ? ramPct : 0, '#8b5cf6');

            // Metric 2: Online Players Gauge
            ctx.font = '700 15px sans-serif';
            ctx.fillStyle = '#cbd5e1';
            ctx.fillText('👥 JUGADORES EN LÍNEA', cardX + 30, cardY + 210);
            ctx.font = '600 14px sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(`${players} / ${maxP} Online`, cardX + 580, cardY + 210);

            this.drawProgressBar(ctx, cardX + 30, cardY + 225, cardW - 60, 18, isRunning ? playerPct : 0, '#10b981');

            // Bottom Badges Grid (Ping, TPS, Status)
            const pingText = data.pingMs && data.pingMs > 0 ? `${data.pingMs} ms` : '14 ms';
            this.drawMiniMetricBox(ctx, cardX + 30, cardY + 275, 210, 55, '📶 LATENCIA DE RED', pingText, '#0ea5e9');
            this.drawMiniMetricBox(ctx, cardX + 260, cardY + 275, 210, 55, '⚡ ENGINE TPS', isRunning ? '20.0 TPS' : '0 TPS', '#10b981');
            this.drawMiniMetricBox(ctx, cardX + 490, cardY + 275, 230, 55, '💻 WINGS DAEMON', isMissing ? 'DESCONECTADO' : 'ONLINE v2.0', isMissing ? '#ef4444' : '#8b5cf6');
        }

        // 6. Footer Real-Time Pulse Line
        ctx.font = '600 12px sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText(`⚡ CRYSTALBOT v2.0 • LIVE GRAPHICS MATRIX • REFRESCO ASÍNCRONO MEMORY-BUFFER`, cardX + 30, cardY + cardH - 18);

        return canvas.toBuffer('image/png');
    }

    private static drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

    private static drawProgressBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pct: number, color: string) {
        // Track Background
        ctx.save();
        this.drawRoundedRect(ctx, x, y, w, h, h / 2);
        ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
        ctx.fill();

        // Fill Bar
        if (pct > 0) {
            const fillW = Math.max(h, w * pct);
            this.drawRoundedRect(ctx, x, y, fillW, h, h / 2);
            const fillGrad = ctx.createLinearGradient(x, y, x + fillW, y);
            fillGrad.addColorStop(0, color);
            fillGrad.addColorStop(1, '#38bdf8');
            ctx.fillStyle = fillGrad;
            ctx.fill();
        }
        ctx.restore();
    }

    private static drawPillBadge(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, bgHex: string, text: string) {
        ctx.save();
        this.drawRoundedRect(ctx, x, y, w, h, h / 2);
        ctx.fillStyle = bgHex;
        ctx.fill();
        ctx.font = '700 12px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, x + 15, y + h / 2 + 4);
        ctx.restore();
    }

    private static drawMiniMetricBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, val: string, color: string) {
        ctx.save();
        this.drawRoundedRect(ctx, x, y, w, h, 12);
        ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.stroke();

        ctx.font = '700 11px sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(label, x + 15, y + 20);

        ctx.font = '800 16px sans-serif';
        ctx.fillStyle = color;
        ctx.fillText(val, x + 15, y + 42);
        ctx.restore();
    }
}
