const http = require('node:http');
const commands = new Set([
  'pin',
  'like',
  'shuffle',
  'repeat',
  'touch',
  'select',
  'center-click',
  'center-down',
  'center-up',
  'menu-down',
  'menu-up',
  'next-down',
  'next-up',
  'previous-down',
  'previous-up',
  'toggle',
  'next',
  'previous',
  'volume-up',
  'volume-down',
  'seek-forward',
  'seek-back',
  'menu',
  'back',
]);
function validateEvent(event) {
  if (!event || typeof event !== 'object') return null;
  if (event.type === 'heartbeat') return { type: 'heartbeat' };
  if (event.type === 'command' && commands.has(event.command))
    return { type: 'command', command: event.command };
  if (
    event.type === 'dial' &&
    Number.isInteger(event.delta) &&
    event.delta !== 0 &&
    Math.abs(event.delta) <= 20
  )
    return { type: 'dial', delta: event.delta, held: event.held === true };
  return null;
}
function createBridge(onEvent, port = 4765) {
  let lastSeen = 0,
    lastEvent = null,
    eventCount = 0;
  const server = http.createServer((req, res) => {
    // Qt/Ulanzi serializes local WebView origins as file://; Chromium may use null.
    // Permit those local-page origins, while rejecting ordinary websites.
    const origin = req.headers.origin;
    if (origin && origin !== 'null' && origin !== 'file://') {
      res.writeHead(403);
      return res.end();
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    if (req.method === 'GET' && req.url === '/device/state') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({ ok: true, ...server.status(), name: 'turnbit' }),
      );
    }
    if (req.method !== 'POST' || req.url !== '/device/event') {
      res.writeHead(404);
      return res.end();
    }
    if (!req.headers['content-type']?.startsWith('application/json')) {
      res.writeHead(415);
      return res.end();
    }
    let body = '';
    let oversized = false;
    req.on('data', (chunk) => {
      if (oversized) return;
      body += chunk;
      if (Buffer.byteLength(body) > 4096) {
        oversized = true;
        res.writeHead(413);
        res.end();
      }
    });
    req.on('end', () => {
      if (oversized) return;
      let event;
      try {
        event = validateEvent(JSON.parse(body));
      } catch {}
      if (!event) {
        res.writeHead(400);
        return res.end();
      }
      lastSeen = Date.now();
      if (event.type !== 'heartbeat') {
        lastEvent = { ...event, receivedAt: lastSeen };
        eventCount++;
      }
      onEvent(event);
      res.writeHead(204);
      res.end();
    });
  });
  server.requestTimeout = 5000;
  server.listen(port, '127.0.0.1');
  server.status = () => ({
    pluginOnline: Date.now() - lastSeen < 15000,
    lastSeen,
    lastEvent,
    eventCount,
  });
  return server;
}
module.exports = { createBridge, validateEvent };
