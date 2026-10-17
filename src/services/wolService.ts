export class WOLService {
  private static get MAC_ADDRESS(): string {
    return process.env.TARGET_MAC_ADDRESS ?? 'a0:48:1c:dd:38:91';
  }

  private static get SPY_URL(): string | undefined {
    return process.env.LOCAL_SPY_URL;
  }

  private static get BOT_API_KEY(): string | undefined {
    return process.env.BOT_API_KEY;
  }

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
          Authorization: `Bearer ${this.BOT_API_KEY}`,
        },
        body: JSON.stringify({ mac: this.MAC_ADDRESS }),
      });

      return response.ok;
    } catch (error) {
      console.error('Error connecting to Local Spy:', error);
      return false;
    }
  }
}
