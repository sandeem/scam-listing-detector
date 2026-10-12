'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const core = require('../extension/lib/core.js');
const { scoreListing, buildState, jevQuestions } = require('../relay/score.js');
const { server } = require('../relay/server.js');

const REAL = 'Bright 2BR near Zilker Park $1,850/mo. Tours Saturdays 10-2. Application fee via the property portal. office@maplepm.example.com';
const SCAM = 'LUXURY 2BR $650/mo. I am out of the country as a missionary so I cannot show it. Send the deposit by Zelle. Act now, many applicants. WhatsApp +44 7700 900123';

test('weights sum to 1', () => {
  const sum = Object.values(core.QUESTIONS).reduce((a, [w]) => a + w, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('classify thresholds', () => {
  assert.equal(core.classify(0.1).verdict, 'low');
  assert.equal(core.classify(0.3).verdict, 'suspicious');
  assert.equal(core.classify(0.55).verdict, 'scam');
  assert.equal(core.classify(0.55).stamp, true);
});

test('parsePrice, median, contacts', () => {
  assert.equal(core.parsePrice('rent $1,850/mo'), 1850);
  assert.equal(core.parsePrice('rent $650'), 650);
  assert.equal(core.parsePrice('no price'), null);
  assert.equal(core.median([3, 1, 2]), 2);
  assert.equal(core.median([1, 2, 3, 4]), 2.5);
  assert.equal(core.median([]), null);
  assert.deepEqual(core.extractContacts('mail a@b.com now').slice(0, 1), ['a@b.com']);
});

test('mock mode ranks scam above real, flagged mock', async () => {
  const env = {}; // no keys
  const real = await scoreListing({ text: REAL, price: 1850, median: 1800 }, env);
  const scam = await scoreListing({ text: SCAM, price: 650, median: 1800 }, env);
  assert.equal(real.mock, true);
  assert.equal(real.verdict, 'low');
  assert.equal(scam.verdict, 'scam');
  assert.ok(scam.risk > real.risk);
});

test('state marks listing text as untrusted and jev gets noul questions only', () => {
  const s = buildState({ text: 'hello', price: 5, median: 9 }, '');
  assert.match(s, /untrusted/);
  for (const q of Object.values(jevQuestions())) assert.equal(q.type, 'noul');
});

test('live path sends bearer key and parses answers (fake fetch)', async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    const answers = {};
    for (const n of Object.keys(core.QUESTIONS)) answers[n] = { type: 'noul', noul: 0.9 };
    return { ok: true, json: async () => ({ answers }) };
  };
  const r = await scoreListing({ text: SCAM, price: 650, median: 1800 }, { TYPESAFE_API_KEY: 'k' }, fakeFetch);
  assert.equal(r.mock, false);
  assert.equal(r.verdict, 'scam');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer k');
});

test('glasser is only called when configured and first pass is worrying', async () => {
  const urls = [];
  const fakeFetch = async (url) => {
    urls.push(url);
    if (url.includes('/v1/runs')) return { ok: true, json: async () => ({ output: 'reported as a scam' }) };
    const answers = {};
    for (const n of Object.keys(core.QUESTIONS)) answers[n] = { type: 'noul', noul: 0.8 };
    return { ok: true, json: async () => ({ answers }) };
  };
  const env = { TYPESAFE_API_KEY: 'k', GLASSER_API_KEY: 'g', GLASSER_PROVIDER: 'serper', GLASSER_ENDPOINT: 'x' };
  const r = await scoreListing({ text: SCAM, price: 650, median: 1800 }, env, fakeFetch);
  assert.equal(r.evidence, true);
  assert.equal(urls.filter((u) => u.includes('/v1/runs')).length, 1);
  // no Glasser config -> no paid call
  urls.length = 0;
  await scoreListing({ text: SCAM, price: 650, median: 1800 }, { TYPESAFE_API_KEY: 'k' }, fakeFetch);
  assert.equal(urls.filter((u) => u.includes('/v1/runs')).length, 0);
});

// ---- Step 2 additions: the three Glasser checks, no-photo, cost gate, failure handling ----
const score = require('../relay/score.js');

// A fake network. Jev answers `level` for every question; Glasser runs are counted per endpoint.
function fakeNet(level = 0.8, { failGlasser = false } = {}) {
  const net = { runs: [], jev: 0, states: [] };
  net.fetch = async (url, opts) => {
    if (String(url).includes('/v1/runs')) {
      const b = JSON.parse(opts.body);
      net.runs.push(b);
      if (failGlasser) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, json: async () => ({ output: { endpoint: b.endpoint, marker: 'ZZ_FOUND_42' } }) };
    }
    net.jev++;
    const body = JSON.parse(opts.body);
    net.states.push(JSON.stringify(body));
    const answers = {};
    for (const n of Object.keys(core.QUESTIONS)) answers[n] = { type: 'noul', noul: level };
    return { ok: true, json: async () => ({ answers }) };
  };
  return net;
}
const FULL_ENV = {
  TYPESAFE_API_KEY: 'k', GLASSER_API_KEY: 'g',
  PHOTO_PROVIDER: 'serpapi', PHOTO_ENDPOINT: '/search?engine=google_lens', PHOTO_INPUT_TEMPLATE: '{"url":"{query}"}',
  PROPERTY_PROVIDER: 'rentcast', PROPERTY_ENDPOINT: '/properties', PROPERTY_INPUT_TEMPLATE: '{"address":"{query}"}',
  DUPLICATE_PROVIDER: 'serper', DUPLICATE_ENDPOINT: '/search', DUPLICATE_INPUT_TEMPLATE: '{"q":"{query}"}',
  ADDRESS_PROVIDER: 'pdl', ADDRESS_ENDPOINT: '/v5/location/clean',
};

