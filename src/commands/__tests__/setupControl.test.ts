import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import setupControl from '../setupControl';
import { ChatInputCommandInteraction } from 'discord.js';
import { PowerManager } from '../../services/powerManager';

describe('SetupControl Command', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tiene la metadata correcta y permisos de Administrador', () => {
    expect(setupControl.data.name).toBe('setup-control');
    expect(setupControl.data.description).toBeDefined();
  });

  it('notifica si no se encuentra un canal de texto válido', async () => {
    const editReplyMock = vi.fn();
    const deferReplyMock = vi.fn();

    const interaction = {
      deferReply: deferReplyMock,
      editReply: editReplyMock,
      channel: null,
    } as unknown as ChatInputCommandInteraction;

    await setupControl.execute(interaction);

    expect(deferReplyMock).toHaveBeenCalledWith({ flags: 64 });
    expect(editReplyMock).toHaveBeenCalledWith('No se pudo encontrar un canal de texto válido.');
  });

  it('crea el mensaje de control, registra el ID en PowerManager e inicia el timer de actualización', async () => {
    vi.useFakeTimers();
    const setControlSpy = vi.spyOn(PowerManager, 'setControlMessage').mockImplementation(() => {});
    const updateSpy = vi.spyOn(PowerManager, 'updateControlEmbed').mockResolvedValue();

    const sentMessageMock = {
      id: 'msg-ctrl-123',
      channelId: 'chan-ctrl-456',
    };

    const sendMock = vi.fn().mockResolvedValue(sentMessageMock);
    const editReplyMock = vi.fn();
    const deferReplyMock = vi.fn();

    const interaction = {
      deferReply: deferReplyMock,
      editReply: editReplyMock,
      channel: {
        send: sendMock,
      },
    } as unknown as ChatInputCommandInteraction;

    await setupControl.execute(interaction);

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
        components: expect.any(Array),
      }),
    );
    expect(setControlSpy).toHaveBeenCalledWith('chan-ctrl-456', 'msg-ctrl-123');

    vi.advanceTimersByTime(500);
    expect(updateSpy).toHaveBeenCalled();

    expect(editReplyMock).toHaveBeenCalledWith(
      expect.stringContaining('¡Panel de control persistente creado con éxito'),
    );

    vi.useRealTimers();
  });

  it('maneja errores en la ejecución y edita la respuesta con mensaje de error', async () => {
    const sendMock = vi.fn().mockRejectedValue(new Error('Discord API 50035'));
    const editReplyMock = vi.fn();
    const deferReplyMock = vi.fn();

    const interaction = {
      deferReply: deferReplyMock,
      editReply: editReplyMock,
      channel: {
        send: sendMock,
      },
    } as unknown as ChatInputCommandInteraction;

    await setupControl.execute(interaction);

    expect(editReplyMock).toHaveBeenCalledWith(
      expect.stringContaining('❌ Error al crear el panel de control: Discord API 50035'),
    );
  });
});
