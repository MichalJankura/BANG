// Mobilne screenshoty a hra proti botom na emulovanych zariadeniach (Playwright, Chromium).
//   node tools/mobile-e2e.mjs [--url http://localhost:3101] [--only se,se-land] [--full se] [--out docs/mobile-shots]
// Server treba spustit s TRUST_PROXY_HOPS=1 (kazdy kontext dostane vlastnu IP, aby sa nenarazalo na limity):
//   TRUST_PROXY_HOPS=1 BOT_DELAY=250 IDLE_MS=0 PORT=3101 npm start
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
const URL = arg('url', 'http://localhost:3101');
const OUT = path.resolve(arg('out', 'docs/mobile-shots'));
const ONLY = arg('only', '')?.split(',').filter(Boolean);
const FULL = arg('full', 'se').split(',');   // na ktorych zariadeniach sa odohra cela hra
const MAX_TICKS = Number(arg('ticks', 70));  // na ostatnych sa hra len rozohra

const P = devices['iPhone SE'], P15 = devices['iPhone 15'], PX = devices['Pixel 7'], PAD = devices['iPad Mini'], PRO = devices['iPad Pro 11'];
const LIST = [
  ['se', P, 375, 667], ['se-land', P, 667, 375],
  ['a360', PX, 360, 800], ['a360-land', PX, 800, 360],
  ['i15', P15, 393, 852], ['i15-land', P15, 852, 393],
  ['i15pm', P15, 430, 932], ['i15pm-land', P15, 932, 430],
  ['ipad-mini', PAD, 768, 1024], ['ipad-mini-land', PAD, 1024, 768],
  ['ipad-air', PRO, 820, 1180], ['ipad-air-land', PRO, 1180, 820],
  ['ipad-pro', PRO, 1024, 1366], ['ipad-pro-land', PRO, 1366, 1024],
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
let ipSeq = 10;

async function audit(page) {
  return page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const issues = [];
    const sw = document.documentElement.scrollWidth;
    if (sw > vw + 1) issues.push(`vodorovne pretecenie: scrollWidth ${sw} > ${vw}`);
    const inScroller = el => !!el.closest('.ph-strip, .gb-hand, .arrange-row, .dr, .ph-modal__sheet, .ph-sheet, .choices, .pv__body');
    const small = [], clipped = [], tiny = new Map();
    for (const el of document.querySelectorAll('button, a[href], input, [role=button]')) {
      if (el.closest('[hidden], [aria-hidden=true]') || el.tabIndex === -1 && el.tagName === 'INPUT') continue;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
      const label = (el.getAttribute('aria-label') || el.textContent || el.className).trim().slice(0, 28);
      const off = r.right < 0 || r.left > vw || r.bottom < 0 || r.top > vh;
      if (!off && (r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1) && !inScroller(el)) clipped.push(`${label} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
      if (!off && (r.width < 43.5 || r.height < 43.5) && !el.disabled && !el.closest('.dr:not(.is-open)')) small.push(`${label} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (!el || el.closest('.sr-only, .dr:not(.is-open), [aria-hidden=true]')) continue;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (!r.width || cs.visibility === 'hidden' || cs.display === 'none') continue;
      const fs = parseFloat(cs.fontSize) * (el.closest('.bang-stage') ? (parseFloat(getComputedStyle(el.closest('.bang-stage')).getPropertyValue('--k')) || 1) : 1);
      if (fs < 12) tiny.set(`${el.className || el.tagName}`.slice(0, 40), Math.round(fs * 10) / 10);
    }
    if (clipped.length) issues.push('orezane ovladacie prvky: ' + clipped.slice(0, 6).join('; '));
    return { issues, small: small.slice(0, 12), smallCount: small.length, tiny: [...tiny.entries()].slice(0, 10) };
  });
}

