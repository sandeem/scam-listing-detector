function show(id, text, cls) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = cls;
}
chrome.runtime.sendMessage({ type: 'health' }, (resp) => {
  const h = resp && resp.ok && resp.body;
  if (!h) { show('relay', 'not running', 'no'); return; }
  show('relay', 'running', 'ok');
  h.mock ? show('jev', 'MOCK (no key)', 'warn') : show('jev', 'live', 'ok');
  h.glasser ? show('glasser', 'on', 'ok') : show('glasser', 'off', 'warn');
});
