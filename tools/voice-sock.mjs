// Socket test signalizacie hlasu a chatu (server sa spusti sam): npm run test:voice:sock
import { io } from 'socket.io-client';
import { spawn } from 'node:child_process';
const PORT = Number(process.env.PORT ?? 3911), URL = `http://localhost:${PORT}`;
const srv = spawn('node', ['--import', 'tsx', 'apps/server/src/index.ts'], { env: { ...process.env, PORT: String(PORT), TRUST_PROXY_HOPS: '1', DATA_DIR: '', IDLE_MS: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 100; i++) { try { await fetch(URL); break; } catch { await wait(150); } }
const done = (code) => { srv.kill(); process.exit(code); };
const tok = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
const mk = (ip, token = tok()) => io(URL, { auth: { token }, extraHeaders: { 'X-Forwarded-For': ip, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36' }, transports: ['websocket'] });
const call = (s, ev, ...a) => new Promise(r => s.emit(ev, ...a, x => r(x ?? {})));
let fails = 0; const ok = (c, m) => { console.log(c ? 'OK  ' : 'FAIL', m); if (!c) fails++; };
const A = mk('10.9.0.1'), B = mk('10.9.0.2'), C = mk('10.9.0.3'), D = mk('10.9.0.4');
await Promise.all([A, B, C, D].map(s => new Promise(r => s.on('connect', r))));
let roomA = null, rtcB = [], rtcC = [], chatA = [], chatB = [], chatD = [];
A.on('room', r => roomA = r); B.on('chat', m => chatB.push(m)); A.on('chat', m => chatA.push(m));
B.on('rtc', m => rtcB.push(m)); C.on('rtc', m => rtcC.push(m)); D.on('chat', m => chatD.push(m));
const created = await call(A, 'create', { name: 'Anna' });
const code = created.code;
await call(B, 'join', { code, name: 'Boris' }); await call(C, 'join', { code, name: 'Cyril' });
const room2 = await call(D, 'create', { name: 'Dana' });   // iná miestnosť
await wait(200);
const sdp = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
// bez hlasu sa signalizacia zahodi
B.emit('rtc', { to: roomA.players.find(p => p.name === 'Anna').id, t: 'offer', sdp }); 
const idOf = n => roomA.players.find(p => p.name === n).id;
let r = await call(A, 'voice', { on: true });
ok(r.ok && Array.isArray(r.ice) && r.ice[0].urls && Array.isArray(r.peers) && r.peers.length === 0, 'A pripojený do hlasu, dostane ICE a prázdny zoznam');
await wait(150); ok(roomA.players.find(p => p.name === 'Anna').voice === true && !roomA.players.find(p => p.name === 'Boris').voice, 'lobby ukazuje, kto je v hlase');
r = await call(B, 'voice', { on: true });
ok(r.ok && r.peers.length === 1 && r.peers[0] === idOf('Anna'), 'B vidí A v hlase');
const gotA = []; A.on('rtc', m => gotA.push(m));
B.emit('rtc', { to: idOf('Anna'), t: 'offer', sdp }); await wait(150);
ok(gotA.length === 1 && gotA[0].from === idOf('Boris') && gotA[0].t === 'offer' && gotA[0].sdp === sdp, 'ponuka B -> A doručená s pravým odosielateľom');
A.emit('rtc', { to: idOf('Boris'), t: 'answer', sdp }); await wait(150);
ok(rtcB.length === 1 && rtcB[0].t === 'answer', 'odpoveď A -> B doručená');
C.emit('rtc', { to: idOf('Anna'), t: 'offer', sdp }); await wait(100);
ok(gotA.length === 1, 'C (nie je v hlase) nemôže posielať signalizáciu');
B.emit('rtc', { to: idOf('Cyril'), t: 'offer', sdp }); await wait(100);
ok(rtcC.length === 0, 'signalizácia k hráčovi, ktorý nie je v hlase, sa zahodí');
B.emit('rtc', { to: idOf('Anna'), t: 'offer', sdp: 'x'.repeat(9000) }); B.emit('rtc', { to: idOf('Anna'), t: 'bogus', sdp }); B.emit('rtc', { to: idOf('Anna'), t: 'offer', sdp: 'hello world this is not sdp' }); B.emit('rtc', { to: {}, t: 'offer', sdp }); B.emit('rtc', 'x'); await wait(150);
ok(gotA.length === 1, 'zlé alebo príliš veľké SDP a neplatné polia sa zahodia');
const foreign = room2.code; 
B.emit('rtc', { to: 'ffffffff', t: 'offer', sdp }); await wait(100); ok(gotA.length === 1, 'neexistujúci príjemca sa zahodí');
// chat
r = await call(A, 'chat', { text: '  Ahoj   všetci‮\u0007  ' }); await wait(150);
ok(r.ok && chatB.length === 1 && chatB[0].text === 'Ahoj všetci' && chatB[0].from === idOf('Anna') && chatB[0].name === 'Anna', 'chat doručený členom, vyčistený od riadiacich a bidi znakov');
ok(chatA.length === 1, 'odosielateľ dostane vlastnú správu späť');
ok(chatD.length === 0, 'chat nepresiahne miestnosť');
r = await call(A, 'chat', { text: '   ' }); ok(!!r.error, 'prázdna správa sa odmietne');
r = await call(A, 'chat', { text: 'x'.repeat(1000) }); await wait(100); ok(r.ok && chatB[chatB.length - 1].text.length === 300, 'dlhá správa sa skráti na 300 znakov');
r = await call(A, 'chat', 42); ok(!!r.error, 'neplatný typ správy sa odmietne');
const results = []; for (let i = 0; i < 14; i++) results.push(await call(B, 'chat', { text: 'spam ' + i }));
ok(results.some(x => x.error), 'rýchle spamovanie chatu sa obmedzí');
// podvrhnuté pole 'from' sa ignoruje
const before = chatA.length; await wait(10_500);
r = await call(C, 'chat', { text: 'zdravím', from: idOf('Anna'), name: 'Anna' }); await wait(150);
const last = chatA[chatA.length - 1]; ok(last.from === idOf('Cyril') && last.name === 'Cyril', 'odosielateľa určuje server, nie klient');
// odpojenie čistí hlas
B.disconnect(); await wait(300);
ok(!roomA.players.some(p => p.name === 'Boris' && p.voice), 'po odpojení hráč zmizne z hlasu');
r = await call(A, 'voice', { on: false }); await wait(100); ok(r.ok && roomA.players.find(p => p.name === 'Anna').voice === false, 'odchod z hlasu');
// hra nezablokovana limitmi rtc: vela signalizacie neznizi limit beznych eventov
const E = mk('10.9.0.1'); await new Promise(r => E.on('connect', r)); 

// navrat po preruseni (iOS uspi stranku): ten isty token sa vrati do miestnosti a do hlasu sa moze pripojit znova
const T = tok();
const F = mk('10.9.0.6', T), G = mk('10.9.0.7');
await Promise.all([F, G].map(s => new Promise(r => s.on('connect', r))));
let roomF = null; F.on('room', x => roomF = x);
const cr = await call(F, 'create', { name: 'Filip' });
await call(G, 'join', { code: cr.code, name: 'Gita' });
r = await call(F, 'voice', { on: true }); ok(r.ok, 'F v hlase');
r = await call(G, 'voice', { on: true }); ok(r.ok && r.peers.length === 1, 'G v hlase a vidi F');
let roomG = null; G.on('room', x => roomG = x);
F.disconnect(); await wait(400);
ok(roomG && !roomG.players.find(p => p.name === 'Filip')?.voice, 'po odpojeni F je v lobby mimo hlasu (nezostane duch v hlase)');
const F2 = mk('10.9.0.6', T); await new Promise(r => F2.on('connect', r));
r = await call(F2, 'join', { code: cr.code, name: 'Filip' }); ok(r.ok, 'F sa tym istym tokenom vrati do miestnosti: ' + JSON.stringify(r));
r = await call(F2, 'voice', { on: true }); ok(r.ok && r.peers.length === 1 && Array.isArray(r.ice), 'F sa vie do hlasu pripojit znova a vidi G');
F2.disconnect(); G.disconnect();
[A, B, C, D, E].forEach(s => s.disconnect());

console.log(fails ? `FAILED ${fails}` : 'ALL OK');
done(fails ? 1 : 0);
