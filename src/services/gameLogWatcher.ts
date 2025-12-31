import { cpRequest } from '../config/coreProtect';
import { Logger } from './logger';

let lastCheckedTime = Math.floor(Date.now() / 1000);

export const watchGameLogs = async () => {
    try {
        // CoreProtect tables: co_command (row_id, time, user, message), co_user (row_id, time, user, uuid)
        const suspiciousCommands = [
            '/gm', '/gamemode', 
            '/give', '/item', 
            '/xp', '/experience',
            '/enchant', 
            '/tp', '/teleport',
            '//', // WorldEdit
            '/fly', '/god', '/heal', '/feed',
            '/op', '/deop',
            '/fill', '/setblock', '/clone',
            '/effect', '/attribute',
            '/ban', '/tempban', '/kick', '/mute', '/tempmute', '/unban', '/pardon',
            '/whitelist', '/vanish', '/v', '/invsee', '/endersee', '/sudo',
            '/stop', '/restart', '/reload', '/rl'
        ];

        // Construct dynamic OR clause for LIKE
        const commandFilters = suspiciousCommands.map(() => `cmd.message LIKE ?`).join(' OR ');
        
        const query = `
            SELECT 
                cmd.rowid,
                cmd.time, 
                cmd.message, 
                u.user 
            FROM co_command cmd
            JOIN co_user u ON cmd.user = u.rowid
            WHERE cmd.time > ? AND (${commandFilters})
            ORDER BY cmd.time ASC
        `;

        const params = [lastCheckedTime, ...suspiciousCommands.map(cmd => `${cmd}%`)];
        
        const rows: any[] = await cpRequest(query, params) as any[];

        if (rows.length > 0) {
            for (const row of rows) {
                await Logger.log(
                    'Game Command Detected', 
                    `**User:** ${row.user}\n**Command:** \`${row.message}\`\n**Time:** <t:${row.time}:R>`, 
                    'warn'
                );
                // Update lastCheckedTime to avoid duplicates
                lastCheckedTime = Math.max(lastCheckedTime, row.time);
            }
        }
    } catch (error) {
        console.error('Error in gameLogWatcher:', error);
    }
};

export const initGameLogWatcher = () => {
    // Check every 10 seconds
    setInterval(watchGameLogs, 10 * 1000);
    console.log('Game Log Watcher initialized.');
};
