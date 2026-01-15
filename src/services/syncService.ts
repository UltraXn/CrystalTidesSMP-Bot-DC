import { Client, GuildMember } from 'discord.js';
import { supabase } from '../config/supabase';
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

        // 1. Fetch all data needed for verification
        const [profileRes, authRes] = await Promise.all([
            supabase.from('profiles').select('id, minecraft_uuid, social_discord, discord_tag'),
            supabase.auth.admin.listUsers()
        ]);

        if (profileRes.error) throw profileRes.error;
        if (authRes.error) throw authRes.error;

        const profiles = profileRes.data || [];
        const authUsers = authRes.data.users || [];

        // Create lookups for quick verification
        const idMap = new Map<string, string>(); // Discord ID -> Minecraft UUID
        const tagMap = new Map<string, string>(); // Discord Tag -> Minecraft UUID

        // Create a quick profile lookup by user UUID
        const profileByUuid = new Map<string, any>();
        for (const p of profiles) {
            profileByUuid.set(p.id, p);
        }

        // Process Auth Users (Social Login Identities)
        for (const user of authUsers) {
            const discordIdentity = user.identities?.find(i => i.provider === 'discord');
            const profile = profileByUuid.get(user.id);
            
            if (discordIdentity && profile?.minecraft_uuid) {
                idMap.set(discordIdentity.id, profile.minecraft_uuid);
                // Also store the tag if available in identity metadata
                const tag = discordIdentity.identity_data?.full_name || discordIdentity.identity_data?.custom_claims?.global_name;
                if (tag) tagMap.set(tag.toLowerCase(), profile.minecraft_uuid);
            }
        }

        // Process Manual Profile Links (Overrides/Fallbacks)
        for (const profile of profiles) {
             const discordId = profile.social_discord;
             const discordTag = profile.discord_tag;
             const mcUuid = profile.minecraft_uuid;
             
             if (mcUuid) {
                 if (discordId) idMap.set(discordId, mcUuid);
                 if (discordTag) tagMap.set(discordTag.toLowerCase(), mcUuid);
                 
                 // Fallback: Sometimes social_discord contains the tag instead of the ID
                 if (discordId && isNaN(Number(discordId))) {
                     tagMap.set(discordId.toLowerCase(), mcUuid);
                 }
             }
        }

        // 2. Fetch members who have the FILTER role
        const members = await guild.members.fetch();
        const targetMembers = members.filter(m => m.roles.cache.has(ROLE_FILTER_ID));

        for (const [_, member] of targetMembers) {
            // A user is VERIFIED if their ID or Tag exists in our link maps
            const hasIdLink = idMap.has(member.id);
            const hasTagLink = tagMap.has(member.user.tag.toLowerCase()) || 
                              tagMap.has(member.user.username.toLowerCase());

            const isVerified = hasIdLink || hasTagLink;

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
