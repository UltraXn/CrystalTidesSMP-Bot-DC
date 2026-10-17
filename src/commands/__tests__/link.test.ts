import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatInputCommandInteraction } from 'discord.js';

vi.mock('../../config/supabase.js', () => {
  const mockFrom = vi.fn();
  return {
    supabase: {
      from: mockFrom,
    },
  };
});

vi.mock('../../services/syncService.js', () => {
  return {
    syncMinecraftRoles: vi.fn().mockResolvedValue(undefined),
  };
});

import { supabase } from '../../config/supabase.js';
import linkCommand from '../link';

describe('Link Command', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tiene la metadata correcta del comando', () => {
    expect(linkCommand.data.name).toBe('link');
    expect(linkCommand.data.description).toBeDefined();
  });

  it('genera un código universal cuando no se pasa el parámetro codigo', async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({
      upsert: upsertMock,
    } as any);

    const replyMock = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      user: {
        id: 'usr-1234',
        tag: 'Player#1234',
        displayAvatarURL: vi.fn().mockReturnValue('https://cdn.discord.com/avatar.png'),
      },
      options: {
        getString: vi.fn().mockReturnValue(null),
      },
      reply: replyMock,
    } as unknown as ChatInputCommandInteraction;

    await linkCommand.execute(interaction);

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'discord',
        source_id: 'usr-1234',
        player_name: 'Player#1234',
      }),
    );
    expect(replyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Tu código de vinculación universal es:'),
        ephemeral: true,
      }),
    );
  });

  it('rechaza códigos con formato inválido', async () => {
    const replyMock = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      options: {
        getString: vi.fn().mockReturnValue('abc!!'),
      },
      reply: replyMock,
    } as unknown as ChatInputCommandInteraction;

    await linkCommand.execute(interaction);

    expect(replyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Formato de código inválido'),
        ephemeral: true,
      }),
    );
  });

  it('informa si el código no existe en la base de datos', async () => {
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    vi.mocked(supabase.from).mockReturnValue({
      select: selectMock,
    } as any);

    const replyMock = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      options: {
        getString: vi.fn().mockReturnValue('ABC123'),
      },
      reply: replyMock,
    } as unknown as ChatInputCommandInteraction;

    await linkCommand.execute(interaction);

    expect(replyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Código inválido o inexistente'),
        ephemeral: true,
      }),
    );
  });

  it('informa si el código ha expirado y lo elimina', async () => {
    const expiredRecord = {
      source: 'minecraft',
      source_id: 'uuid-123',
      player_name: 'Steve',
      expires_at: Date.now() - 100000,
    };

    const deleteMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'universal_links') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [expiredRecord], error: null }),
          }),
          delete: deleteMock,
        } as any;
      }
      return {} as any;
    });

    const replyMock = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      options: {
        getString: vi.fn().mockReturnValue('ABC123'),
      },
      reply: replyMock,
    } as unknown as ChatInputCommandInteraction;

    await linkCommand.execute(interaction);

    expect(deleteMock).toHaveBeenCalled();
    expect(replyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('El código ha expirado'),
        ephemeral: true,
      }),
    );
  });

  it('vincula exitosamente una cuenta con origen minecraft', async () => {
    const validRecord = {
      source: 'minecraft',
      source_id: 'uuid-player-mc',
      player_name: 'AlexMC',
      expires_at: Date.now() + 600000,
    };

    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const deleteMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'universal_links') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [validRecord], error: null }),
          }),
          delete: deleteMock,
        } as any;
      }
      if (table === 'profiles') {
        return {
          update: updateMock,
        } as any;
      }
      return {} as any;
    });

    const replyMock = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      client: {},
      user: {
        id: 'usr-discord-789',
        tag: 'Alex#0001',
      },
      options: {
        getString: vi.fn().mockReturnValue('VAL123'),
      },
      reply: replyMock,
    } as unknown as ChatInputCommandInteraction;

    await linkCommand.execute(interaction);

    expect(updateMock).toHaveBeenCalled();
    expect(deleteMock).toHaveBeenCalled();
    expect(replyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('ha sido vinculada con el jugador **AlexMC**'),
        ephemeral: true,
      }),
    );
  });

  it('vincula exitosamente una cuenta con origen web', async () => {
    const validRecord = {
      source: 'web',
      source_id: 'profile-web-id-999',
      player_name: 'WebUser',
      expires_at: Date.now() + 600000,
    };

    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const deleteMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'universal_links') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [validRecord], error: null }),
          }),
          delete: deleteMock,
        } as any;
      }
      if (table === 'profiles') {
        return {
          update: updateMock,
        } as any;
      }
      return {} as any;
    });

    const replyMock = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      client: {},
      user: {
        id: 'usr-discord-789',
        tag: 'Alex#0001',
      },
      options: {
        getString: vi.fn().mockReturnValue('WEB123'),
      },
      reply: replyMock,
    } as unknown as ChatInputCommandInteraction;

    await linkCommand.execute(interaction);

    expect(updateMock).toHaveBeenCalled();
    expect(replyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('ha sido vinculado a tu perfil web'),
        ephemeral: true,
      }),
    );
  });
});
