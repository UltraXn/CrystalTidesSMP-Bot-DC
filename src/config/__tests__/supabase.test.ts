import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: vi.fn().mockReturnValue({
      from: vi.fn(),
      auth: {},
    }),
  };
});

describe('Supabase Client Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('lanza un error si faltan las variables de entorno de Supabase', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const { supabase } = await import('../supabase');
    expect(() => supabase.from('test')).toThrow('Faltan variables de entorno');
  });

  it('inicializa el cliente Supabase correctamente cuando las variables están presentes', async () => {
    process.env.SUPABASE_URL = 'https://xyz.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';

    const { supabase } = await import('../supabase');
    expect(supabase.from).toBeDefined();
  });
});
