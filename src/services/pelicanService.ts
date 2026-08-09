export interface PelicanServerStatus {
    state: 'running' | 'starting' | 'stopping' | 'offline' | 'missing';
    utilization?: {
        cpu_absolute: number;
        memory_bytes: number;
        disk_bytes: number;
    }
}

export class PelicanService {
    private static baseUrl = process.env.PELICAN_URL || 'https://panel.crystaltidessmp.net';
    private static apiKey = process.env.PELICAN_API_KEY;
    private static serverId = process.env.PELICAN_SERVER_ID;

    private static get headers() {
        return {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'Application/vnd.pelican.v1+json',
        };
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
            const response = await fetch(`${this.baseUrl}/api/client/servers/${this.serverId}/power`, {
                method: 'POST',
                headers: this.headers,
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
            const response = await fetch(`${this.baseUrl}/api/client/servers/${this.serverId}/resources`, {
                method: 'GET',
                headers: this.headers,
            });

            if (!response.ok) return null;

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
