export class WOLService {
    private static MAC_ADDRESS = process.env.TARGET_MAC_ADDRESS || 'a0:48:1c:dd:38:91';
    private static SPY_URL = process.env.LOCAL_SPY_URL;
    private static BOT_API_KEY = process.env.BOT_API_KEY;

    /**
     * Sends a request to the Local Spy to wake the PC.
     */
    static async wakePC(): Promise<boolean> {
        if (!this.SPY_URL) {
            console.error('LOCAL_SPY_URL not configured.');
            return false;
        }

        try {
            const response = await fetch(this.SPY_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.BOT_API_KEY}`
                },
                body: JSON.stringify({ mac: this.MAC_ADDRESS })
            });

            return response.ok;
        } catch (error) {
            console.error('Error connecting to Local Spy:', error);
            return false;
        }
    }
}

