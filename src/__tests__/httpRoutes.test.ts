import { describe, it, expect, vi } from 'vitest';
import type http from 'node:http';
import {
  getCorsHeaders,
  verifyAuthHeader,
  handlePublicRoute,
  handleProtectedPostRoutes,
  handlePresence,
  handleHttpRequest,
} from '../index';
import { CardCanvasService } from '../services/cardCanvasService';

describe('HTTP API Routing & Security Helpers', () => {
  it('resuelve cabeceras CORS dinámicas según whitelist de orígenes', () => {
    const allowedHeaders = getCorsHeaders('http://localhost:3000');
    expect(allowedHeaders['Access-Control-Allow-Origin']).toBe('http://localhost:3000');

    const blockedHeaders = getCorsHeaders('http://untrusted-domain.com');
    expect(blockedHeaders['Access-Control-Allow-Origin']).toBeUndefined();
    expect(blockedHeaders['Content-Type']).toBe('application/json');
  });

  it('verifica cabecera de autenticación Bearer de forma segura en tiempo constante', () => {
    const secret = 'super-secure-token-1234';
    expect(verifyAuthHeader(`Bearer ${secret}`, secret)).toBe(true);
    expect(verifyAuthHeader('Bearer invalid-token', secret)).toBe(false);
    expect(verifyAuthHeader('Basic 123456', secret)).toBe(false);
    expect(verifyAuthHeader(undefined, secret)).toBe(false);
  });

  it('despacha rutas públicas de health y canvas dashboard', async () => {
    const mockRes = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    const healthUrl = new URL('http://localhost:3002/health');
    const handledHealth = handlePublicRoute(mockRes, healthUrl);
    expect(handledHealth).toBe(true);
    expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });

    // Renderizamos una tarjeta en memoria para tener buffer en CardCanvasService
    await CardCanvasService.renderCardBuffer({ state: 'running' });
    const canvasUrl = new URL('http://localhost:3002/canvas/dashboard.png');
    const handledCanvas = handlePublicRoute(mockRes, canvasUrl);
    expect(handledCanvas).toBe(true);
    expect(mockRes.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'Content-Type': 'image/png' }),
    );

    const unknownUrl = new URL('http://localhost:3002/unknown-route');
    const handledUnknown = handlePublicRoute(mockRes, unknownUrl);
    expect(handledUnknown).toBe(false);
  });

  it('filtra y enruta peticiones POST protegidas', () => {
    const mockReqGet = { method: 'GET' } as http.IncomingMessage;
    const mockRes = { writeHead: vi.fn(), end: vi.fn() } as unknown as http.ServerResponse;

    expect(handleProtectedPostRoutes(mockReqGet, mockRes, {}, '/log')).toBe(false);

    const mockReqPost = { method: 'POST', on: vi.fn() } as unknown as http.IncomingMessage;
    expect(handleProtectedPostRoutes(mockReqPost, mockRes, {}, '/unregistered')).toBe(false);
  });

  it('procesa endpoint de log cuando la petición POST contiene payload válido', async () => {
    let onDataCb: (c: string) => void = () => {};
    let onEndCb: () => Promise<void> = async () => {};

    const mockReq = {
      method: 'POST',
      on: (event: string, cb: any) => {
        if (event === 'data') onDataCb = cb;
        if (event === 'end') onEndCb = cb;
        return mockReq;
      },
    } as unknown as http.IncomingMessage;

    const mockRes = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    const handled = handleProtectedPostRoutes(mockReq, mockRes, {}, '/log');
    expect(handled).toBe(true);

    onDataCb(JSON.stringify({ title: 'Alerta', message: 'Reinicio de servidor', level: 'warn' }));
    await onEndCb();

    expect(mockRes.writeHead).toHaveBeenCalledWith(200, {});
    expect(mockRes.end).toHaveBeenCalledWith(JSON.stringify({ success: true }));
  });

  it('procesa endpoint de chat bridge', async () => {
    let onDataCb: (c: string) => void = () => {};
    let onEndCb: () => Promise<void> = async () => {};

    const mockReq = {
      method: 'POST',
      on: (event: string, cb: any) => {
        if (event === 'data') onDataCb = cb;
        if (event === 'end') onEndCb = cb;
        return mockReq;
      },
    } as unknown as http.IncomingMessage;

    const mockRes = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    const handled = handleProtectedPostRoutes(mockReq, mockRes, {}, '/chat/bridge');
    expect(handled).toBe(true);

    onDataCb(JSON.stringify({ username: 'PlayerSteve', message: 'Hola a todos' }));
    await onEndCb();

    expect(mockRes.writeHead).toHaveBeenCalledWith(200, {});
  });

  it('procesa endpoint de notificación de ticket', async () => {
    process.env.DISCORD_TICKET_STAFF_CHANNEL_ID = 'test-ticket-channel-123';
    const { client } = await import('../index');
    const mockChannel = {
      isTextBased: () => true,
      send: vi.fn().mockResolvedValue({}),
    };
    vi.spyOn(client.channels, 'fetch').mockResolvedValue(mockChannel as any);

    let onDataCb: (c: string) => void = () => {};
    let onEndCb: () => Promise<void> = async () => {};

    const mockReq = {
      method: 'POST',
      on: (event: string, cb: any) => {
        if (event === 'data') onDataCb = cb;
        if (event === 'end') onEndCb = cb;
        return mockReq;
      },
    } as unknown as http.IncomingMessage;

    const mockRes = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    const handled = handleProtectedPostRoutes(mockReq, mockRes, {}, '/ticket/notify');
    expect(handled).toBe(true);

    onDataCb(
      JSON.stringify({ ticketId: 105, subject: 'Error de login', user: 'Steve', action: 'Creado' }),
    );
    await onEndCb();

    expect(mockRes.writeHead).toHaveBeenCalledWith(200, {});
    expect(mockChannel.send).toHaveBeenCalled();
  });

  it('procesa consulta de presencia de miembros sin fallar', async () => {
    const mockRes = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    const presenceUrl = new URL('http://localhost:3002/presence?ids=12345,67890');
    await handlePresence(presenceUrl, mockRes, {});

    expect(mockRes.writeHead).toHaveBeenCalledWith(200, {});
    expect(mockRes.end).toHaveBeenCalled();
  });

  it('maneja errores de sintaxis JSON en endpoints POST', async () => {
    let onDataCb: (c: string) => void = () => {};
    let onEndCb: () => Promise<void> = async () => {};

    const mockReq = {
      method: 'POST',
      on: (event: string, cb: any) => {
        if (event === 'data') onDataCb = cb;
        if (event === 'end') onEndCb = cb;
        return mockReq;
      },
    } as unknown as http.IncomingMessage;

    const mockRes = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    handleProtectedPostRoutes(mockReq, mockRes, {}, '/log');
    onDataCb('{ invalid json');
    await onEndCb();

    expect(mockRes.writeHead).toHaveBeenCalledWith(400, {});
    expect(mockRes.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Bad Request' }));
  });

  describe('handleHttpRequest integration router', () => {
    it('despacha preflight OPTIONS con origen permitido (204) o no permitido (403)', () => {
      const allowedReq = {
        method: 'OPTIONS',
        url: '/presence',
        headers: { host: 'localhost:3002', origin: 'http://localhost:3000' },
      } as unknown as http.IncomingMessage;
      const allowedRes = { writeHead: vi.fn(), end: vi.fn() } as unknown as http.ServerResponse;

      handleHttpRequest(allowedReq, allowedRes);
      expect(allowedRes.writeHead).toHaveBeenCalledWith(204, expect.any(Object));
      expect(allowedRes.end).toHaveBeenCalled();

      const blockedReq = {
        method: 'OPTIONS',
        url: '/presence',
        headers: { host: 'localhost:3002', origin: 'http://evil.com' },
      } as unknown as http.IncomingMessage;
      const blockedRes = { writeHead: vi.fn(), end: vi.fn() } as unknown as http.ServerResponse;

      handleHttpRequest(blockedReq, blockedRes);
      expect(blockedRes.writeHead).toHaveBeenCalledWith(403, expect.any(Object));
      expect(blockedRes.end).toHaveBeenCalled();
    });

    it('responde 500 si BOT_API_KEY no está configurado en el entorno', () => {
      const origKey = process.env.BOT_API_KEY;
      delete process.env.BOT_API_KEY;

      const req = {
        method: 'GET',
        url: '/presence',
        headers: { host: 'localhost:3002' },
      } as unknown as http.IncomingMessage;
      const res = { writeHead: vi.fn(), end: vi.fn() } as unknown as http.ServerResponse;

      handleHttpRequest(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(500, expect.any(Object));
      expect(res.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Server Configuration Error' }));

      process.env.BOT_API_KEY = origKey;
    });

    it('responde 401 si la autenticación Bearer es inválida o ausente', () => {
      process.env.BOT_API_KEY = 'test-secret-key';
      const req = {
        method: 'GET',
        url: '/presence',
        headers: { host: 'localhost:3002', authorization: 'Bearer wrong-key' },
      } as unknown as http.IncomingMessage;
      const res = { writeHead: vi.fn(), end: vi.fn() } as unknown as http.ServerResponse;

      handleHttpRequest(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(401, expect.any(Object));
      expect(res.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Unauthorized' }));
    });

    it('responde 200 para /health público sin requerir API key', () => {
      const req = {
        method: 'GET',
        url: '/health',
        headers: { host: 'localhost:3002' },
      } as unknown as http.IncomingMessage;
      const res = { writeHead: vi.fn(), end: vi.fn() } as unknown as http.ServerResponse;

      handleHttpRequest(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
    });

    it('enruta /presence con autenticación válida', async () => {
      process.env.BOT_API_KEY = 'test-secret-key';
      const req = {
        method: 'GET',
        url: '/presence',
        headers: { host: 'localhost:3002', authorization: 'Bearer test-secret-key' },
      } as unknown as http.IncomingMessage;
      const res = { writeHead: vi.fn(), end: vi.fn() } as unknown as http.ServerResponse;

      handleHttpRequest(req, res);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    });

    it('responde 404 si la ruta solicitada no existe', () => {
      process.env.BOT_API_KEY = 'test-secret-key';
      const req = {
        method: 'GET',
        url: '/unknown-route',
        headers: { host: 'localhost:3002', authorization: 'Bearer test-secret-key' },
      } as unknown as http.IncomingMessage;
      const res = { writeHead: vi.fn(), end: vi.fn() } as unknown as http.ServerResponse;

      handleHttpRequest(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
      expect(res.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Not Found' }));
    });

    it('enruta peticiones POST protegidas como /log con autenticación válida', () => {
      process.env.BOT_API_KEY = 'test-secret-key';
      const req = {
        method: 'POST',
        url: '/log',
        headers: { host: 'localhost:3002', authorization: 'Bearer test-secret-key' },
        on: vi.fn(),
      } as unknown as http.IncomingMessage;
      const res = { writeHead: vi.fn(), end: vi.fn() } as unknown as http.ServerResponse;

      handleHttpRequest(req, res);
      expect(req.on).toHaveBeenCalledWith('data', expect.any(Function));
      expect(req.on).toHaveBeenCalledWith('end', expect.any(Function));
    });
  });
});
