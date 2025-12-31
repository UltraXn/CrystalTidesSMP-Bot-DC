import { Client, GuildMember } from 'discord.js';
import { supabase } from '../config/supabase';
import { dbRequest } from '../config/mysql';
import { Logger } from './logger';

const GUILD_ID = process.env.DISCORD_GUILD_ID;
const ROLE_FILTER_ID = process.env.DISCORD_ROLE_MINECRAFT_FILTER; // 1272263167090626712
const ROLE_VERIFIED_ID = process.env.DISCORD_ROLE_VERIFIED;       // 1454988313382359080
const ROLE_UNVERIFIED_ID = process.env.DISCORD_ROLE_UNVERIFIED;   // 1454988414653825106

/**
 * Synchronizes Minecraft verification roles for users who have the base Minecraft role.
 */
export async function syncMinecraftRoles(client: Client) {
    if (!GUILD_ID || !ROLE_FILTER_ID || !ROLE_VERIFIED_ID || !ROLE_UNVERIFIED_ID) {
        console.warn('[Sync Service] Missing configuration for role synchronization (Check .env).');
        return;
    }

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        if (!guild) {
            console.error(`[Sync Service] Could not find guild with ID: ${GUILD_ID}`);
            return;
        }

        // 1. Fetch all users from Supabase with linked accounts
        const { data: { users }, error } = await supabase.auth.admin.listUsers();
        if (error) throw error;

        // 2. Fetch all valid Minecraft UUIDs from the server databases
        const planUsers = await dbRequest('SELECT uuid FROM plan_users');
        const crystalLinked = await dbRequest('SELECT uuid, web_user_id FROM linked_accounts');
        
        const validUuids = new Set((planUsers as any[]).map(u => u.uuid));
        const crystalUuidMap = new Map<string, string>(); // web_user_id -> minecraft_uuid
        (crystalLinked as any[]).forEach(row => {
            validUuids.add(row.uuid);
            if (row.web_user_id) crystalUuidMap.set(row.web_user_id, row.uuid);
        });

        // Create a map for quick lookup: Discord ID -> Linked Minecraft UUID
        const linkedMap = new Map<string, string>();
        for (const user of users) {
             const metadata = user.user_metadata || {};
             
             // Extract Discord ID (Support both OAuth and manual linking)
             const discordId = metadata.discord?.id 
                || (metadata.iss?.includes('discord') ? metadata.sub : null)
                || metadata.provider_id 
                || metadata.social_discord_id
                || (user.identities?.find(i => i.provider === 'discord')?.id);
             
             // Extract Minecraft UUID
             const mcUuid = metadata.minecraft_uuid || crystalUuidMap.get(user.id);
             
             if (discordId && mcUuid) {
                 linkedMap.set(discordId, mcUuid);
             }
        }

        // 3. Fetch members who have the FILTER role
        const members = await guild.members.fetch();
        const targetMembers = members.filter(m => m.roles.cache.has(ROLE_FILTER_ID));

        for (const [_, member] of targetMembers) {
            const mcUuid = linkedMap.get(member.id);
            const isVerified = mcUuid && validUuids.has(mcUuid);

            if (isVerified) {
                if (!member.roles.cache.has(ROLE_VERIFIED_ID)) {
                    await member.roles.add(ROLE_VERIFIED_ID);
                    console.log(`[Sync Service] ✅ Verified: ${member.user.tag}`);
                }
                if (member.roles.cache.has(ROLE_UNVERIFIED_ID)) {
                    await member.roles.remove(ROLE_UNVERIFIED_ID);
                }
            } else {
                if (!member.roles.cache.has(ROLE_UNVERIFIED_ID)) {
                    await member.roles.add(ROLE_UNVERIFIED_ID);
                    console.log(`[Sync Service] ❌ Unverified: ${member.user.tag}`);
                }
                if (member.roles.cache.has(ROLE_VERIFIED_ID)) {
                    await member.roles.remove(ROLE_VERIFIED_ID);
                }
            }
        }

        if (targetMembers.size > 0) {
            Logger.log('Sync Complete', `Processed ${targetMembers.size} members for Minecraft role sync.`, 'info');
        }
    } catch (error) {
        Logger.log('Sync Error', `Error during role synchronization: ${error}`, 'error');
    }
}