test('weights: eleven questions, all positive, no_photo present', () => {
  const names = Object.keys(core.QUESTIONS);
  assert.equal(names.length, 11);
  for (const n of ['photo_reused', 'owner_mismatch', 'duplicate_listing', 'no_photo']) assert.ok(names.includes(n), n);
  for (const [w] of Object.values(core.QUESTIONS)) assert.ok(w > 0);
});

test('buildState tells Jev when the ad has no photo', () => {
  assert.match(score.buildState({ text: 'x', price: 1, median: 2, images: [] }, ''), /none - the ad shows no photo/);
  assert.match(score.buildState({ text: 'x', price: 1, median: 2 }, ''), /none - the ad shows no photo/);
  assert.match(score.buildState({ text: 'x', price: 1, median: 2, images: ['https://a/b.jpg'] }, ''), /1 photo link/);
});

test('phraseOf picks a long sentence and ignores short text', () => {
  assert.equal(score.phraseOf('Hi. Short. Ok.'), '');
  const p = score.phraseOf('Hi there. This beautiful two bedroom apartment has a private garden and parking. Call me.');
  assert.match(p, /beautiful two bedroom/);
  assert.ok(p.length <= 90);
});

test('each Glasser check sends the right provider, endpoint and input', async () => {
  const net = fakeNet();
  await score.glasserPhoto(['https://img.example/unique-1.jpg'], FULL_ENV, net.fetch);
  await score.glasserProperty('77 Test Street, Springfield, IL 62701', FULL_ENV, net.fetch);
  await score.glasserDuplicates('a very distinctive sentence about a unique rental home number one', FULL_ENV, net.fetch);
  const by = Object.fromEntries(net.runs.map((r) => [r.provider, r]));
  assert.deepEqual(by.serpapi.input, { url: 'https://img.example/unique-1.jpg' });
  assert.deepEqual(by.rentcast.input, { address: '77 Test Street, Springfield, IL 62701' });
  assert.match(by.serper.input.q, /^".*unique rental home number one"$/); // exact-phrase quotes
});

test('each check is silent when unconfigured, keyless, or has nothing to look up', async () => {
  const net = fakeNet();
  assert.equal(await score.glasserPhoto(['https://x/y.jpg'], { GLASSER_API_KEY: 'g' }, net.fetch), '');
  assert.equal(await score.glasserPhoto([], FULL_ENV, net.fetch), '');
  assert.equal(await score.glasserProperty(null, FULL_ENV, net.fetch), '');
  assert.equal(await score.glasserDuplicates('', FULL_ENV, net.fetch), '');
  assert.equal(await score.glasserPhoto(['https://x/y2.jpg'], { ...FULL_ENV, GLASSER_API_KEY: '' }, net.fetch), '');
  assert.equal(net.runs.length, 0);
});

test('a repeated lookup is cached: one paid call, not two', async () => {
  const net = fakeNet();
  const img = ['https://img.example/cache-test.jpg'];
  const a = await score.glasserPhoto(img, FULL_ENV, net.fetch);
  const b = await score.glasserPhoto(img, FULL_ENV, net.fetch);
  assert.equal(a, b);
  assert.equal(net.runs.length, 1);
});

