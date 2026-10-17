import net from 'net';

export class MinecraftService {
  /**
   * Pings a Minecraft server to get its status and player counts.
   */
  static async pingServer(
    host: string,
    port: number,
  ): Promise<{ online: boolean; players: number; max: number } | null> {
    let timer: NodeJS.Timeout | null = null;
    const pingPromise = new Promise<{ online: boolean; players: number; max: number } | null>(
      (resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(2500);

        const cleanUp = () => {
          if (timer) clearTimeout(timer);
          socket.removeAllListeners();
          socket.destroy();
        };

        socket.on('error', () => {
          cleanUp();
          resolve(null);
        });

        socket.on('timeout', () => {
          cleanUp();
          resolve(null);
        });

        socket.connect(port, host, () => {
          // Handshake packet: Packet ID (0x00), Protocol Version (47 for 1.8+), Host length, Host, Port (short), Next State (1)
          const hostBuf = Buffer.from(host, 'utf-8');
          const handshake = Buffer.concat([
            Buffer.from([0x00]), // Packet ID
            Buffer.from([0x2f]), // Protocol Version (47)
            Buffer.from([hostBuf.length]),
            hostBuf,
            Buffer.from([(port >> 8) & 0xff, port & 0xff]),
            Buffer.from([0x01]), // Next State
          ]);

          // Prefix Handshake with its VarInt length
          const handshakePacket = Buffer.concat([this.writeVarInt(handshake.length), handshake]);

          // Status Request packet: Length (1), Packet ID (0x00)
          const requestPacket = Buffer.from([0x01, 0x00]);

          socket.write(Buffer.concat([handshakePacket, requestPacket]));
        });

        let data = Buffer.alloc(0);
        socket.on('data', (chunk: Buffer) => {
          data = Buffer.concat([data, chunk]);

          try {
            let offset = 0;

            // 1. Read packet length
            const [, bytesRead1] = this.readVarInt(data, offset);
            offset += bytesRead1;

            // 2. Read packet ID
            const [packetId, bytesRead2] = this.readVarInt(data, offset);
            offset += bytesRead2;

            if (packetId !== 0x00) {
              cleanUp();
              return resolve(null);
            }

            // 3. Read JSON length
            const [jsonLen, bytesRead3] = this.readVarInt(data, offset);
            offset += bytesRead3;

            if (data.length >= offset + jsonLen) {
              const jsonStr = data.toString('utf-8', offset, offset + jsonLen);
              const res = JSON.parse(jsonStr);
              cleanUp();
              resolve({
                online: true,
                players: res.players.online,
                max: res.players.max,
              });
            }
          } catch {
            // Buffer might be incomplete, wait for more chunks
          }
        });
      },
    );

    const timeoutPromise = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), 2500);
    });

    return Promise.race([pingPromise, timeoutPromise]);
  }

  private static writeVarInt(value: number): Buffer {
    const bytes = [];
    let temp = value;
    while (true) {
      if ((temp & ~0x7f) === 0) {
        bytes.push(temp);
        break;
      }
      bytes.push((temp & 0x7f) | 0x80);
      temp >>>= 7;
    }
    return Buffer.from(bytes);
  }

  private static readVarInt(buffer: Buffer, offset: number): [number, number] {
    let result = 0;
    let numRead = 0;
    let currentOffset = offset;
    let read;

    do {
      if (currentOffset >= buffer.length) {
        throw new Error('Buffer index out of bounds while reading VarInt');
      }
      read = buffer.readUInt8(currentOffset++);
      const value = read & 0x7f;
      result |= value << (7 * numRead);
      numRead++;
      if (numRead > 5) {
        throw new Error('VarInt is too big');
      }
    } while ((read & 0x80) !== 0);

    return [result, currentOffset - offset];
  }
}
