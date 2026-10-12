// Minimal Chrome DevTools helper (Node 22, no dependencies).
// Start Chrome first:
//   google-chrome --headless=new --remote-debugging-port=9333 \
//     --enable-unsafe-extension-debugging --user-data-dir=/tmp/prof about:blank
export async function connect(port = 9333) {
  const v = await (await fetch(`http://localhost:${port}/json/version`)).json();
  return open(v.webSocketDebuggerUrl);
}

export async function open(url) {
  const ws = new WebSocket(url);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else listeners.forEach((l) => l(m));
  };
  return {
    send: (method, params = {}, sessionId) => new Promise((res, rej) => {
      const i = ++id; pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
    }),
    on: (fn) => listeners.push(fn),
    close: () => ws.close(),
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
