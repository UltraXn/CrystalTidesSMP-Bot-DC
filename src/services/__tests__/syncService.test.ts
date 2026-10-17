import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
      auth: {
        admin: {
          listUsers: vi.fn(),
        },
      },
    },
  };
});

import { supabase } from '../../config/supabase';

describe('SyncService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('retorna inmediatamente si falta alguna variable de entorno obligatoria', async () => {
    delete process.env.DISCORD_GUILD_ID;
    delete process.env.DISCORD_ROLE_MINECRAFT_FILTER;
    const { syncMinecraftRoles } = await import('../syncService');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await syncMinecraftRoles({} as any);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Missing configuration'));
  });

  it('sincroniza roles para miembros verificados y no verificados en el servidor', async () => {
    process.env.DISCORD_GUILD_ID = 'guild-main-101';
    process.env.DISCORD_ROLE_MINECRAFT_FILTER = 'role-filter-1';
    process.env.DISCORD_ROLE_VERIFIED = 'role-verified-2';
    process.env.DISCORD_ROLE_UNVERIFIED = 'role-unverified-3';

    const { syncMinecraftRoles } = await import('../syncService');

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'p1',
            minecraft_uuid: 'uuid-steve',
            social_discord: 'discord-steve-id',
            discord_tag: 'Steve#0001',
          },
        ],
        error: null,
      }),
    } as any);

    vi.mocked(supabase.auth.admin.listUsers).mockResolvedValue({
      data: {
        users: [
          {
            id: 'p2',
            identities: [
              {
                id: 'discord-alex-id',
                provider: 'discord',
                identity_data: { full_name: 'Alex#0002' },
              },
            ],
          },
        ],
      },
      error: null,
    } as any);

    const verifiedMember = {
      id: 'discord-steve-id',
      user: { tag: 'Steve#0001', username: 'steve' },
      roles: {
        cache: {
          has: (roleId: string) => roleId === 'role-filter-1' || roleId === 'role-unverified-3',
        },
        add: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    };

    const unverifiedMember = {
      id: 'discord-random-id',
      user: { tag: 'Random#9999', username: 'random' },
      roles: {
        cache: {
          has: (roleId: string) => roleId === 'role-filter-1' || roleId === 'role-verified-2',
        },
        add: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    };

    const membersList = [verifiedMember, unverifiedMember];
    const mockGuild = {
      members: {
        fetch: vi.fn().mockResolvedValue({
          filter: (filterFn: (m: any) => boolean) => {
            const matched = membersList.filter(filterFn);
            return {
              values: () => matched,
              size: matched.length,
            };
          },
        }),
      },
    };

    const mockClient = {
      guilds: {
        fetch: vi.fn().mockResolvedValue(mockGuild),
      },
    } as any;

    await syncMinecraftRoles(mockClient);

    expect(verifiedMember.roles.add).toHaveBeenCalledWith('role-verified-2');
    expect(verifiedMember.roles.remove).toHaveBeenCalledWith('role-unverified-3');

    expect(unverifiedMember.roles.add).toHaveBeenCalledWith('role-unverified-3');
    expect(unverifiedMember.roles.remove).toHaveBeenCalledWith('role-verified-2');
  });
});
