// Vygeneruje PWA ikony z assets/cards/bang_bandita.webp na saloonovom pozadi.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const logo = pathToFileURL(path.join(root, 'assets/cards/bang_bandita.webp')).href;
const out = path.join(root, 'apps/web/public/icons');

const html = (size, pad) => `<!doctype html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;
background:radial-gradient(circle at 50% 38%, #5c391d 0%, #2a1a0f 55%, #17100b 100%);overflow:hidden">
<img src="${logo}" style="width:${size * (1 - 2 * pad)}px;filter:drop-shadow(0 ${size * 0.02}px ${size * 0.03}px rgba(0,0,0,.6))"></body>`;

const jobs = [
  ['icon-192.png', 192, 0.12],
  ['icon-512.png', 512, 0.12],
  ['icon-maskable-512.png', 512, 0.22],
  ['apple-touch-icon.png', 180, 0.12],
];
const browser = await chromium.launch();
for (const [file, size, pad] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(html(size, pad));
  await page.waitForLoadState('load');
  await page.waitForFunction(() => document.images[0].complete);
  await page.screenshot({ path: path.join(out, file) });
  await page.close();
}
await browser.close();
console.log('ikony hotove');
