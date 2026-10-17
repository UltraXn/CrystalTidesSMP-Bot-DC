import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { MinecraftService } from '../minecraftService';

class MockSocket extends EventEmitter {
  setTimeout = vi.fn();
  connect = vi.fn((_port: number, _host: string, cb: () => void) => {
    setTimeout(cb, 5);
    return this;
  });
  write = vi.fn();
  destroy = vi.fn();
  removeAllListeners = vi.fn(() => super.removeAllListeners());
}

let activeSocket: MockSocket;

vi.mock('net', () => {
  return {
    default: {
      Socket: class {
        constructor() {
          return activeSocket;
        }
      },
    },
  };
});

describe('MinecraftService', () => {
  beforeEach(() => {
    activeSocket = new MockSocket();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retorna null si el socket emite evento de error', async () => {
    activeSocket.connect = vi.fn((_p, _h, _cb) => {
      setTimeout(() => activeSocket.emit('error', new Error('ECONNREFUSED')), 5);
      return activeSocket;
    });

    const res = await MinecraftService.pingServer('127.0.0.1', 25565);
    expect(res).toBeNull();
  });

  it('retorna null si el socket emite evento de timeout', async () => {
    activeSocket.connect = vi.fn((_p, _h, _cb) => {
      setTimeout(() => activeSocket.emit('timeout'), 5);
      return activeSocket;
    });

    const res = await MinecraftService.pingServer('127.0.0.1', 25565);
    expect(res).toBeNull();
  });

  it('procesa el handshake y responde con métricas de jugadores cuando el servidor envía JSON válido', async () => {
    activeSocket.connect = vi.fn((_p, _h, cb) => {
      setTimeout(() => {
        cb();
        // Construir paquete de respuesta Minecraft
        const jsonPayload = JSON.stringify({
          players: { online: 12, max: 50 },
        });
        const jsonBuf = Buffer.from(jsonPayload, 'utf-8');

        // Helper para VarInt
        const writeVarInt = (val: number) => {
          const bytes: number[] = [];
          let temp = val;
          while (true) {
            if ((temp & ~0x7f) === 0) {
              bytes.push(temp);
              break;
            }
            bytes.push((temp & 0x7f) | 0x80);
            temp >>>= 7;
          }
          return Buffer.from(bytes);
        };

        const packetId = writeVarInt(0x00);
        const jsonLen = writeVarInt(jsonBuf.length);
        const packetBody = Buffer.concat([packetId, jsonLen, jsonBuf]);
        const packetLen = writeVarInt(packetBody.length);
        const fullPacket = Buffer.concat([packetLen, packetBody]);

        activeSocket.emit('data', fullPacket);
      }, 5);
      return activeSocket;
    });

    const res = await MinecraftService.pingServer('play.crystaltides.net', 25565);
    expect(res).toEqual({
      online: true,
      players: 12,
      max: 50,
    });
  });

  it('retorna null si el packet ID no coincide con 0x00', async () => {
    activeSocket.connect = vi.fn((_p, _h, cb) => {
      setTimeout(() => {
        cb();
        const packetBody = Buffer.from([0x05, 0x01, 0x02]); // ID inválido 0x05
        const fullPacket = Buffer.concat([Buffer.from([packetBody.length]), packetBody]);
        activeSocket.emit('data', fullPacket);
      }, 5);
      return activeSocket;
    });

    const res = await MinecraftService.pingServer('play.crystaltides.net', 25565);
    expect(res).toBeNull();
  });
});
