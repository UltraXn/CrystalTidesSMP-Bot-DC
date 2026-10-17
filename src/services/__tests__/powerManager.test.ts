import { describe, it, expect, vi } from 'vitest';
import {
  makeAsciiBar,
  generateTransitionAscii,
  generateStandardAscii,
  generateEmbedAsciiMatrix,
  getStatusDisplay,
  getStepBullet,
  buildWolStepText,
  buildPelicanStartStepText,
  buildTransitionStepText,
  buildControlButtons,
  PowerManager,
} from '../powerManager';
import { Logger } from '../logger';

describe('powerManager helper functions', () => {
  it('genera barras ASCII proporcionadas según el porcentaje', () => {
    expect(makeAsciiBar(0, 10)).toBe('░░░░░░░░░░');
    expect(makeAsciiBar(50, 10)).toBe('█████░░░░░');
    expect(makeAsciiBar(100, 10)).toBe('██████████');
    expect(makeAsciiBar(150, 10)).toBe('██████████');
    expect(makeAsciiBar(-10, 10)).toBe('░░░░░░░░░░');
  });

  it('genera matriz de transición ASCII correctamente formateada', () => {
    const ascii = generateTransitionAscii({
      title: 'Iniciando',
      progress: 45,
      stepText: 'Encendiendo máquina',
    });

    expect(ascii).toContain('TRANSICIÓN EN CURSO');
    expect(ascii).toContain('45%');
    expect(ascii).toContain('Encendiendo máquina');
  });

  it('genera matriz estándar ASCII con métricas de RAM y jugadores', () => {
    const runningAscii = generateStandardAscii('running', 4096, 8192, 5, 20, '127.0.0.1');
    expect(runningAscii).toContain('CONTROL MATRIX');
    expect(runningAscii).toContain('127.0.0.1');
    expect(runningAscii).toContain('4.0/8.0GB');
    expect(runningAscii).toContain('5/20 On');

    const offlineAscii = generateStandardAscii('offline', 0, 8192, 0, 20, '127.0.0.1');
    expect(offlineAscii).toContain('CONTROL MATRIX');
    expect(offlineAscii).toContain('░░░░░░░░░░');
  });

  it('selecciona matriz según presencia de transición', () => {
    const withTransition = generateEmbedAsciiMatrix('starting', 1024, 8192, 0, 20, '127.0.0.1', {
      title: 'WOL',
      progress: 25,
      stepText: 'Paso 1',
    });
    expect(withTransition).toContain('TRANSICIÓN EN CURSO');

    const withoutTransition = generateEmbedAsciiMatrix(
      'running',
      1024,
      8192,
      2,
      20,
      '127.0.0.1',
      null,
    );
    expect(withoutTransition).toContain('CONTROL MATRIX');
  });

  it('resuelve iconos y estados visuales para cada estado del nodo', () => {
    expect(getStatusDisplay('running').icon).toBe('🟢');
    expect(getStatusDisplay('starting').icon).toBe('🔵');
    expect(getStatusDisplay('stopping').icon).toBe('🟡');
    expect(getStatusDisplay('missing').icon).toBe('⚪');
    expect(getStatusDisplay('offline').icon).toBe('🔴');
  });

  it('calcula viñetas de progreso en el flujo Wake-on-LAN', () => {
    expect(getStepBullet(1, 1)).toBe('🟢');
    expect(getStepBullet(0, 1)).toBe('⚪');
    expect(getStepBullet(1, 2, '🟡')).toBe('🟡');

    const step1Text = buildWolStepText(1);
    expect(step1Text).toContain('Paso 1/4: Magic Packet');
    expect(step1Text).toContain('Paso 2/4:');
  });

  it('construye textos de pasos para inicio en Pelican y transiciones de apagado', () => {
    const pelicanText = buildPelicanStartStepText(2);
    expect(pelicanText).toContain('Paso 1/4: Petición enviada');
    expect(pelicanText).toContain('Paso 2/4: Asignando 12 GB RAM');

    const wolTransition = buildTransitionStepText('wol_pc', 1);
    expect(wolTransition).toContain('Magic Packet');

    const pelicanTransition = buildTransitionStepText('pelican_start', 3);
    expect(pelicanTransition).toContain('mods NeoForge');

    const stopTransition = buildTransitionStepText('pelican_stop', 1);
    expect(stopTransition).toContain('Guardando mapa');
  });

  it('construye botones de control según el estado de la máquina', () => {
    const [row1Offline, row2Offline] = buildControlButtons('offline', null);
    expect(row1Offline.components.length).toBe(2);
    expect(row2Offline.components.length).toBe(2);

    const [row1Missing] = buildControlButtons('missing', null);
    expect(row1Missing.components[0].data).toBeDefined();

    const [row1Running, row2Running] = buildControlButtons('running', null);
    expect(row1Running.components.length).toBe(2);
    expect(row2Running.components.length).toBe(2);

    const [row1Active] = buildControlButtons('starting', 'pelican_start');
    expect(row1Active.components[1].data).toBeDefined();
  });
});

