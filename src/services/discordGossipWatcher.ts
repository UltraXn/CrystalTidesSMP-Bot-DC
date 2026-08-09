import { Client, Message, TextChannel, NewsChannel } from 'discord.js'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const COMMAND_PREFIXES = ['/', '!', '?', '.', 'c!']

/**
 * Verifica si un canal es objetivo de recolección de chismes sociales
 */
function isGossipChannel(channelName: string): boolean {
  const normalized = channelName.normalize('NFKD').toLowerCase()
  if (normalized.includes('anuncio') || normalized.includes('sugerencia') || normalized.includes('comando')) {
    return false
  }

  const isGeneral = channelName.includes('𝖢𝗁𝖺𝗋𝗅𝖺') || normalized.includes('charla-general') || normalized.includes('general')
  const isMinecraftChill = normalized.includes('minecraft-and-chill') || (normalized.includes('minecraft') && normalized.includes('chill'))
  const isMemes = normalized.includes('meme') || normalized.includes('arte')

  return isGeneral || isMinecraftChill || isMemes
}

/**
 * Inicia el escuchador de chismes comunitarios para el Noticiero Amarillista
 */
export function startDiscordGossipWatcher(client: Client): void {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('⚠️ Supabase no configurado en Discord Bot. Gossip Watcher desactivado.')
    return
  }

  client.on('messageCreate', async (message: Message) => {
    try {
      if (message.author.bot) return
      if (!message.guild || !message.channel) return

      const channelName = (message.channel as TextChannel | NewsChannel).name
      if (!channelName || !isGossipChannel(channelName)) return

      const content = message.content?.trim() || ''
      if (COMMAND_PREFIXES.some(prefix => content.startsWith(prefix))) return
      if (!content && message.attachments.size === 0) return

      let replyToMessageId: string | null = null
      if (message.reference?.messageId) {
        replyToMessageId = message.reference.messageId
      }

      await supabase.from('discord_chat_stream').upsert(
        {
          message_id: message.id,
          reply_to_message_id: replyToMessageId,
          channel_name: channelName,
          author_username: message.author.tag || message.author.username,
          author_id: message.author.id,
          content: content || '[Archivo/Imagen]',
          reaction_count: message.reactions.cache.size,
          created_at: new Date(message.createdTimestamp).toISOString()
        },
        { onConflict: 'message_id' }
      )
    } catch (err) {
      console.error('Error guardando chisme de Discord:', err instanceof Error ? err.message : String(err))
    }
  })

  console.log('📡 Discord Gossip Watcher (Chismes de la Comunidad) activado.')
}
