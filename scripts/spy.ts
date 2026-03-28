import { serve } from "bun";
import { exec } from "child_process";

const API_KEY = process.env.BOT_API_KEY || "TheGreatAbyssalKeyIsHere";
const PORT = process.env.SPY_PORT || 3003;

console.log(`[Local Spy] Starting on port ${PORT}...`);
console.log(`[Local Spy] Tailscale IP recommended for zero-config access.`);

serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/wake" && req.method === "POST") {
      const authHeader = req.headers.get("authorization");
      if (authHeader !== `Bearer ${API_KEY}`) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      }

      try {
        const body = await req.json();
        const mac = body.mac;

        if (!mac || !/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(mac)) {
          return new Response(JSON.stringify({ error: "Invalid MAC Address" }), { status: 400 });
        }

        console.log(`[Local Spy] Received wake request for: ${mac}`);
        
        // Execute wakeonlan command
        exec(`wakeonlan ${mac}`, (error, stdout, stderr) => {
          if (error) {
            console.error(`[Local Spy] WOL Error: ${error.message}`);
            return;
          }
          console.log(`[Local Spy] WOL Output: ${stdout}`);
        });

        return new Response(JSON.stringify({ success: true, message: "Magic Packet dispatched" }), { status: 200 });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Bad Request" }), { status: 400 });
      }
    }

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });
  },
});