test('a failing Glasser check never breaks scoring', async () => {
  const net = fakeNet(0.8, { failGlasser: true });
  assert.equal(await score.glasserProperty('1 Fail Road, Nowhere, TX 75001', FULL_ENV, net.fetch), '');
  const r = await scoreListing({ text: SCAM + ' 1 Fail Road, Nowhere, TX 75001', price: 650, median: 1800, images: ['https://i/fail.jpg'] }, FULL_ENV, net.fetch);
  assert.equal(r.verdict, 'scam');
});

test('cost gate: a clean listing triggers NO paid Glasser calls', async () => {
  const net = fakeNet(0.05);
  const r = await scoreListing({ text: REAL + ' 12 Calm Lane, Austin, TX 78701', price: 1850, median: 1800, images: ['https://i/clean.jpg'] }, FULL_ENV, net.fetch);
  assert.equal(r.verdict, 'low');
  const paid = net.runs.filter((x) => x.provider !== 'pdl');
  assert.equal(paid.length, 0, 'paid calls on a clean listing: ' + JSON.stringify(paid.map((x) => x.provider)));
});

test('worrying listing runs all three new checks, and Jev sees the evidence', async () => {
  const net = fakeNet(0.8);
  const text = SCAM + ' Located at 9 Risky Avenue, Dallas, TX 75201. Beautiful sunny apartment, owner abroad, wire deposit today.';
  await scoreListing({ text, price: 650, median: 1800, images: ['https://i/risky.jpg'] }, FULL_ENV, net.fetch);
  const providers = net.runs.map((x) => x.provider);
  for (const p of ['serpapi', 'rentcast', 'serper']) assert.ok(providers.includes(p), 'missing ' + p);
  assert.equal(net.jev, 2, 'Jev should be asked twice: before and after evidence');
  assert.match(net.states[1], /ZZ_FOUND_42/);      // second pass carries the evidence
  assert.doesNotMatch(net.states[0], /ZZ_FOUND_42/); // first pass does not
});

test('worst-case spend per risky listing stays under 11 cents', async () => {
  const price = { 'serpapi': 0.015, 'rentcast': 0.0814, 'serper': 0.0033, 'pdl': 0 };
  const net = fakeNet(0.8);
  await scoreListing({ text: SCAM + ' 5 Cost Court, Denver, CO 80201. A lovely home with a garden and parking space.', price: 650, median: 1800, images: ['https://i/cost.jpg'] }, FULL_ENV, net.fetch);
  const total = net.runs.reduce((a, r) => a + (price[r.provider] ?? 0.05), 0);
  assert.ok(total < 0.11, 'spend was $' + total.toFixed(4));
});

// ---- lazy-loaded photos: an unreadable photo is NOT "no photo" ----
test('state tells apart a missing photo from one it could not read', () => {
  const photo = score.buildState({ text: 'x', price: 1, median: 2, images: ['https://a/b.jpg'] });
  const none = score.buildState({ text: 'x', price: 1, median: 2 });
  const unreadable = score.buildState({ text: 'x', price: 1, median: 2, photoUnknown: true });
  assert.match(photo, /1 photo link\(s\) found/);
  assert.match(none, /none - the ad shows no photo of the home/);
  assert.match(unreadable, /unknown - the card shows a picture but its address could not be read/);
  assert.doesNotMatch(unreadable, /none - the ad shows no photo/);
});

test('the photoUnknown flag reaches the text Jev is shown', async () => {
  const net = fakeNet(0.8);
  await score.scoreListing({ text: SCAM, price: 650, median: 1800, photoUnknown: true }, FULL_ENV, net.fetch);
  assert.match(net.states[0], /unknown - the card shows a picture/);
});

function call(port, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, host: '127.0.0.1', method, path, headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test('relay http: health, score, origin check, validation', async () => {
  delete process.env.TYPESAFE_API_KEY;
  delete process.env.GLASSER_API_KEY;
  delete process.env.JEV_PROVIDER;
  delete process.env.JEV_ENDPOINT;
  const s = server().listen(0, '127.0.0.1');
  await new Promise((r) => s.once('listening', r));
  const port = s.address().port;
  try {
    assert.equal((await call(port, 'GET', '/health')).status, 200);
    const ok = await call(port, 'POST', '/score', { text: SCAM, price: 650, median: 1800 });
    assert.equal(ok.status, 200);
    assert.equal(JSON.parse(ok.body).verdict, 'scam');
    assert.equal((await call(port, 'POST', '/score', { text: 'x' })).status, 422);
    assert.equal((await call(port, 'POST', '/score', { text: SCAM }, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await call(port, 'POST', '/score', { text: SCAM }, { Origin: 'chrome-extension://abc' })).status, 200);
    assert.equal((await call(port, 'GET', '/demo')).status, 200);
  } finally { s.close(); }
});