describe('Logger service', () => {
  it('registra mensajes sin lanzar excepciones en consola', async () => {
    await expect(Logger.log('Test Title', 'Test message', 'info')).resolves.not.toThrow();
    await expect(Logger.log('Warn Title', 'Warn message', 'warn')).resolves.not.toThrow();
    await expect(Logger.log('Error Title', 'Error message', 'error')).resolves.not.toThrow();
    await expect(Logger.log('Success Title', 'Success message', 'success')).resolves.not.toThrow();
    await expect(Logger.log('Action Title', 'Action message', 'action')).resolves.not.toThrow();
  });
});

describe('PowerManager control message synchronization', () => {
  it('sincroniza embed de control editando el mensaje con Canvas', async () => {
    const { PowerManager } = await import('../powerManager');
    const { EmbedBuilder } = await import('discord.js');

    const mockMsg = {
      embeds: [{ image: { url: 'https://test.url/img.png' } }],
      edit: vi.fn().mockResolvedValue({}),
    } as unknown as import('discord.js').Message;

    const embed = new EmbedBuilder().setTitle('Test');
    const [row1, row2] = buildControlButtons('running', null);

    // Primer render (shouldUploadCanvas = true)
    await PowerManager.syncControlMessage(
      mockMsg,
      embed,
      [row1, row2],
      { state: 'running' },
      'running_none_0',
    );
    expect(mockMsg.edit).toHaveBeenCalled();

    // Segundo render con mismo stateKey dentro de la ventana de 120s (shouldUploadCanvas = false)
    await PowerManager.syncControlMessage(
      mockMsg,
      embed,
      [row1, row2],
      { state: 'running' },
      'running_none_0',
    );
    expect(mockMsg.edit).toHaveBeenCalledTimes(2);
  });

  it('evalúa auto shutdown en estados no activos sin fallar', async () => {
    const { PowerManager } = await import('../powerManager');
    await expect(PowerManager.evaluateAutoShutdown('offline')).resolves.not.toThrow();
    await expect(PowerManager.evaluateAutoShutdown('stopped')).resolves.not.toThrow();
  });

  it('actualiza el embed de control completo invocando updateControlEmbed', async () => {
    const { PowerManager } = await import('../powerManager');
    const mockMsg = {
      embeds: [{ image: { url: 'https://test.url/img.png' } }],
      edit: vi.fn().mockResolvedValue({}),
    } as unknown as import('discord.js').Message;

    const findSpy = vi.spyOn(PowerManager, 'findControlMessage').mockResolvedValue(mockMsg);
    await PowerManager.updateControlEmbed();
    expect(mockMsg.edit).toHaveBeenCalled();
    findSpy.mockRestore();
  });

  it('maneja fallos en render de Canvas usando fallback de embed sin imagen dinámica', async () => {
    const { PowerManager } = await import('../powerManager');
    const { EmbedBuilder } = await import('discord.js');
    const { CardCanvasService } = await import('../cardCanvasService');

    const mockMsg = {
      embeds: [{ image: { url: 'https://test.url/img.png' } }],
      edit: vi.fn().mockResolvedValue({}),
    } as unknown as import('discord.js').Message;

    const embed = new EmbedBuilder().setTitle('Test Fallback');
    const [row1, row2] = buildControlButtons('running', null);

    vi.spyOn(CardCanvasService, 'renderCardBuffer').mockRejectedValueOnce(
      new Error('Canvas failure simulation'),
    );

    await PowerManager.syncControlMessage(
      mockMsg,
      embed,
      [row1, row2],
      { state: 'running' },
      'unique_state_force_render_' + Date.now(),
    );

    expect(mockMsg.edit).toHaveBeenCalledWith({ embeds: [embed], components: [row1, row2] });
  });

  it('resuelve findControlMessage mediante caché o escaneo de guilds', async () => {
    const { PowerManager } = await import('../powerManager');

    const mockMsg = {
      id: 'msg-999',
      channelId: 'channel-999',
    } as unknown as import('discord.js').Message;

    // Caso 1: Cache hit
    const fetchCachedSpy = vi
      .spyOn(PowerManager as any, 'fetchCachedControlMessage')
      .mockResolvedValueOnce(mockMsg);
    const foundCached = await PowerManager.findControlMessage();
    expect(foundCached).toBe(mockMsg);
    expect(fetchCachedSpy).toHaveBeenCalled();

    // Caso 2: Cache miss y scan guild hit
    vi.spyOn(PowerManager as any, 'fetchCachedControlMessage').mockResolvedValueOnce(null);
    const mockGuild = { id: 'guild-1' };
    (PowerManager as any).client = {
      guilds: {
        cache: new Map([['guild-1', mockGuild]]),
      },
    };
    vi.spyOn(PowerManager as any, 'scanGuildForControlMessage').mockResolvedValueOnce(mockMsg);

    const foundScanned = await PowerManager.findControlMessage();
    expect(foundScanned).toBe(mockMsg);

    // Caso 3: Cache miss y scan guild miss
    vi.spyOn(PowerManager as any, 'fetchCachedControlMessage').mockResolvedValueOnce(null);
    vi.spyOn(PowerManager as any, 'scanGuildForControlMessage').mockResolvedValueOnce(null);
    const foundNone = await PowerManager.findControlMessage();
    expect(foundNone).toBeNull();
  });

  it('procesa updateControlEmbed con transición activa configurada', async () => {
    const { PowerManager } = await import('../powerManager');
    const mockMsg = {
      embeds: [{ image: { url: 'https://test.url/img.png' } }],
      edit: vi.fn().mockResolvedValue({}),
    } as unknown as import('discord.js').Message;

    const findSpy = vi.spyOn(PowerManager, 'findControlMessage').mockResolvedValue(mockMsg);
    PowerManager.triggerActionTransition('pelican_start');

    await PowerManager.updateControlEmbed();
    expect(mockMsg.edit).toHaveBeenCalled();
    findSpy.mockRestore();
  });

  it('evalúa auto shutdown activo cuando el servidor está running y hay ping', async () => {
    const { PowerManager } = await import('../powerManager');
    const { MinecraftService } = await import('../minecraftService');

    (PowerManager as any).AUTO_SHUTDOWN_ENABLED = true;
    (PowerManager as any).laptopWasWoken = true;

    // Con jugadores activos
    vi.spyOn(MinecraftService, 'pingServer').mockResolvedValueOnce({
      online: true,
      latency: 20,
      players: 2,
      max: 20,
    });
    await expect(PowerManager.evaluateAutoShutdown('running')).resolves.not.toThrow();

    // Servidor inaccesible durante countdown
    (PowerManager as any).countdownActive = true;
    vi.spyOn(MinecraftService, 'pingServer').mockResolvedValueOnce(null);
    await PowerManager.evaluateAutoShutdown('running');
    expect((PowerManager as any).countdownActive).toBe(false);
  });

  it('ejecuta secuencia de apagado cuando el contador de inactividad llega a cero', async () => {
    const { PowerManager } = await import('../powerManager');
    const { PelicanService } = await import('../pelicanService');

    vi.spyOn(PelicanService, 'sendPowerAction').mockResolvedValue('ok' as any);
    vi.spyOn(PowerManager as any, 'waitForServerOffline').mockResolvedValue(undefined);
    vi.spyOn(PowerManager as any, 'sendPoweroffSsh').mockResolvedValue(undefined);

    (PowerManager as any).countdownActive = true;
    (PowerManager as any).countdownSecondsRemaining = 10;

    await (PowerManager as any).handleCountdownRunning(0);

    expect((PowerManager as any).countdownActive).toBe(false);
    expect(PelicanService.sendPowerAction).toHaveBeenCalledWith('stop');
  });

  it('procesa transiciones visuales completas para wol_pc y stop/restart', async () => {
    vi.useFakeTimers();
    const updateSpy = vi.spyOn(PowerManager, 'updateControlEmbed').mockResolvedValue();

    await PowerManager.triggerActionTransition('wol_pc');
    expect(updateSpy).toHaveBeenCalled();

    vi.advanceTimersByTime(3600);
    expect((PowerManager as any).activeTransition?.step).toBe(2);

    vi.advanceTimersByTime(4000);
    expect((PowerManager as any).activeTransition?.step).toBe(3);

    vi.advanceTimersByTime(4000);
    expect((PowerManager as any).activeTransition).toBeNull();

    await PowerManager.triggerActionTransition('pelican_restart');
    expect((PowerManager as any).activeTransition?.action).toBe('pelican_restart');

    vi.advanceTimersByTime(6100);
    expect((PowerManager as any).activeTransition).toBeNull();

    vi.useRealTimers();
  });

  it('actualiza el estado de la Laptop y emite logs correspondientes', () => {
    (PowerManager as any).laptopWasWoken = false;
    (PowerManager as any).updateLaptopState('running');
    expect((PowerManager as any).laptopWasWoken).toBe(true);

    (PowerManager as any).updateLaptopState('offline');
    expect((PowerManager as any).laptopWasWoken).toBe(false);
  });

  it('editMessageWithCanvasNative retorna false si falta el DISCORD_TOKEN', async () => {
    const originalToken = process.env.DISCORD_TOKEN;
    delete process.env.DISCORD_TOKEN;

    const res = await (PowerManager as any).editMessageWithCanvasNative(
      'ch-1',
      'msg-1',
      { toJSON: () => ({}) },
      [],
      Buffer.from('dummy-image'),
    );
    expect(res).toBe(false);
    process.env.DISCORD_TOKEN = originalToken;
  });

  it('editMessageWithCanvasNative realiza petición PATCH con FormData nativo', async () => {
    const originalToken = process.env.DISCORD_TOKEN;
    process.env.DISCORD_TOKEN = 'bot-token-xyz';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await (PowerManager as any).editMessageWithCanvasNative(
      'ch-100',
      'msg-200',
      { toJSON: () => ({ title: 'Test Embed' }) },
      [],
      Buffer.from('fake-png-content'),
    );

    expect(res).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/channels/ch-100/messages/msg-200'),
      expect.objectContaining({
        method: 'PATCH',
        headers: { Authorization: 'Bot bot-token-xyz' },
      }),
    );

    process.env.DISCORD_TOKEN = originalToken;
  });
});
