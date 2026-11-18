// Spusti po npm run build. Krátke lehoty izolovaného servera umožnia overiť aj uspatie karty.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { chromium } from 'playwright';
import { io } from 'socket.io-client';

const port = 3945;
const url = `http://localhost:${port}`;
const grace = 700;
const server = spawn(process.execPath, ['apps/server/dist/index.mjs'], {
  windowsHide: true,
  env: { ...process.env, PORT: String(port), DATA_DIR: '', UPSTASH_REDIS_REST_URL: '', RECONNECT_MS: String(grace), LOBBY_GRACE_MS: String(grace), BOT_DELAY: '100', IDLE_MS: '1300' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
let browser, browserProcess, observer;
async function until(condition, message, ms = 15000) {
  const end = Date.now() + ms;
  while (!await condition()) { assert.ok(Date.now() < end, message); await wait(75); }
}
try {
  let ready = false;
  server.stdout.on('data', chunk => { if (String(chunk).includes('BANG! server:')) ready = true; });
  await until(() => ready || server.exitCode !== null, 'Server sa nespustil');
  assert.ok(ready);
  const agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36';
  // Bežný Playwright drží všetky karty vo fokuse. Samostatný testovací profil musí dostať reálne zmeny viditeľnosti.
  browserProcess = await chromium.launchServer({
    channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : 'chromium'),
    args: ['--remote-debugging-port=3946', `--user-agent=${agent}`],
  });
  browser = await chromium.connectOverCDP('http://127.0.0.1:3946', { noDefaults: true });
  const [context] = browser.contexts();
  const game = await context.newPage();
  const cdp = await context.newCDPSession(game);
  await game.addInitScript(() => {
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(...args) {
        super(...args);
        if (String(args[0]).includes('/socket.io/')) window.gameTransport = this;
      }
    };
  });
  await game.goto(url);
  await game.getByPlaceholder(/prezývku/).fill('Čakajúci hráč');
  await game.getByRole('button', { name: /Otvoriť nový stôl/ }).click();
  const code = (await game.locator('.code-big').innerText()).trim();
  observer = io(url, { auth: { token: randomBytes(16).toString('hex') }, extraHeaders: { 'User-Agent': agent } });
  let room, view;
  observer.on('room', value => { room = value; });
  observer.on('view', value => { view = value; });
  const act = async (event, ...args) => assert.equal((await observer.timeout(5000).emitWithAck(event, ...args)).ok, true);
  await act('join', { code, name: 'Spoluhráč' });
  const id = room.host;
  const player = () => room.players.find(p => p.id === id);

  const tabPromise = context.waitForEvent('page');
  await game.evaluate(() => window.open('about:blank', '_blank') !== null);
  const tab = await tabPromise;
  const windowPromise = context.waitForEvent('page');
  await cdp.send('Target.createTarget', { url: 'data:text/html,<title>In%C3%A1 str%C3%A1nka</title>', newWindow: true });
  const win = await windowPromise;
  await win.bringToFront();
  await win.close();
  await tab.bringToFront();
  await until(() => game.evaluate(() => document.hidden), 'Karta hry musí byť skutočne skrytá');
  await wait(grace * 2);
  assert.equal(player().connected, true);
  assert.equal(room.host, id);
  console.log('Prepnutie na inú kartu a do ďalšieho okna zachovalo živé spojenie aj miesto zakladateľa.');

  async function suspendAndReturn() {
    await tab.bringToFront();
    await until(() => game.evaluate(() => document.hidden), 'Hra nie je na pozadí');
    await context.setOffline(true);
    await game.evaluate(() => window.gameTransport.close());
    await until(() => player()?.connected === false, 'Spoluhráč nevidí prerušené spojenie');
    await wait(grace * 2);
    assert.ok(player() && !player().bot, 'Po vypršaní lehoty má miesto stále patriť človeku');
    await context.setOffline(false);
    await game.bringToFront();
    await until(() => player()?.connected && !player().bot, 'Pôvodný hráč sa nevrátil');
    assert.equal(room.code, code);
    assert.equal(room.players.filter(p => p.name === 'Čakajúci hráč').length, 1);
  }
  await suspendAndReturn();
  assert.equal(room.host, room.me);
  observer.emit('addBot');
  observer.emit('addBot');
  await until(() => room.players.length === 4, 'Stôl sa nedoplnil botmi');
  await act('start');
  await game.locator('.gb').waitFor({ timeout: 30000 });
  await until(() => view?.turn && view.turn.player !== id && !view.winner, 'Hráč nečaká na ťah iného hráča');
  await suspendAndReturn();
  await game.locator('.gb').waitFor();
  await game.getByRole('button', { name: 'Opustiť hru', exact: true }).click();
  await game.getByRole('button', { name: 'Zostať v hre' }).click();
  await context.setOffline(true);
  await game.evaluate(() => window.gameTransport.close());
  await game.getByRole('button', { name: 'Odísť z hry', exact: true }).click();
  await context.setOffline(false);
  await game.goto(url);
  await until(() => player()?.bot, 'Po potvrdenom odchode má miesto prevziať bot');
  console.log('Návrat po výpadku nad lehotu zachoval rovnaké ID v lobby aj v hre. Výslovný odchod počas výpadku prenechal miesto botovi.');
} finally {
  observer?.close();
  await browser?.close();
  await browserProcess?.close();
  server.kill();
}
