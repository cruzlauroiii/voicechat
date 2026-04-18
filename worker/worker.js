// Cloudflare Worker — WSS proxy to local AIRI server via Cloudflare Tunnel
// Deploy: npx wrangler deploy
// Config: set ORIGIN_WSS in wrangler.toml (e.g. wss://your-tunnel.trycloudflare.com/ws)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(request),
      });
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response('ok', { headers: corsHeaders(request) });
    }

    // WebSocket upgrade on /ws
    if (url.pathname === '/ws') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }

      // Connect to origin (local server via Cloudflare Tunnel)
      const originUrl = env.ORIGIN_WSS || 'wss://localhost:8443/ws';
      try {
        const originResponse = await fetch(originUrl, {
          headers: request.headers,
        });

        const originWs = originResponse.webSocket;
        if (!originWs) {
          return new Response('Origin did not upgrade to WebSocket', { status: 502 });
        }
        originWs.accept();

        // Create client-facing WebSocket pair
        const [client, server] = Object.values(new WebSocketPair());
        server.accept();

        // Bidirectional relay
        server.addEventListener('message', (event) => {
          try { originWs.send(event.data); } catch {}
        });
        originWs.addEventListener('message', (event) => {
          try { server.send(event.data); } catch {}
        });

        server.addEventListener('close', (event) => {
          try { originWs.close(event.code, event.reason); } catch {}
        });
        originWs.addEventListener('close', (event) => {
          try { server.close(event.code, event.reason); } catch {}
        });

        return new Response(null, { status: 101, webSocket: client });
      } catch (err) {
        return new Response('Failed to connect to origin: ' + err.message, { status: 502 });
      }
    }

    return new Response('Not found', { status: 404 });
  },
};

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = origin.includes('cruzlauroiii.github.io') || origin.includes('localhost') || origin.includes('127.0.0.1');
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'https://cruzlauroiii.github.io',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Upgrade, Connection',
    'Access-Control-Max-Age': '86400',
  };
}
