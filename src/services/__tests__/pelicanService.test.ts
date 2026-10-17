import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('PelicanService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('sendPowerAction retorna false si falta la API Key o el Server ID', async () => {
    delete process.env.PELICAN_API_KEY;
    delete process.env.PELICAN_SERVER_ID;
    const { PelicanService } = await import('../pelicanService');

    const result = await PelicanService.sendPowerAction('start');
    expect(result).toBe(false);
  });

  it('sendPowerAction envía la señal con éxito y retorna true ante 204 No Content', async () => {
    process.env.PELICAN_API_KEY = 'test-pelican-key';
    process.env.PELICAN_SERVER_ID = 'srv-1234';
    process.env.PELICAN_INTERNAL_URL = 'http://panel-internal';
    process.env.PELICAN_URL = 'https://panel-external';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { PelicanService } = await import('../pelicanService');
    const result = await PelicanService.sendPowerAction('restart');

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/client/servers/srv-1234/power'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ signal: 'restart' }),
      }),
    );
  });

  it('sendPowerAction retorna false si la API responde con código distinto a 204', async () => {
    process.env.PELICAN_API_KEY = 'test-pelican-key';
    process.env.PELICAN_SERVER_ID = 'srv-1234';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { PelicanService } = await import('../pelicanService');
    const result = await PelicanService.sendPowerAction('stop');
    expect(result).toBe(false);
  });

  it('sendPowerAction retorna false ante fallo de red o excepción', async () => {
    process.env.PELICAN_API_KEY = 'test-pelican-key';
    process.env.PELICAN_SERVER_ID = 'srv-1234';

    const fetchMock = vi.fn().mockRejectedValue(new Error('Network unreachable'));
    vi.stubGlobal('fetch', fetchMock);

    const { PelicanService } = await import('../pelicanService');
    const result = await PelicanService.sendPowerAction('kill');
    expect(result).toBe(false);
  });

  it('getServerStatus retorna null si faltan credenciales', async () => {
    delete process.env.PELICAN_API_KEY;
    delete process.env.PELICAN_SERVER_ID;
    const { PelicanService } = await import('../pelicanService');

    const status = await PelicanService.getServerStatus();
    expect(status).toBeNull();
  });

  it('getServerStatus obtiene las métricas y estado del servidor correctamente', async () => {
    process.env.PELICAN_API_KEY = 'test-pelican-key';
    process.env.PELICAN_SERVER_ID = 'srv-1234';

    const mockResponse = {
      attributes: {
        current_state: 'running',
        resources: {
          cpu_absolute: 25.5,
          memory_bytes: 4294967296,
          disk_bytes: 10737418240,
        },
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { PelicanService } = await import('../pelicanService');
    const status = await PelicanService.getServerStatus();

    expect(status).toEqual({
      state: 'running',
      utilization: {
        cpu_absolute: 25.5,
        memory_bytes: 4294967296,
        disk_bytes: 10737418240,
      },
    });
  });

  it('getServerStatus retorna null si ocurre un error de deserialización o de red', async () => {
    process.env.PELICAN_API_KEY = 'test-pelican-key';
    process.env.PELICAN_SERVER_ID = 'srv-1234';

    const fetchMock = vi.fn().mockRejectedValue(new Error('Gateway timeout'));
    vi.stubGlobal('fetch', fetchMock);

    const { PelicanService } = await import('../pelicanService');
    const status = await PelicanService.getServerStatus();
    expect(status).toBeNull();
  });
});
