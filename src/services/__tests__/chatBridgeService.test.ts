import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { ChatBridgeService } from '../chatBridgeService';

vi.mock('../../config/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  };
});

import { supabase } from '../../config/supabase';

describe('ChatBridgeService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    process.env.DISCORD_CHAT_CHANNEL_ID = 'chat-chan-101';
    process.env.WEB_SERVER_URL = 'http://localhost:3001';
    process.env.BOT_API_KEY = 'secret-key';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('init registra listener y descarta mensajes de bots o canales distintos', async () => {
    const mockClient = new EventEmitter() as any;
    ChatBridgeService.init(mockClient);

    const botMessage = {
      author: { bot: true, id: 'bot-1' },
      channelId: 'chat-chan-101',
    };
    mockClient.emit('messageCreate', botMessage);

    const wrongChannelMsg = {
      author: { bot: false, id: 'user-1' },
      channelId: 'other-channel',
    };
    mockClient.emit('messageCreate', wrongChannelMsg);

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('notifica al usuario y borra mensaje si no tiene cuenta de Minecraft vinculada', async () => {
    vi.useFakeTimers();
    const mockClient = new EventEmitter() as any;
    ChatBridgeService.init(mockClient);

    vi.mocked(supabase.from).mockImplementation(
      () =>
        ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            }),
          }),
        }) as any,
    );

    const replyDeleteMock = vi.fn().mockResolvedValue(undefined);
    const msgDeleteMock = vi.fn().mockResolvedValue(undefined);
    const replyMock = vi.fn().mockResolvedValue({ delete: replyDeleteMock });

    const message = {
      author: { bot: false, id: 'unlinked-user-1' },
      channelId: 'chat-chan-101',
      content: 'Hola servidor!',
      reply: replyMock,
      delete: msgDeleteMock,
    };

    mockClient.emit('messageCreate', message);
    await vi.advanceTimersByTimeAsync(50);

    expect(replyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('No estás verificado'),
      }),
    );

    await vi.advanceTimersByTimeAsync(7000);
    expect(msgDeleteMock).toHaveBeenCalled();
    expect(replyDeleteMock).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('reenvía el mensaje a Minecraft vía queue cuando el usuario está verificado', async () => {
    const mockClient = new EventEmitter() as any;
    ChatBridgeService.init(mockClient);

    vi.mocked(supabase.from).mockImplementation(
      () =>
        ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { minecraft_name: 'SuperSteve' } }),
            }),
          }),
        }) as any,
    );

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const message = {
      author: { bot: false, id: 'linked-user-2', tag: 'Steve#0001' },
      channelId: 'chat-chan-101',
      content: 'Mensaje de prueba "con comillas"',
    };

    mockClient.emit('messageCreate', message);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/bridge/queue',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('SuperSteve'),
      }),
    );
  });

  it('sendMinecraftToDiscord envía webhook si DISCORD_CHAT_WEBHOOK_URL está configurada', async () => {
    process.env.DISCORD_CHAT_WEBHOOK_URL = 'https://discord.com/api/webhooks/123/abc';

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await ChatBridgeService.sendMinecraftToDiscord({} as any, 'Alex', 'Hola desde Minecraft!');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://discord.com/api/webhooks/123/abc',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          username: 'Alex',
          avatar_url: 'https://mc-heads.net/avatar/Alex',
          content: 'Hola desde Minecraft!',
        }),
      }),
    );
  });

  it('sendMinecraftToDiscord envía mensaje al canal si no hay webhook configurada', async () => {
    delete process.env.DISCORD_CHAT_WEBHOOK_URL;
    process.env.DISCORD_CHAT_CHANNEL_ID = 'chan-broadcast';

    const sendMock = vi.fn().mockResolvedValue(undefined);
    const mockClient = {
      channels: {
        fetch: vi.fn().mockResolvedValue({
          isTextBased: () => true,
          send: sendMock,
        }),
      },
    } as any;

    await ChatBridgeService.sendMinecraftToDiscord(mockClient, 'Alex', 'Hola canal!');

    expect(sendMock).toHaveBeenCalledWith('💬 **[MC] <Alex>**: Hola canal!');
  });
});
