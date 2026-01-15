// Game Log Watcher is currently disabled because it depends on an external MySQL database (CoreProtect)
// which is no longer accessible according to the new migration strategy.

export const watchGameLogs = async () => {
    // No-op
};

export const initGameLogWatcher = () => {
    console.log('Game Log Watcher is currently DISABLED (MySQL dependency).');
};
