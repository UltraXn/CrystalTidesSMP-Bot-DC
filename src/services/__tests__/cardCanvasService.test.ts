import { describe, it, expect } from 'vitest';
import { CardCanvasService, CardStateData } from '../cardCanvasService';

describe('CardCanvasService', () => {
  it('renderiza buffer de tarjeta para estado running con métricas completas', async () => {
    const data: CardStateData = {
      state: 'running',
      laptopName: 'Legion-5-Pro',
      serverHost: 'play.crystaltides.net',
      serverPort: 25565,
      onlinePlayers: 7,
      maxPlayers: 20,
      ramUsedMB: 3500,
      ramTotalMB: 8192,
      pingMs: 24,
    };

    const buffer = await CardCanvasService.renderCardBuffer(data);
    expect(buffer).toBeDefined();
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('renderiza buffer de tarjeta con sección de transición activa', async () => {
    const data: CardStateData = {
      state: 'starting',
      laptopName: 'Legion-5-Pro',
      transition: {
        actionTitle: 'Encendiendo Servidor Spigot',
        progress: 60,
        step: 3,
        stepText: '> 🟢 Magic Packet enviado\n> 🟡 Booting Windows\n> ⚪ Verificando Docker',
      },
    };

    const buffer = await CardCanvasService.renderCardBuffer(data);
    expect(buffer).toBeDefined();
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('renderiza buffer para estados offline y missing', async () => {
    const offlineBuffer = await CardCanvasService.renderCardBuffer({ state: 'offline' });
    expect(offlineBuffer.length).toBeGreaterThan(1000);

    const missingBuffer = await CardCanvasService.renderCardBuffer({ state: 'missing' });
    expect(missingBuffer.length).toBeGreaterThan(1000);
  });
});
