// Hlas v dvoch prehliadacoch s falosnym mikrofonom (Playwright, Chromium): npm run test:voice:e2e
//  1) desktop: WebRTC spojenie vznikne, zvuk tecie cez Web Audio, stlmenie a posuvnik hlasitosti
//  2) iPhone (UA): zvuk hra priamo prehravac (nie je pozastaveny ani stlmeny), posuvnik hlasitosti sa neukazuje
//  3) vypadok spojenia: hlas sa po navrate sam pripoji (appka v pozadi na iPhone)
// Treba zostaveny web: npm run build. Server sa spusti sam (PORT, predvolene 3931). Chromium: PLAYWRIGHT_CHROMIUM alebo predvoleny z Playwrightu.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT ?? 3931), URL = `http://localhost:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn('node', ['--import', 'tsx', 'apps/server/src/index.ts'], { env: { ...process.env, PORT: String(PORT), TRUST_PROXY_HOPS: '1', DATA_DIR: '', IDLE_MS: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
let srvLog = ''; srv.stdout.on('data', d => { srvLog += d; }); srv.stderr.on('data', d => { srvLog += d; });
for (let i = 0; i < 100; i++) { try { await fetch(URL); break; } catch { await sleep(150); } }

const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const exe = process.env.PLAYWRIGHT_CHROMIUM;
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
let fails = 0; const ok = (c, m) => { console.log(c ? 'OK  ' : 'FAIL', m); if (!c) fails++; };
let ip = 1;
const newPage = async (ua, { stuckCtx = false } = {}) => {
  const c = await browser.newContext({ viewport: { width: 1400, height: 900 }, userAgent: ua, locale: 'sk-SK', permissions: ['microphone'], extraHTTPHeaders: { 'X-Forwarded-For': `10.8.0.${ip++}` } });
  await c.addInitScript(stuck => {
    window.__pcs = [];
    const RPC = window.RTCPeerConnection;
    window.RTCPeerConnection = function (...a) { const pc = new RPC(...a); window.__pcs.push(pc); return pc; };
    window.RTCPeerConnection.prototype = RPC.prototype;
    // simulacia iOS: zvukovy kontext zostane pozastaveny a resume() mimo klepnutia nezaberie
    if (stuck) { AudioContext.prototype.resume = () => Promise.resolve(); Object.defineProperty(AudioContext.prototype, 'state', { get: () => 'suspended' }); }
  }, stuckCtx);
  const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); return p;
};
const click = async (loc, t = 4000) => { try { await loc.first().click({ timeout: t }); return true; } catch { return false; } };

/** Dvaja hraci v lobby, obaja v hlase, panel hracov otvoreny. */
async function pair(uaA, uaB, who = ['Anna', 'Boris'], optsA = {}) {
  const A = await newPage(uaA, optsA), B = await newPage(uaB);
  await A.goto(`${URL}/?voicedebug=1`, { waitUntil: 'networkidle' });
  await A.getByPlaceholder(/prezývku/).fill(who[0]);
  await click(A.getByRole('button', { name: /Otvoriť nový stôl/ })); await sleep(800);
  const code = (await A.locator('.code-big').first().innerText()).trim();
  await B.goto(`${URL}/?voicedebug=1`, { waitUntil: 'networkidle' });
  await B.getByPlaceholder(/prezývku/).fill(who[1]);
  await B.locator('input').last().fill(code);
  await click(B.getByRole('button', { name: /Pridať sa|Vstúpiť|Pripojiť/i }));
  await sleep(800);
  await click(A.locator('.vc__mic')); await click(B.locator('.vc__mic'));
  await sleep(500);
  for (const p of [A, B]) await click(p.locator('.vc__people'));
  return { A, B, code };
}
const dbg = p => p.locator('.vc__debug').innerText().catch(() => '');
/** Pocka, kym debug panel splni podmienku (regex), a vrati jeho text. */
async function until(p, re, ms = 25000) {
  const t0 = Date.now(); let txt = '';
  while (Date.now() - t0 < ms) { txt = await dbg(p); if (re.test(txt)) return txt; await sleep(500); }
  return txt;
}

