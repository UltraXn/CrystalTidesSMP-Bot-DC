import { describe, it, expect, vi } from 'vitest';
import pingCommand from '../ping';
import { ChatInputCommandInteraction } from 'discord.js';

describe('Ping Command', () => {
  it('tiene la metadata correcta del comando', () => {
    expect(pingCommand.data.name).toBe('ping');
    expect(pingCommand.data.description).toBe('Responde con Pong!');
  });

  it('ejecuta la respuesta Pong con emoji', async () => {
    const replyMock = vi.fn().mockResolvedValue(undefined);
    const mockInteraction = {
      reply: replyMock,
    } as unknown as ChatInputCommandInteraction;

    await pingCommand.execute(mockInteraction);
    expect(replyMock).toHaveBeenCalledWith('Pong! 🏓');
  });
});
