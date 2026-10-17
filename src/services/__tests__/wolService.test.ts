import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WOLService } from '../wolService';

describe('WOLService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('retorna false si LOCAL_SPY_URL no está configurada', async () => {
    delete process.env.LOCAL_SPY_URL;
    const result = await WOLService.wakePC();
    expect(result).toBe(false);
  });

  it('envía petición POST y retorna true cuando el Local Spy responde ok', async () => {
    process.env.LOCAL_SPY_URL = 'http://localhost:3005/wake';
    process.env.BOT_API_KEY = 'secret-key';
    process.env.TARGET_MAC_ADDRESS = 'aa:bb:cc:dd:ee:ff';

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const result = await WOLService.wakePC();
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3005/wake',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret-key',
        }),
      }),
    );
  });

  it('retorna false si el Local Spy responde con error HTTP (ok = false)', async () => {
    process.env.LOCAL_SPY_URL = 'http://localhost:3005/wake';
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);

    const result = await WOLService.wakePC();
    expect(result).toBe(false);
  });

  it('captura la excepción y retorna false ante fallos de conexión', async () => {
    process.env.LOCAL_SPY_URL = 'http://localhost:3005/wake';
    const fetchMock = vi.fn().mockRejectedValue(new Error('Connection refused'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await WOLService.wakePC();
    expect(result).toBe(false);
  });
});
