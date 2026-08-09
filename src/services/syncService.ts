import { Client, GuildMember } from 'discord.js';
import { supabase } from '../config/supabase';
import { Logger } from './logger';

const GUILD_ID = process.env.DISCORD_GUILD_ID;
const ROLE_FILTER_ID = process.env.DISCORD_ROLE_MINECRAFT_FILTER;
const ROLE_VERIFIED_ID = process.env.DISCORD_ROLE_VERIFIED;
const ROLE_UNVERIFIED_ID = process.env.DISCORD_ROLE_UNVERIFIED;

interface ProfileRecord {
    id: string;
    minecraft_uuid?: string | null;
    social_discord?: string | null;
    discord_tag?: string | null;
}

interface DiscordIdentity {
    id: string;
    provider: string;
    identity_data?: {
        full_name?: string;
        custom_claims?: {
            global_name?: string;
        };
    };
}

interface AuthUserRecord {
    id: string;
    identities?: DiscordIdentity[];
}

interface VerificationMaps {
    idMap: Map<string, string>;
    tagMap: Map<string, string>;
}

function processAuthUsers(authUsers: AuthUserRecord[], profileByUuid: Map<string, ProfileRecord>, maps: VerificationMaps) {
    for (const user of authUsers) {
        const discordIdentity = user.identities?.find((i) => i.provider === 'discord');
        const profile = profileByUuid.get(user.id);
        const mcUuid = typeof profile?.minecraft_uuid === 'string' ? profile.minecraft_uuid : null;

        if (discordIdentity && mcUuid) {
            maps.idMap.set(discordIdentity.id, mcUuid);
            const tag = discordIdentity.identity_data?.full_name || discordIdentity.identity_data?.custom_claims?.global_name;
            if (typeof tag === 'string') {
                maps.tagMap.set(tag.toLowerCase(), mcUuid);
            }
        }
    }
}

function processProfiles(profiles: ProfileRecord[], maps: VerificationMaps) {
    for (const profile of profiles) {
        const discordId = profile.social_discord;
        const discordTag = profile.discord_tag;
        const mcUuid = typeof profile.minecraft_uuid === 'string' ? profile.minecraft_uuid : null;

        if (!mcUuid) continue;

        if (discordId) maps.idMap.set(discordId, mcUuid);
        if (discordTag) maps.tagMap.set(discordTag.toLowerCase(), mcUuid);

        if (discordId && Number.isNaN(Number(discordId))) {
            maps.tagMap.set(discordId.toLowerCase(), mcUuid);
        }
    }
}

function buildVerificationMaps(profiles: ProfileRecord[], authUsers: AuthUserRecord[]): VerificationMaps {
    const maps: VerificationMaps = {
        idMap: new Map<string, string>(),
        tagMap: new Map<string, string>()
    };

    const profileByUuid = new Map<string, ProfileRecord>();
    for (const p of profiles) {
        profileByUuid.set(p.id, p);
    }

    processAuthUsers(authUsers, profileByUuid, maps);
    processProfiles(profiles, maps);

    return maps;
}

async function syncMemberRole(member: GuildMember, maps: VerificationMaps) {
    if (!ROLE_VERIFIED_ID || !ROLE_UNVERIFIED_ID) return;

    const hasIdLink = maps.idMap.has(member.id);
    const hasTagLink = maps.tagMap.has(member.user.tag.toLowerCase()) || 
                      maps.tagMap.has(member.user.username.toLowerCase());

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

        const [profileRes, authRes] = await Promise.all([
            supabase.from('profiles').select('id, minecraft_uuid, social_discord, discord_tag'),
            supabase.auth.admin.listUsers()
        ]);

        if (profileRes.error) throw profileRes.error;
        if (authRes.error) throw authRes.error;

        const maps = buildVerificationMaps(profileRes.data || [], (authRes.data.users as AuthUserRecord[]) || []);
        const members = await guild.members.fetch();
        const targetMembers = members.filter(m => m.roles.cache.has(ROLE_FILTER_ID));

        for (const member of targetMembers.values()) {
            await syncMemberRole(member, maps);
        }

        if (targetMembers.size > 0) {
            Logger.log('Sync Complete', `Processed ${targetMembers.size} members for Minecraft role sync.`, 'info');
        }
    } catch (error) {
        Logger.log('Sync Error', `Error during role synchronization: ${error}`, 'error');
    }
}
