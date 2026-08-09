export interface PelicanServerStatus {
    state: 'running' | 'starting' | 'stopping' | 'offline' | 'missing';
    utilization?: {
        cpu_absolute: number;
        memory_bytes: number;
        disk_bytes: number;
    };
}

export class PelicanService {
    private static externalUrl = process.env.PELICAN_URL || 'https://panel.crystaltidessmp.net';
    private static internalUrl = process.env.PELICAN_INTERNAL_URL || 'http://panel';
    private static apiKey = process.env.PELICAN_API_KEY;
    private static serverId = process.env.PELICAN_SERVER_ID;

    private static get headers() {
        return {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };
    }

    /**
     * Sends HTTP request to Pelican Panel, trying internal container URL first to avoid hairpin NAT timeouts.
     */
    private static async fetchPelican(path: string, init: RequestInit): Promise<Response> {
        const urlsToTry = Array.from(new Set([this.internalUrl, this.externalUrl]));
        let lastError: unknown = null;

        for (const baseUrl of urlsToTry) {
            try {
                const res = await fetch(`${baseUrl}${path}`, {
                    ...init,
                    headers: this.headers,
                    signal: AbortSignal.timeout(3000),
                });
                if (res.ok || res.status === 204) return res;
            } catch (err) {
                lastError = err;
            }
        }
        throw lastError || new Error('Pelican panel API unreachable');
    }

    /**
     * Sends a power signal to the server.
     * @param signal 'start' | 'stop' | 'restart' | 'kill'
     */
    static async sendPowerAction(signal: 'start' | 'stop' | 'restart' | 'kill'): Promise<boolean> {
        if (!this.apiKey || !this.serverId) {
            console.error('Pelican API Key or Server ID not configured.');
            return false;
        }

        try {
            const response = await this.fetchPelican(`/api/client/servers/${this.serverId}/power`, {
                method: 'POST',
                body: JSON.stringify({ signal }),
            });

            return response.status === 204;
        } catch (error) {
            console.error('Error sending Pelican power action:', error);
            return false;
        }
    }

    /**
     * Gets the current status of the server.
     */
    static async getServerStatus(): Promise<PelicanServerStatus | null> {
        if (!this.apiKey || !this.serverId) return null;

        try {
            const response = await this.fetchPelican(`/api/client/servers/${this.serverId}/resources`, {
                method: 'GET',
            });

            const data = await response.json();
            return {
                state: data.attributes.current_state,
                utilization: data.attributes.resources
            };
        } catch (error) {
            console.error('Error fetching Pelican server status:', error);
            return null;
        }
    }
}
