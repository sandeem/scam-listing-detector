/* Labels listing cards as they scroll into view. Never hides, edits or moves anything. */
(function () {
  const { classify, parsePrice, median, extractListingBody } = ScamCore;
  const SELECTOR = ScamSites.cardSelector();
  const MAX_PARALLEL = 3;
  const cache = new Map();      // text -> result
  const inflight = new Map();   // text -> Promise
  const detailCache = new Map(); // url -> posting text
  let active = 0;
  const waiting = [];
  let pausedUntil = 0;

  const textOf = (el) => (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1500);

  // Listing photos, for the reverse-image check. Skips icons, logos and blank placeholders.
  // Sites lazy-load: until a card scrolls in, its <img> holds a data: placeholder, and the
  // real URL can also sit in srcset or a data- attribute. Accept any of those instead of
  // reading only img.src, which is still the placeholder at the moment the card appears.
  const REAL_URL = /^https?:\/\//;
  const NOT_A_PHOTO = /sprite|logo|icon|placeholder|grey-png|blank|spacer/i;
  function photoUrls(el) {
    const out = [];
    for (const img of el.querySelectorAll('img')) {
      const srcset = (img.getAttribute('srcset') || '').split(',');
      const dataSrcset = (img.getAttribute('data-srcset') || '').split(',');
      for (const raw of [img.currentSrc, img.src, img.getAttribute('data-src'), ...srcset, ...dataSrcset]) {
        const url = (raw || '').trim().split(/\s+/)[0];
        if (REAL_URL.test(url) && !NOT_A_PHOTO.test(url)) { out.push(url); break; }
      }
      if (out.length >= 3) break;
    }
    return out;
  }

  // Wait for the real picture to replace the placeholder. Resolves on load, on error, or
  // after a short timeout, so a slow image never holds up the badge.
  function waitForPhoto(el, ms = 900) {
    const pending = [...el.querySelectorAll('img')].filter((i) => !REAL_URL.test(i.currentSrc || i.src || ''));
    if (!pending.length) return Promise.resolve();
    return new Promise((resolve) => {
      let left = pending.length;
      const timer = setTimeout(resolve, ms);
      const done = () => { if (--left <= 0) { clearTimeout(timer); resolve(); } };
      for (const img of pending) {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      }
    });
  }

  // A picture is on the card but we could not read its address. That is not "no photo".
  const photoUnreadable = (el) => !!el.querySelector('img');

  // Compare this rent with the whole page, not just the cards we happen to have scored:
  // where two cheap ads sit side by side, each one makes the other look normal.
  let medianCache = { at: 0, value: null };
  function pageMedian() {
    if (Date.now() - medianCache.at < 10000) return medianCache.value;
    const prices = [];
    for (const el of document.querySelectorAll(SELECTOR)) {
      const p = parsePrice(textOf(el));
      if (p) prices.push(p);
    }
    // Fewer than five prices is not a market. Say "unknown" rather than guess.
    medianCache = { at: Date.now(), value: prices.length >= 5 ? median(prices) : null };
    return medianCache.value;
  }

  function slot(fn) {
    return new Promise((resolve, reject) => {
      const run = () => { active++; fn().then(resolve, reject).finally(() => { active--; waiting.shift()?.(); }); };
      active < MAX_PARALLEL ? run() : waiting.push(run);
    });
  }

  // Cards carry only a title and a price. The scams live in the listing's own page.
  function detailUrl(el) {
    for (const a of el.querySelectorAll('a[href]')) {
      try {
        const u = new URL(a.href);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
        if (/\.html$/.test(u.pathname) || /\/\d{6,}/.test(u.pathname)) return u.href;
      } catch { /* ignore */ }
    }
    return null;
  }

  async function detailText(el) {
    const url = detailUrl(el);
    if (!url) return '';
    if (detailCache.has(url)) return detailCache.get(url);
    let body = '';
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'fetchText', url });
      if (resp && resp.ok && resp.body) body = extractListingBody(resp.body);
    } catch { /* keep going with the card text only */ }
    detailCache.set(url, body);
    return body;
  }

  function score(text, el) {
    if (cache.has(text)) return Promise.resolve(cache.get(text));
    if (inflight.has(text)) return inflight.get(text);
    if (Date.now() < pausedUntil) return Promise.reject(new Error('paused'));
    const price = parsePrice(text);
    const photos = el ? photoUrls(el) : [];
    const payload = {
      text,
      price,
      median: pageMedian(),
      images: photos,
      photoUnknown: !!(el && !photos.length && photoUnreadable(el)),
    };
    const p = slot(() => chrome.runtime.sendMessage({ type: 'score', payload })).then((resp) => {
      if (!resp || !resp.ok || !resp.body) {
        if (!resp || resp.status === 0 || resp.status === 401) pausedUntil = Date.now() + 30000;
        throw new Error('failed');
      }
      cache.set(text, resp.body);
      return resp.body;
    }).finally(() => inflight.delete(text));
    inflight.set(text, p);
    return p;
  }

  function wrapFor(el) {
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    let w = el.querySelector(':scope > .scam-wrap');
    if (!w) { w = document.createElement('div'); w.className = 'scam-wrap'; el.appendChild(w); }
    return w;
  }

  function render(el, r) {
    const v = classify(r.risk);
    const w = wrapFor(el);
    w.innerHTML = '';
    w.dataset.verdict = v.verdict;
    const badge = document.createElement('span');
    badge.className = `scam-badge scam-${v.verdict}`;
    badge.textContent = `${v.label} | ${Math.round(r.risk * 100)}%${r.mock ? ' (mock)' : ''}`;
    badge.title = (r.reasons.length ? 'Why:\n- ' + r.reasons.join('\n- ') : 'No red flags found.') +
      '\n\nRisk signal from Jev questions' + (r.evidence ? ' + Glasser web evidence' : '') +
      '. It is not proof. Do not accuse anyone.';
    w.appendChild(badge);
    // The reasons as a panel inside the card, not only the browser's native tooltip:
    // a native tooltip cannot be styled, appears slowly, and never shows in a screenshot.
    const why = document.createElement('div');
    why.className = 'scam-why';
    const head = document.createElement('b');
    head.textContent = r.reasons.length ? 'Why:' : 'No red flags found.';
    why.appendChild(head);
    for (const reason of r.reasons) {
      const line = document.createElement('div');
      line.textContent = `- ${reason}`;
      why.appendChild(line);
    }
    const foot = document.createElement('small');
    foot.textContent = `Risk signal from Jev questions${r.evidence ? ' + Glasser web evidence' : ''}. It is not proof. Do not accuse anyone.`;
    why.appendChild(foot);
    w.appendChild(why);
    badge.addEventListener('mouseenter', () => w.classList.add('scam-show-why'));
    badge.addEventListener('mouseleave', () => w.classList.remove('scam-show-why'));
    if (v.stamp) {
      const s = document.createElement('div');
      s.className = 'scam-stamp';
      s.textContent = 'SCAM?';
      w.appendChild(s);
    }
  }

  function renderUnscored(el) {
    const w = wrapFor(el);
    w.innerHTML = '<span class="scam-badge scam-unscored">Unscored</span>';
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      io.unobserve(el);
      const card = textOf(el);
      if (card.length < 30) continue;
      Promise.all([detailText(el), waitForPhoto(el)])
        .then(([body]) => score((card + ' ' + body).trim().slice(0, 1500), el))
        .then((r) => render(el, r))
        .catch(() => renderUnscored(el));
    }
  }, { threshold: 0.4 });

  const seen = new WeakSet();
  function scan() {
    document.querySelectorAll(SELECTOR).forEach((el) => {
      if (!seen.has(el)) { seen.add(el); io.observe(el); }
    });
  }
  scan();
  new MutationObserver(() => scan()).observe(document.body, { childList: true, subtree: true });
})();