try {
  // ---- 1) desktop ----
  {
    const { A, B } = await pair(DESKTOP, DESKTOP, ['Anna', 'Boris']);
    const a = await until(A, /Boris: live webaudio/);
    ok(/Boris: live webaudio/.test(a), 'desktop: spojenie vzniklo a zvuk ide cez Web Audio  [' + a.replace(/\n/g, ' | ') + ']');
    ok(/ctx running/.test(a), 'desktop: zvukový kontext beží');
    let pk = 0;
    for (let i = 0; i < 30 && pk < 20; i++) { pk = await A.evaluate(async () => { let n = 0; for (const pc of window.__pcs) (await pc.getStats()).forEach(r => { if (r.type === 'inbound-rtp' && r.kind === 'audio') n += r.packetsReceived; }); return n; }); if (pk < 20) await sleep(500); }
    ok(pk >= 20, 'desktop: od súpera reálne prichádzajú zvukové pakety (' + pk + ')');
    const a2 = await until(A, /Boris: live webaudio (direct|relay)/, 12000);
    ok(/Boris: live webaudio direct/.test(a2), 'desktop: diagnostika ukazuje typ cesty (na localhoste priamo)  [' + a2.replace(/\n/g, ' | ') + ']');
    ok((await A.locator('.vc__range').count()) > 0, 'desktop: posuvník hlasitosti je k dispozícii');
    ok((await A.locator('.vc-banner').count()) === 0, 'desktop: banner "Klepni" sa neukazuje');
    await B.context().close(); await A.context().close();
  }

  // ---- 2) iPhone ----
  {
    const { A, B } = await pair(IPHONE, DESKTOP, ['Iva', 'Boris']);
    const a = await until(A, /Boris: live element/);
    ok(/ios true/.test(a), 'iPhone: rozpoznaný ako iOS');
    ok(/Boris: live element/.test(a) && !/PAUSED/.test(a), 'iPhone: zvuk hrá priamo prehrávač a nie je pozastavený  [' + a.replace(/\n/g, ' | ') + ']');
    const au = await A.evaluate(() => { const x = document.querySelector('audio'); return x ? { muted: x.muted, paused: x.paused, ph: x.hasAttribute('playsinline') } : null; });
    ok(au && !au.muted && !au.paused && au.ph, 'iPhone: <audio> je nestlmený, hrá a má playsinline  ' + JSON.stringify(au));
    ok((await A.locator('.vc__range').count()) === 0, 'iPhone: posuvník hlasitosti (nefunguje na iOS) sa neukazuje');
    ok((await A.locator('.vc__roster li button').count()) > 0, 'iPhone: stlmenie hráča ostáva');
    await click(A.locator('.vc__roster li button').first()); await sleep(300);
    ok(await A.evaluate(() => document.querySelector('audio').muted === true), 'iPhone: stlmenie hráča stlmí prehrávač');
    await click(A.locator('.vc__roster li button').first()); await sleep(300);
    ok(await A.evaluate(() => document.querySelector('audio').muted === false), 'iPhone: zrušenie stlmenia ho zase zapne');
    await B.context().close(); await A.context().close();
  }

  // ---- 3) samolieciba: Web Audio sa nerozbehne (iOS) -> po par sekundach hra prehravac ----
  {
    const { A, B } = await pair(DESKTOP, DESKTOP, ['Gabo', 'Hana'], { stuckCtx: true });
    const a = await until(A, /Hana: live element/, 20000);
    ok(/ctx suspended/.test(a) && /Hana: live element/.test(a), 'samoliečba: pozastavený kontext > zvuk sa sám prepne na prehrávač  [' + a.replace(/\n/g, ' | ') + ']');
    ok(await A.evaluate(() => { const x = document.querySelector('audio'); return !!x && !x.muted && !x.paused; }), 'samoliečba: prehrávač hrá nestlmený');
    await B.context().close(); await A.context().close();
  }

  // ---- 4) vypadok spojenia a navrat ----
  {
    const { A, B } = await pair(DESKTOP, DESKTOP, ['Dana', 'Emil']);
    await until(A, /Emil: live/);
    const ctxA = A.context();
    await ctxA.setOffline(true);
    let dropped = false;
    for (let i = 0; i < 90 && !dropped; i++) { dropped = (await A.locator('.vc-banner--note').count()) > 0 || (await A.locator('.vc__mic').getAttribute('aria-pressed')) === 'false'; if (!dropped) await sleep(1000); }
    ok(dropped, 'výpadok: klient zistí prerušenie a hlas sa lokálne zatvorí (banner "Pripájam znova")');
    await ctxA.setOffline(false);
    let back = false;
    for (let i = 0; i < 60 && !back; i++) { back = (await A.locator('.vc__mic').getAttribute('aria-pressed')) === 'true' && /Emil: live/.test(await dbg(A)); if (!back) await sleep(1000); }
    ok(back, 'návrat: hlas sa po obnovení spojenia pripojil sám a spojenie s Emilom je znova živé');
    ok((await A.locator('.vc-banner--note').count()) === 0, 'návrat: banner "Pripájam znova" zmizol');
    await B.context().close(); await A.context().close();
  }
  // ---- 5) iPhone: system ticho vypne mikrofon (stopa "live", ale muted) -> straz ho sama ziska znova ----
  {
    const { A, B } = await pair(DESKTOP, DESKTOP, ['Jano', 'Kamil']);
    await until(A, /Kamil: live/, 15000);
    await A.evaluate(() => {
      const g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      window.__gum = 0;
      navigator.mediaDevices.getUserMedia = async c => { const s = await g(c); window.__gum++; s.getAudioTracks().forEach(t => { t.__fresh = true; }); return s; };
      const d = Object.getOwnPropertyDescriptor(MediaStreamTrack.prototype, 'muted');
      Object.defineProperty(MediaStreamTrack.prototype, 'muted', { get() { return window.__sysMute && !this.__fresh ? true : d.get.call(this); } });
      window.__sysMute = true;
    });
    const m1 = await until(A, /SYSTEM-MUTED/, 5000);
    ok(/mic live SYSTEM-MUTED/.test(m1), 'strážca mikrofónu: panel ukáže, že systém mikrofón vypol  [' + m1.replace(/\n/g, ' | ') + ']');
    let revived = false;
    for (let i = 0; i < 20 && !revived; i++) { revived = (await A.evaluate(() => window.__gum)) >= 1 && !/SYSTEM-MUTED/.test(await dbg(A)); if (!revived) await sleep(500); }
    ok(revived, 'strážca mikrofónu: po ~2,5 s získa mikrofón znova a stopa už nie je ticho vypnutá');
    ok(/Kamil: live/.test(await dbg(A)), 'strážca mikrofónu: spojenie s druhým hráčom ostalo živé');
    await B.context().close(); await A.context().close();
  }
} catch (e) {
  console.error('VYNIMKA', e);
  fails++;
}
console.log(fails ? `FAILED ${fails}` : 'ALL OK');
if (fails) console.log(srvLog.slice(-1500));
await browser.close(); srv.kill();
process.exit(fails ? 1 : 0);
