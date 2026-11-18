// Spusti proti lokálnej vývojovej inštancii: node tools/rules-tab-e2e.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const game = await context.newPage();
  await game.goto('http://localhost:5173/');
  await game.getByPlaceholder(/prezývku/).fill('Test pravidiel');
  await game.getByRole('button', { name: /Otvoriť nový stôl/ }).click();
  const addBot = game.getByRole('button', { name: 'Pridaj bota' });
  for (let i = 0; i < 3; i++) await addBot.click();
  await game.getByRole('button', { name: 'Začni hru' }).click();
  await game.locator('.setup').waitFor();
  for (let n = 0; n < 100 && !await game.locator('.gb').count(); n++) {
    const choice = game.locator('.char-choice .bang-btn--primary, .setup-card:not(:disabled)').first();
    if (await choice.isVisible()) await choice.click({ timeout: 750 }).catch(() => {});
    await game.waitForTimeout(150);
  }
  await game.locator('.gb').waitFor();
  const netUrl = await game.evaluate(() => performance.getEntriesByType('resource')
    .find(e => new URL(e.name).pathname === '/src/net.ts').name);
  const connection = () => game.evaluate(async url => (await import(url)).socket.id, netUrl);
  const original = await connection();
  assert.ok(original);
  // Rovnaká stránka pravidiel ako v dialógu chybného ťahu, dostupná pri ľubovoľnom rozdaní.
  const [rules] = await Promise.all([
    game.waitForEvent('popup'),
    game.getByRole('link', { name: 'Pravidlá hry', exact: true }).click(),
  ]);
  await rules.locator('.ch-nav').waitFor();
  for (const route of ['#/pravidla', '#/pravidla/gold-rush', '#/postavy']) {
    await rules.evaluate(hash => { location.hash = hash; }, route);
    await rules.evaluate(() => window.dispatchEvent(new Event('online')));
    await rules.waitForTimeout(200);
  }
  assert.equal(await rules.evaluate(() => performance.getEntriesByType('resource')
    .some(e => new URL(e.name).pathname.startsWith('/socket.io/'))), false);
  await rules.close();
  await game.bringToFront();
  await game.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  assert.equal(await connection(), original);
  const room = await game.evaluate(() => localStorage.getItem('bang.code'));
  assert.ok(room);
  // Reálny výpadok transportu musí naďalej obnoviť miesto pri rovnakom stole.
  const restored = await game.evaluate(async url => {
    const { socket } = await import(url);
    const joined = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Miesto pri stole sa neobnovilo')), 10000);
      socket.once('room', lobby => { clearTimeout(timer); resolve(lobby.code); });
    });
    socket.io.engine.close();
    return joined;
  }, netUrl);
  assert.equal(restored, room);
  assert.notEqual(await connection(), original);
  await game.locator('.gb').waitFor();
  console.log('Pravidlá neprevzali spojenie a po výpadku sa hráč vrátil k stolu.');
} finally {
  await browser.close();
}
