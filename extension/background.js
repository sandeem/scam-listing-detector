// The content script cannot call 127.0.0.1 directly from an https page.
// This service worker makes the call. The API keys stay in the relay.
const RELAY = 'http://127.0.0.1:8790';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'health' || msg.type === 'score') {
    const req = msg.type === 'health'
      ? fetch(`${RELAY}/health`)
      : fetch(`${RELAY}/score`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msg.payload),
        });
    req.then(async (r) => sendResponse({ ok: r.ok, status: r.status, body: await r.json().catch(() => null) }))
      .catch(() => sendResponse({ ok: false, status: 0, body: null }));
    return true; // async response
  }

  // Fetch a listing's own page, so Jev can read the description, not just the card.
  if (msg.type === 'fetchText') {
    fetch(msg.url, { credentials: 'omit' })
      .then(async (r) => sendResponse({ ok: r.ok, status: r.status, body: r.ok ? (await r.text()).slice(0, 400000) : '' }))
      .catch(() => sendResponse({ ok: false, status: 0, body: '' }));
    return true;
  }
  return false;
});
