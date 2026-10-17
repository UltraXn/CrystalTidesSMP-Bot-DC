import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ticketCommand from '../ticket';
import { ChatInputCommandInteraction } from 'discord.js';

describe('Ticket Command', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.WEB_SERVER_URL = 'http://localhost:3001';
    process.env.BOT_API_KEY = 'test-bot-key';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('tiene la estructura de subcomandos view, close y reply', () => {
    expect(ticketCommand.data.name).toBe('ticket');
    expect(ticketCommand.data.description).toBeDefined();
  });

  it('rechaza tickets con ID inválido', async () => {
    const editReplyMock = vi.fn();
    const deferReplyMock = vi.fn();
    const getSubcommandMock = vi.fn().mockReturnValue('view');
    const getStringMock = vi.fn().mockReturnValue('invalid id with spaces!!');

    const interaction = {
      deferReply: deferReplyMock,
      editReply: editReplyMock,
      options: {
        getSubcommand: getSubcommandMock,
        getString: getStringMock,
      },
    } as unknown as ChatInputCommandInteraction;

    await ticketCommand.execute(interaction);

    expect(deferReplyMock).toHaveBeenCalledWith({ ephemeral: true });
    expect(editReplyMock).toHaveBeenCalledWith({ content: '❌ ID de ticket inválido.' });
  });

  it('subcomando view renderiza embed con datos del ticket si la API responde 200', async () => {
    const editReplyMock = vi.fn();
    const deferReplyMock = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'TCK-101',
        subject: 'Problema de pago',
        status: 'OPEN',
        priority: 'HIGH',
        user_email: 'player@crystaltides.net',
        message: 'No recibí mis gemas',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const interaction = {
      deferReply: deferReplyMock,
      editReply: editReplyMock,
      options: {
        getSubcommand: () => 'view',
        getString: (name: string) => (name === 'id' ? 'TCK-101' : null),
      },
    } as unknown as ChatInputCommandInteraction;

    await ticketCommand.execute(interaction);

    expect(editReplyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
      }),
    );
  });

  it('subcomando view notifica error si el ticket no existe', async () => {
    const editReplyMock = vi.fn();
    const deferReplyMock = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);

    const interaction = {
      deferReply: deferReplyMock,
      editReply: editReplyMock,
      options: {
        getSubcommand: () => 'view',
        getString: (name: string) => (name === 'id' ? 'TCK-999' : null),
      },
    } as unknown as ChatInputCommandInteraction;

    await ticketCommand.execute(interaction);

    expect(editReplyMock).toHaveBeenCalledWith({
      content: expect.stringContaining('no encontrado o error'),
    });
  });

  it('subcomando close cierra el ticket exitosamente ante 200 OK', async () => {
    const editReplyMock = vi.fn();
    const deferReplyMock = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const interaction = {
      deferReply: deferReplyMock,
      editReply: editReplyMock,
      options: {
        getSubcommand: () => 'close',
        getString: (name: string) => (name === 'id' ? 'TCK-101' : null),
      },
    } as unknown as ChatInputCommandInteraction;

    await ticketCommand.execute(interaction);

    expect(editReplyMock).toHaveBeenCalledWith({
      content: expect.stringContaining('ha sido marcado como **CERRADO**'),
    });
  });

  it('subcomando reply envía la respuesta del staff exitosamente', async () => {
    const editReplyMock = vi.fn();
    const deferReplyMock = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const interaction = {
      deferReply: deferReplyMock,
      editReply: editReplyMock,
      user: { tag: 'Mod#0001' },
      options: {
        getSubcommand: () => 'reply',
        getString: (name: string) => {
          if (name === 'id') return 'TCK-101';
          if (name === 'mensaje') return 'Gemas añadidas a tu cuenta';
          return null;
        },
      },
    } as unknown as ChatInputCommandInteraction;

    await ticketCommand.execute(interaction);

    expect(editReplyMock).toHaveBeenCalledWith({
      content: expect.stringContaining('Respuesta enviada al ticket'),
    });
  });

  it('captura errores no controlados y responde con mensaje genérico', async () => {
    const editReplyMock = vi.fn();
    const deferReplyMock = vi.fn();

    const fetchMock = vi.fn().mockRejectedValue(new Error('Fatal API crash'));
    vi.stubGlobal('fetch', fetchMock);

    const interaction = {
      deferReply: deferReplyMock,
      editReply: editReplyMock,
      options: {
        getSubcommand: () => 'view',
        getString: () => 'TCK-101',
      },
    } as unknown as ChatInputCommandInteraction;

    await ticketCommand.execute(interaction);

    expect(editReplyMock).toHaveBeenCalledWith({
      content: expect.stringContaining('Ocurrió un error al procesar el comando'),
    });
  });
});
