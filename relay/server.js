'use strict';
// Local relay. Holds the API keys so the browser extension never sees them.
//   GET  /health  -> status for the popup
//   GET  /demo    -> a fake listing site for demos and videos
//   POST /score   -> {text, price, median} -> verdict
const fs = require('fs');
const http = require('http');
const path = require('path');
const { scoreListing } = require('./score.js');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]] && m[2]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnv(path.join(__dirname, '..', '.env'));

// Jev is live if a direct TypeSafe key is set, or if it runs through Glasser.
function liveJev() {
  return !!(process.env.TYPESAFE_API_KEY ||
    (process.env.GLASSER_API_KEY && process.env.JEV_PROVIDER && process.env.JEV_ENDPOINT));
}

const PORT = Number(process.env.PORT || 8790);
const MAX_BODY = 20000;

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

function server() {
  return http.createServer(async (req, res) => {
    // Web pages may not call the relay. Only the extension (or curl, with no Origin) may.
    const origin = req.headers.origin;
    if (origin && !origin.startsWith('chrome-extension://')) return send(res, 403, { error: 'forbidden_origin' });

    if (req.method === 'GET' && req.url === '/health') {
      return send(res, 200, {
        ok: true,
        jev: liveJev(),
        mock: !liveJev(),
        glasser: !!(process.env.GLASSER_API_KEY && process.env.GLASSER_PROVIDER && process.env.GLASSER_ENDPOINT),
      });
    }
    if (req.method === 'GET' && req.url === '/demo') {
      return send(res, 200, fs.readFileSync(path.join(__dirname, '..', 'demo', 'listings.html')), 'text/html; charset=utf-8');
    }
    if (req.method === 'POST' && req.url === '/score') {
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > MAX_BODY) return send(res, 413, { error: 'too_large' }); }
      let input;
      try { input = JSON.parse(raw); } catch { return send(res, 400, { error: 'bad_json' }); }
      if (typeof input.text !== 'string' || input.text.length < 20) return send(res, 422, { error: 'text_too_short' });
      input.text = input.text.slice(0, 1500);
      // Optional listing photos, for the reverse-image check. At most 3 public URLs.
      input.images = Array.isArray(input.images)
        ? input.images.filter((u) => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 3)
        : [];
      // "A picture is there but we could not read it" is not the same as "no picture".
      input.photoUnknown = !!input.photoUnknown;
      try { return send(res, 200, await scoreListing(input)); }
      catch (e) { return send(res, e.status === 401 ? 401 : 502, { error: 'upstream_failed', status: e.status || 0 }); }
    }
    send(res, 404, { error: 'not_found' });
  });
}

if (require.main === module) {
  server().listen(PORT, '127.0.0.1', () => {
    const live = liveJev();
    console.log(`Relay on http://127.0.0.1:${PORT}  (${live ? 'live Jev' : 'MOCK mode: no Jev key'})`);
    console.log(`Demo listing site: http://127.0.0.1:${PORT}/demo`);
  });
}
module.exports = { server };
