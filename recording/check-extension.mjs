// Loads the unpacked extension into the running Chrome, opens the demo page,
// scrolls, and saves screenshots to out/. Usage: node recording/check-extension.mjs
import fs from 'node:fs';
import path from 'node:path';
import { connect, sleep } from './cdp.mjs';

const ext = path.resolve('extension');
const outDir = path.resolve('out');
fs.mkdirSync(outDir, { recursive: true });

const browser = await connect();
const loaded = await browser.send('Extensions.loadUnpacked', { path: ext });
console.log('extension id:', loaded.id);

const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
const page = (m, p) => browser.send(m, p, sessionId);
await page('Emulation.setDeviceMetricsOverride', { width: 1000, height: 800, deviceScaleFactor: 1, mobile: false });
await page('Page.enable');
await page('Page.navigate', { url: 'http://127.0.0.1:8790/demo' });
await sleep(3000);

const count = async () => (await page('Runtime.evaluate', {
  expression: `JSON.stringify({badges: document.querySelectorAll('.scam-badge').length, stamps: document.querySelectorAll('.scam-stamp').length, texts: [...document.querySelectorAll('.scam-badge')].map(b=>b.textContent)})`,
  returnByValue: true,
})).result.value;

for (let i = 0; i < 4; i++) {
  console.log('scroll', i, await count());
  const shot = await page('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, `ext-${i}.png`), Buffer.from(shot.data, 'base64'));
  await page('Runtime.evaluate', { expression: 'window.scrollBy(0, 700)' });
  await sleep(1500);
}
console.log('final', await count());
process.exit(0);