async function run(name, base, w, h, full) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...base, viewport: { width: w, height: h }, screen: { width: w, height: h },
    extraHTTPHeaders: { 'X-Forwarded-For': `10.7.${ipSeq++}.${Math.floor(Math.random() * 200) + 1}` },
    locale: 'sk-SK', reducedMotion: 'no-preference',
  });
  const page = await ctx.newPage();
  const dir = path.join(OUT, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
  const report = { device: `${name} ${w}x${h}`, shots: {}, errors: [], moves: 0, finished: false };
  const seen = new Set();
  let n = 0;
  page.on('pageerror', e => report.errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) report.errors.push('console: ' + m.text().slice(0, 160)); });

  const shot = async (key, force = false) => {
    if (seen.has(key) && !force) return;
    seen.add(key);
    await sleep(450);
    const file = `${String(++n).padStart(2, '0')}-${key.replace(/[^a-z0-9-]+/gi, '_').slice(0, 40)}.png`;
    await page.screenshot({ path: path.join(dir, file) });
    report.shots[file] = await audit(page);
  };
  const trace = [];
  const tap = async (loc, ms = 2500) => { trace.push(String(loc).slice(0, 90)); if (trace.length > 12) trace.shift(); try { await loc.first().tap({ timeout: ms }); return true; } catch { return false; } };
  const has = async sel => (await page.locator(sel).count()) > 0;
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const center = async loc => { const b = await loc.first().boundingBox(); return b && { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };

  // ---------- uvod ----------
  await page.goto(URL, { waitUntil: 'networkidle' });
  await shot('home');
  await page.getByPlaceholder(/prezývku/).fill('Pecos Pete');
  await shot('home-filled');
  await tap(page.getByRole('button', { name: /Otvoriť nový stôl/ }));
  await page.waitForSelector('.ph-lobby, .felt-code', { timeout: 8000 });
  await shot('lobby-solo');
  for (let i = 0; i < 4; i++) { await tap(page.getByRole('button', { name: 'Pridaj bota' })); await sleep(150); }
  await shot('lobby-full');
  await tap(page.getByRole('button', { name: 'Začni hru' }));

  // ---------- hra ----------
  let ticks = 0, plays = 0, lastTurnKey = '', stuck = 0, pressDone = false, drawerDone = false, dragDone = false;
  const limit = full ? 4000 : MAX_TICKS;
  while (ticks++ < limit) {
    await sleep(full ? 260 : 380);
    const gameUp = await has('.gb');
    const setupUp = await has('.setup');

    if (setupUp) {
      const choose = await has('.char-choice');
      if (choose) { await shot('setup-choose'); await tap(page.locator('.char-choice .bang-btn--primary')); continue; }
      const cards = page.locator('.setup-card:not([disabled])');
      if (await has('.setup-grid.roles')) {
        await shot('setup-roles');
        await tap(cards);
        await sleep(300);
        await shot('setup-roles-picked');
      } else {
        await shot('setup-chars');
        await tap(cards);
        await sleep(350);
        await shot('setup-chars-flipped');
      }
      continue;
    }
    if (!gameUp) {
      if (seen.has('game-myturn') && await has('.ph-lobby, .felt-code')) { report.errors.push('hra sa vratila do lobby, posledne kroky: ' + trace.join(' | ')); break; }
      continue;
    }

    const prompt = page.locator('.bang-prompt');
    if (await prompt.count()) {
      const kicker = ((await page.locator('.bang-prompt__kicker').first().textContent()) || '').trim();
      const key = 'poster-' + kicker.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (/Koniec hry/.test(kicker)) { await shot('game-over'); report.finished = true; break; }
      if (await has('.arrange-row')) {
        await shot(key);
        if (!dragDone) {
          dragDone = true;
          const cards = page.locator('.arrange-card');
          const cnt = await cards.count();
          if (cnt > 1) {
            const a = await center(cards.nth(0)), b = await center(cards.nth(cnt - 1));
            await touch('touchStart', a.x, a.y);
            for (let s = 1; s <= 14; s++) { await touch('touchMove', a.x + (b.x - a.x) * s / 14, a.y); await sleep(24); }
            await shot('arrange-dragging', true);
            await touch('touchEnd');
            await sleep(250);
            await shot('arrange-dropped', true);
          }
        }
        await tap(page.locator('.bang-btn--defend'));
        report.moves++;
        continue;
      }
      await shot(key);
      if (await has('.steal-card')) { await tap(page.locator('.steal-card')); report.moves++; continue; }
      if (await has('.choices .choice:not([disabled])')) {
        const kit = /Kit Carlson/.test(kicker);
        if (kit) {
          const ch = page.locator('.choices .choice');
          await tap(ch.nth(0)); await tap(ch.nth(1));
          await shot('poster-kit-chosen', true);
          await tap(page.locator('.bang-prompt .bang-btn--primary:not([disabled])'));
        } else await tap(page.locator('.choices .choice:not([disabled])'));
        report.moves++;
        continue;
      }
      const defend = page.locator('.bang-prompt .bang-btn--defend:not([disabled])');
      const primary = page.locator('.bang-prompt .bang-btn--primary:not([disabled])');
      if (await defend.count()) await tap(defend);
      else if (await primary.count()) await tap(primary);
      else await tap(page.locator('.bang-prompt .bang-btn--on-paper').last());
      report.moves++;
      continue;
    }

    // vyber ciela
    const target = page.locator('.opp[data-state~="inrange"]:not([disabled]), .bang-seat[data-state~="inrange"]:not([disabled])');
    if (await target.count()) {
      await shot('game-target');
      await tap(target); report.moves++; continue;
    }
    // odhadzovanie
    const confirm = page.getByRole('button', { name: /Potvrď odhodenie/ });
    if (await confirm.count()) {
      await shot('game-discard');
      if (await confirm.first().isDisabled()) await tap(page.locator('.gb-hand .bang-card:not(.is-discard)'));
      else { await tap(confirm); report.moves++; }
      continue;
    }
    const end = page.getByRole('button', { name: 'Ukonči ťah' });
    if (await end.count()) {
      const key = await page.locator('.gb-banner .t-banner').first().textContent();
      if (key !== lastTurnKey) { lastTurnKey = key; plays = 0; }
      await shot('game-myturn');
      if (!drawerDone) {
        drawerDone = true;
        await tap(page.locator('button[aria-label="Denník a hráči"]'));
        await shot('drawer-log', true);
        await page.keyboard.press('Escape'); await sleep(350);
        await tap(page.locator('button[aria-label="Moja postava a rola"]'));
        await shot('drawer-me', true);
        await page.keyboard.press('Escape'); await sleep(350);
      }
      const playable = page.locator('.gb-hand .bang-card.is-playable');
      if (plays < 4 && (await playable.count())) {
        plays++;
        if (!pressDone) {
          pressDone = true;
          const c = await center(playable.first());
          await touch('touchStart', c.x, c.y);
          await sleep(650);
          await shot('card-preview-longpress', true);
          await touch('touchEnd');
          await sleep(200);
          await tap(page.locator('.pv__close'));
          await sleep(300);
        }
        await tap(playable.first());
        await sleep(250);
        await shot('hand-selected');
        const play = page.locator('.bang-btn--play');
        if (await play.count()) await tap(play); else await tap(playable.first());
        report.moves++;
        continue;
      }
      await tap(end); report.moves++;
      continue;
    }
    await shot('game-waiting');
    stuck++;
  }
  await shot('final', true);
  report.ticks = ticks;
  await browser.close();
  return report;
}

const reports = [];
for (const [name, base, w, h] of LIST) {
  if (ONLY?.length && !ONLY.includes(name)) continue;
  const t0 = Date.now();
  try {
    const r = await run(name, base, w, h, FULL.includes(name));
    r.seconds = Math.round((Date.now() - t0) / 1000);
    reports.push(r);
    const bad = Object.values(r.shots).flatMap(s => s.issues);
    console.log(`${r.device}: ${Object.keys(r.shots).length} screenshotov, ${r.moves} tahov, hra dokoncena: ${r.finished}, chyby: ${r.errors.length}, problemy layoutu: ${bad.length} (${r.seconds}s)`);
  } catch (e) {
    console.log(`${name}: CHYBA ${e.message.split('\n')[0]}`);
    reports.push({ device: name, fatal: e.message });
  }
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(reports, null, 2));
