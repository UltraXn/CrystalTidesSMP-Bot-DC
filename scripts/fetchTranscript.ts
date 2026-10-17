import {
  Client,
  GatewayIntentBits,
  TextChannel,
  NewsChannel,
  Message,
  Collection,
  Snowflake,
} from 'discord.js';
import dotenv from 'dotenv';
import fs from 'node:fs';

dotenv.config();

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !guildId) {
  console.error('Missing DISCORD_TOKEN or DISCORD_GUILD_ID in .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const COMMAND_PREFIXES = ['/', '!', '?', '.', 'c!'];

function isTargetChannel(channelName: string): boolean {
  const normalized = channelName.normalize('NFKD').toLowerCase();
  if (normalized.includes('anuncio')) return false;

  const isGeneral =
    channelName.includes('𝖢𝗁𝖺𝗋𝗅𝖺') ||
    normalized.includes('charla-general') ||
    normalized.includes('general');
  const isMinecraftChill =
    normalized.includes('minecraft-and-chill') ||
    (normalized.includes('minecraft') && normalized.includes('chill'));
  return isGeneral || isMinecraftChill;
}

function formatMessage(msg: Message): string | null {
  const content = msg.content?.trim() || '';

  if (COMMAND_PREFIXES.some((prefix) => content.startsWith(prefix))) {
    return null;
  }

  const author = msg.author.tag || msg.author.username;
  const dateStr = new Date(msg.createdTimestamp).toLocaleString('es-ES');
  const displayContent = content || (msg.attachments.size > 0 ? '[Archivo/Imagen]' : '[Sin texto]');
  const replyInfo = msg.reference?.messageId
    ? ` *(respondiendo a ${msg.reference.messageId})*`
    : '';

  return `**[${dateStr}] ${author}**${replyInfo}:\n${displayContent}\n\n`;
}

function processBatch(
  messages: Collection<Snowflake, Message>,
  cutoffTimestamp: number,
  result: { log: string; count: number; lastId: string | undefined },
): boolean {
  for (const [msgId, msg] of messages) {
    result.lastId = msgId;
    if (msg.createdTimestamp < cutoffTimestamp) return true;

    const formatted = formatMessage(msg);
    if (formatted) {
      result.log += formatted;
      result.count++;
    }
  }
  return false;
}

async function fetchChannelMessages(
  textChannel: TextChannel | NewsChannel,
  cutoffTimestamp: number,
): Promise<string> {
  const result = { log: '', count: 0, lastId: undefined as string | undefined };

  for (let i = 0; i < 500; i++) {
    const options: { limit: number; before?: string } = { limit: 100 };
    if (result.lastId) options.before = result.lastId;

    const messages: Collection<Snowflake, Message> | null = await textChannel.messages
      .fetch(options)
      .catch((e) => {
        console.error(`Error fetching channel #${textChannel.name}:`, e.message);
        return null;
      });

    if (!messages || messages.size === 0) break;
    if (processBatch(messages, cutoffTimestamp, result) || messages.size < 100) break;
  }

  if (result.count === 0) return '';
  return `## 💬 Canal: #${textChannel.name}\n\n${result.log}---\n\n`;
}

client.once('ready', async () => {
  console.log(`LoggedIn as ${client.user?.tag}`);
  try {
    const guild = await client.guilds.fetch(guildId);
    console.log(`Fetching channels for guild: ${guild.name}`);
    const channels = await guild.channels.fetch();

    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    let transcriptMarkdown = `# 📜 Transcript Oficial de Discord (#charla-general & #minecraft-and-chill) - ${guild.name}\n\n`;
    transcriptMarkdown += `*Generado el: ${new Date().toLocaleString('es-ES')}*\n*Período: Últimos 3 Días*\n\n---\n\n`;

    for (const [, channel] of channels) {
      if (!channel || !channel.isTextBased() || channel.isVoiceBased()) continue;

      const textChannel = channel as TextChannel | NewsChannel;
      if (!isTargetChannel(textChannel.name)) continue;

      console.log(`Processing target channel: #${textChannel.name}`);
      transcriptMarkdown += await fetchChannelMessages(textChannel, threeDaysAgo);
    }

    const outputPath = String.raw`C:\Users\nacho\Desktop\Abyssal Throughts\Abyssal Throughts\40 - Projects\CrystalTidesSMP\Management\Discord_Transcript_3_Days.md`;
    fs.writeFileSync(outputPath, transcriptMarkdown, 'utf-8');
    console.log(`SUCCESS! Targeted Transcript saved to ${outputPath}`);
  } catch (err) {
    console.error('Error during transcript generation:', err);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(token);
