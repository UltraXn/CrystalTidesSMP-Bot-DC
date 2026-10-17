import { describe, it, expect, vi } from 'vitest';
import { watchGameLogs, initGameLogWatcher } from '../gameLogWatcher';

describe('GameLogWatcher', () => {
  it('ejecuta initGameLogWatcher registrando el aviso de servicio deshabilitado', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    initGameLogWatcher();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('DISABLED'));
    consoleSpy.mockRestore();
  });

  it('watchGameLogs resuelve limpiamente sin errores', async () => {
    await expect(watchGameLogs()).resolves.toBeUndefined();
  });
});
