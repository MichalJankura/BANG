import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CHARACTERS, isBlue, type Card, type Command, type PlayerView, type Winner } from '@bang/engine';
import { GView, Lobby, View, call, finishPendingLeave, leaveRoom, saveCode, savedCode, savedName, sendCmd, socket } from './net';
import { SetupScreen } from './Setup';
import { CharactersPage } from './Characters';
import { RulesPage } from './Rules';
import { Home } from './Home';
import { BookOpen, ChevronDown, IdCard, LogOut, Maximize, ScrollText, Star, UserX, Users } from 'lucide-react';
import { LangSwitch, getLang, useLang } from './i18n';
import { CancelVoiceReconnect, VoiceBanner, VoiceDock, VoiceHeaderButton, VoicePanel } from './VoiceDock';
import { addSystemMessage, syncVoice } from './voice';
import { cardName, charText, handPickName, roleGoal, roleName, trErr } from './i18nData';
import { CardBack, CardInner, CardView, Hp, Icon, Portrait, ROLE_KEY, RoleBadge, cardTitle } from './Cards';
import { seatAngles, type Geo } from './geometry';
import { Countdown, CardPreview, Drawer, HandFan, previewOfCard, type Preview } from './Mobile';
import { HandPanel, Orbit, OppToken, ShelfPanel, orbitPos } from './phone';
import { SeatDetail, type DetailAnchor } from './Table';
import { GoldRushPage } from './GoldRush';
import { FlightLayer, useFlights } from './Flights';
import { SoundSwitch } from './SoundSwitch';
import { useGameSounds } from './sound';
import { EquipView, Gold } from './Cards';
import { equipName, equipText, nuggets } from './i18nData';
import { EQUIP, type CardType, type Equip, type EquipOption, type AbilityInfo, type Why } from '@bang/engine';
import { isCoarse, useLayout, useNarrow, useResumeReconnect, useTooShort, useWakeLock, vibrate } from './device';
import type { Act, JoinAsk } from './appTypes';
import { Poster, Stage } from './Layout';
import { JoinAskDialog, KickDialog } from './Dialogs';
import { LobbyScreen } from './LobbyScreen';
import { applyResult, refreshAccount, resumeAccount, type MatchResult } from './account';
import { MatchResultModal } from './Ranked';
import { Medal } from 'lucide-react';
import { ArrangePoster, BigCard, KitPoster, LiveShuffle, LogLine } from './Posters';



export function App() {
  const { tr } = useLang();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const meRef = useRef('');
  const [online, setOnline] = useState(socket.connected);
  const [asks, setAsks] = useState<JoinAsk[]>([]);
  const [kickedHow, setKickedHow] = useState<'lobby' | 'bot' | 'kill' | null>(null);
  /** vysledok ranked zapasu a ci je okno s nim otvorene */
  const [result, setResult] = useState<MatchResult | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const kickedRef = useRef(false);
  const [hash, setHash] = useState(location.hash);
  const referencePage = hash === '#/postavy' ? <CharactersPage />
    : hash === '#/pravidla/gold-rush' ? <GoldRushPage />
    : hash === '#/pravidla' ? <RulesPage />
    : null;
  const gameRoute = referencePage === null;
  useEffect(() => {
    const f = () => setHash(location.hash);
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  useEffect(() => {
    const onConnect = async () => {
      setOnline(true);
      await finishPendingLeave();
      // Najprv prihlasenie (ranked stol ho vyzaduje), az potom navrat k stolu.
      await resumeAccount().catch(() => undefined);
      const code = savedCode();
      if (code) {
        const r = await call('join', { code, name: savedName() });
        if (r.error) { saveCode(null); setLobby(null); setView(null); syncVoice(null); }
      }
    };
    // Po vyhodeni server spojenie zavrie sam: to nie je vypadok, takze bez lišty o prerušenom spojení.
    const onDisconnect = () => { if (!kickedRef.current) setOnline(false); };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room', (l: Lobby) => { meRef.current = l.me; setLobby(l); saveCode(l.code); syncVoice(l); });
    // Odchod hraca / zmena zakladatela: kratke upozornenie pre vsetkych a riadok v chate.
    const onNotice = (n: { t?: string; name?: string; id?: string; bot?: boolean; killed?: boolean; was?: string }) => {
      const name = String(n?.name ?? '').slice(0, 24);
      const en = getLang() === 'en';
      const T = (sk: string, e: string) => (en ? e : sk);
      let text = '';
      if (n.t === 'host') text = n.id === meRef.current ? T('Si nový zakladateľ hry.', 'You are now the host.') : T(`Nový zakladateľ hry je ${name}.`, `${name} is now the host.`);
      else if (n.t === 'left') text = n.bot ? T(`${name} odišiel, jeho miesto prevzal bot.`, `${name} left, a bot took the seat.`) : T(`${name} odišiel z miestnosti.`, `${name} left the room.`);
      else if (n.t === 'dropped') text = n.bot ? T(`${name} sa odpojil, jeho miesto prevzal bot.`, `${name} disconnected, a bot took the seat.`) : T(`${name} sa odpojil.`, `${name} disconnected.`);
      else if (n.t === 'joined') text = T(`${name} sa pripojil do hry namiesto hráča ${String(n.was ?? '').slice(0, 24)}.`, `${name} joined the game in place of ${String(n.was ?? '').slice(0, 24)}.`);
      else if (n.t === 'kicked' && n.killed) text = T(`${name} bol vyhodený a vyradený z hry.`, `${name} was removed and eliminated from the game.`);
      else if (n.t === 'kicked') text = n.bot ? T(`${name} bol vyhodený, jeho miesto prevzal bot.`, `${name} was removed, a bot took the seat.`) : T(`${name} bol vyhodený z miestnosti.`, `${name} was removed from the room.`);
      if (!text) return;
      setNote(text);
      addSystemMessage(text);
    };
    socket.on('notice', onNotice);
    // Niekto sa chce pripojit do rozbehnutej hry: otazka pre mna (alebo jej koniec, ak vyprsala / niekto rozhodol).
    const onAsk = (a: { id?: string; end?: boolean; name?: string; ms?: number; host?: boolean; bot?: { name: string; hp: number } | null }) => {
      const id = String(a?.id ?? '');
      if (!id) return;
      if (a.end) { setAsks(x => x.filter(y => y.id !== id)); return; }
      const ms = Math.max(1000, Math.min(60_000, Number(a.ms) || 20_000));
      setAsks(x => [...x.filter(y => y.id !== id), { id, name: String(a.name ?? '').slice(0, 24), ms, host: !!a.host, bot: a.bot ?? null, at: Date.now() + ms }]);
    };
    socket.on('joinAsk', onAsk);
    // Zakladatel ma vyhodil z lobby: zabudni miestnost a vrat sa na uvod.
    socket.on('kicked', (k?: { how?: string }) => {
      kickedRef.current = true;
      saveCode(null); meRef.current = ''; setLobby(null); setView(null); syncVoice(null); setAsks([]);
      setKickedHow(k?.how === 'kill' ? 'kill' : k?.how === 'bot' ? 'bot' : 'lobby');
    });
    socket.on('view', (v: View | null) => setView(v));
    const onResult = (r: MatchResult & { error?: string }) => {
      if (r?.error) { setError(r.error); return; }
      if (!r?.xp) return;
      setResult(r); setResultOpen(true);
      applyResult(r);
      void refreshAccount();
    };
    socket.on('matchResult', onResult);
    if (socket.connected) onConnect();
    return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); socket.off('room'); socket.off('view'); socket.off('kicked'); socket.off('notice', onNotice); socket.off('joinAsk', onAsk); socket.off('matchResult', onResult); };
  }, []);

  // Nova hra alebo navrat do lobby: vysledok minuleho zapasu sa zahodi.
  const over = !!view && view.stage !== 'setup' && !!(view as GView).winner;
  useEffect(() => { if (!over) { setResult(null); setResultOpen(false); } }, [over]);

  /** Potvrdenie okna o vyhodeni: vrat sa na uvod a pripoj sa k serveru znova (server nás po vyhodeni odpojil). */
  const closeKicked = () => {
    kickedRef.current = false;
    setKickedHow(null);
    setOnline(socket.connected);
    if (!socket.connected) socket.connect();
  };

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(''), 3500);
    return () => clearTimeout(t);
  }, [error]);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(''), 5000);
    return () => clearTimeout(t);
  }, [note]);

  const answerJoin = async (id: string, ok: boolean) => {
    setAsks(x => x.filter(y => y.id !== id));
    const r = await call('joinAnswer', { id, ok });
    if (r.error) setError(r.error);
  };

  const act: Act = async (event, ...args) => {
    const r = await call(event, ...args);
    if (r.error) setError(r.error);
    return r;
  };

  // Samostatná karta pravidiel nesmie obnovením miestnosti prevziať hráčovo miesto.
  const reconnect = useCallback(() => {
    if (gameRoute && !kickedRef.current && !socket.connected) socket.connect();
  }, [gameRoute]);
  useEffect(reconnect, [reconnect]);
  useResumeReconnect(reconnect);
  const tooShort = useTooShort();
  const [dismissed, setDismissed] = useState(false);

  return (
    <div className="bang-root app">
      {tooShort && !dismissed && (
        <div className="rotate-note" role="alertdialog" aria-labelledby="rn-t">
          <div className="rotate-note__box">
            <div className="rotate-note__ico" aria-hidden="true" />
            <h2 id="rn-t" className="t-title">{tr('Otoč telefón na výšku', 'Rotate your phone upright')}</h2>
            <p>{tr('Na šírku je tu na hru príliš málo miesta.', 'There is too little room for the game in landscape.')}</p>
            <button type="button" className="bang-btn" onClick={() => setDismissed(true)}>{tr('Pokračovať aj tak', 'Continue anyway')}</button>
          </div>
        </div>
      )}
      {gameRoute && !online && (
        <div className="banner" role="status">
          {tr('Spojenie so serverom je prerušené. Skúšam to znova…', 'Connection to the server was lost. Trying again…')}
          {lobby && <button type="button" className="banner__leave" onClick={reconnect}>{tr('Pripojiť sa znova', 'Reconnect')}</button>}
          {lobby && <CancelVoiceReconnect />}
          {lobby && <button type="button" className="banner__leave" onClick={() => void leaveRoom()}>{tr('Odísť z hry', 'Leave the game')}</button>}
        </div>
      )}
      {kickedHow && (
        <div className="gb-modal kicked-note" role="presentation">
          <div className="gb-dialog" role="alertdialog" aria-modal="true" aria-labelledby="kk-t" aria-describedby="kk-d">
            <div className="bang-prompt__kicker">{tr('Zakladateľ rozhodol', 'The host decided')}</div>
            <h2 id="kk-t" className="bang-prompt__title">{kickedHow === 'lobby' ? tr('Zakladateľ ťa vyhodil z miestnosti', 'The host removed you from the room') : tr('Zakladateľ ťa vyhodil z hry', 'The host removed you from the game')}</h2>
            <p id="kk-d" className="bang-prompt__body">
              {kickedHow === 'kill' && tr('Si vyradený z hry. Do tejto hry sa už nemôžeš vrátiť.', 'You are out of the game. You cannot come back to this game.')}
              {kickedHow === 'bot' && tr('Na tvojom mieste pokračuje bot. Do tejto hry sa už nemôžeš vrátiť.', 'A bot carries on in your seat. You cannot come back to this game.')}
              {kickedHow === 'lobby' && tr('Do tejto miestnosti sa už nemôžeš vrátiť. Môžeš si založiť vlastnú hru alebo sa pripojiť k inej.', 'You cannot come back to this room. You can start your own game or join another one.')}
            </p>
            <div className="bang-prompt__actions">
              <button className="bang-btn bang-btn--primary" type="button" autoFocus onClick={closeKicked}>{tr('Späť na úvod', 'Back to start')}</button>
            </div>
          </div>
        </div>
      )}
      {result && resultOpen && <MatchResultModal result={result} onClose={() => setResultOpen(false)} />}
      {result && !resultOpen && over && (
        <button type="button" className="bang-btn rk-reopen" onClick={() => setResultOpen(true)}><Medal size={16} />{tr('Vyúčtovanie XP', 'XP payout')}</button>
      )}
      {asks[0] && <JoinAskDialog key={asks[0].id} ask={asks[0]} onAnswer={ok => void answerJoin(asks[0].id, ok)} />}
      {online && <VoiceBanner />}
      {note && !error && <div className="toast toast--note" role="status">{note}</div>}
      {error && <div className="toast" role="alert">{trErr(error)}</div>}
      {referencePage ?? (!lobby ? <Home act={act} />
        : view?.stage === 'setup' ? <SetupScreen view={view} lobby={lobby} onError={setError} onLeave={() => void leaveRoom()} />
        : view ? <Game view={view} lobby={lobby} act={act} onError={setError} onLeave={() => void leaveRoom()} />
        : <LobbyScreen lobby={lobby} act={act} onLeave={() => void leaveRoom()} />)}
    </div>
  );
}

// ---------- spolocne casti ----------




// ---------- lobby ----------






// ---------- hra ----------

/** Odkial sa vybavenie pouziva: nakup z ponuky, alebo karta, ktoru si potiahol Josh McCloud. */
type Via = 'buy' | 'josh';

type Mode =
  | { k: 'idle' }
  | { k: 'equip'; card: Equip }
  | { k: 'etarget'; card: Equip; via: Via; as?: string; targets: string[] }
  | { k: 'epick'; card: Equip; via: Via; as?: string; target: string }
  | { k: 'owned'; card: Equip; owner: string }
  | { k: 'beer'; card: Card }
  | { k: 'jacky'; targets: string[] }
  | { k: 'target'; card: Card; targets: string[] }
  | { k: 'pick'; card: Card; target: string }
  | { k: 'sid' };

type Hint = { id: number; title: string; text: string; lines: string[] };

type Fx = { id: number; pid: string; text: string; kind: 'hit' | 'heal' };

const REACTIONS = ['bang', 'indians', 'duel', 'lethal'];
const PHASES: [string, string][] = [['Ťahaj', 'Draw'], ['Hraj', 'Play'], ['Odhoď', 'Discard']];


function winnerText(w: Winner, en: boolean) {
  if (en) return w === 'sceriffo' ? <><b>Sheriff</b> wins</> : w === 'fuorilegge' ? <><b>Outlaws</b> win</> : <><b>Renegade</b> wins</>;
  return w === 'sceriffo' ? <>Vyhráva <b>Šerif</b></> : w === 'fuorilegge' ? <>Vyhrávajú <b>Banditi</b></> : <>Vyhráva <b>Odpadlík</b></>;
}

function Game({ view, lobby, act, onError, onLeave }: { view: GView; lobby: Lobby; act: Act; onError: (m: string) => void; onLeave: () => void }) {
  const { tr, lang } = useLang();
  const layout = useLayout();
  const narrow = useNarrow(1100);
  const coarse = isCoarse();
  const drawerLog = layout !== 'wide' || narrow;
  const [logOpen, setLogOpen] = useState(false);
  const [drawer, setDrawer] = useState<'log' | 'me' | 'voice' | null>(null);
  const slimVoice = useNarrow(1500);
  const [leaving, setLeaving] = useState(false);
  const [kicking, setKicking] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const [mode, setMode] = useState<Mode>({ k: 'idle' });
  const [chosen, setChosen] = useState<number[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [detail, setDetail] = useState<DetailAnchor | null>(null);
  const [fx, setFx] = useState<Fx[]>([]);
  // Napovedy: preco nieco nejde. Po 4 zlych pokusoch za sebou sa dovod ukaze vo velkom okne.
  const [hint, setHint] = useState<Hint | null>(null);
  const [bigHint, setBigHint] = useState<Hint | null>(null);
  const misses = useRef(0);
  const nope = (title: string, text: string, lines: string[] = []) => {
    misses.current++;
    vibrate(40);
    if (misses.current >= 4) { misses.current = 0; setHint(null); setBigHint({ id: Date.now(), title, text, lines }); }
    else setHint({ id: Date.now(), title, text, lines });
  };
  useEffect(() => { misses.current = 0; setHint(null); }, [view.version]);
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 5200);
    return () => clearTimeout(t);
  }, [hint]);
  const prevHp = useRef<Record<string, number>>({});
  const fl = useFlights(view);
  useGameSounds(view.log);
  const logRef = useRef<HTMLUListElement>(null);

  useWakeLock(true);

  // Po kazdej zmene stavu sa rozrobeny vyber zahodi.
  useEffect(() => { setMode({ k: 'idle' }); setChosen([]); setSel(null); }, [view.version]);
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [view.log.length, logOpen, drawer]);

  // Zmena zivotov -> vykrik nad tabulkou, otrasenie a (kde to ide) vibracia.
  useEffect(() => {
    const add: Fx[] = [];
    for (const p of view.players) {
      const before = prevHp.current[p.id];
      if (before !== undefined && p.hp !== before) {
        const d = p.hp - before;
        add.push({ id: Math.random(), pid: p.id, text: d < 0 ? `−${-d}` : `+${d} ${getLang() === 'en' ? 'life' : 'život'}`, kind: d < 0 ? 'hit' : 'heal' });
      }
      prevHp.current[p.id] = p.hp;
    }
    if (!add.length) return;
    if (add.some(a => a.pid === view.me && a.kind === 'hit')) vibrate(160);
    setFx(f => [...f, ...add]);
    const ids = add.map(a => a.id);
    setTimeout(() => setFx(f => f.filter(x => !ids.includes(x.id))), 1400);
  }, [view.version]);

  // Zaciatok mojho tahu.
  const turnIsMine = !view.winner && view.turn.player === view.me;
  const wasMine = useRef(false);
  useEffect(() => {
    if (turnIsMine && !wasMine.current) vibrate([70, 50, 70]);
    wasMine.current = turnIsMine;
  }, [turnIsMine]);

  // Odpocet reakcie (kresli ho Countdown, tu sa drzi len termin).
  const [deadline, setDeadline] = useState<{ at: number; total: number } | null>(null);
  useEffect(() => {
    setDeadline(view.responseMs !== undefined ? { at: Date.now() + view.responseMs, total: view.responseTotal ?? 8000 } : null);
  }, [view.version, view.responseMs]);

  const me = view.players.find(p => p.id === view.me)!;
  const byId = (id?: string | null) => view.players.find(p => p.id === id);
  const name = (id?: string | null) => (id === view.me ? tr('ty', 'you') : byId(id)?.name ?? '?');
  const pd = view.pending;
  const mine = !!pd && pd.player === view.me;
  const myTurn = !pd && view.turn.player === view.me && view.turn.phase === 'play' && !view.winner;
  const send = async (cmd: Command) => { const r = await sendCmd(view, cmd); if (r.error) onError(r.error); };
  const gr = view.opts.goldRush;
  /** Dovod z enginu ako veta. */
  const whyText = (w: Why | undefined, who = ''): string => {
    switch (w?.code) {
      case 'range': return tr(`${who} je vo vzdialenosti ${w.a}, tvoja zbraň dostrelí len na ${w.b}. Pomôže zbraň s väčším dostrelom alebo Mieridlo.`, `${who} is at distance ${w.a}, your weapon only reaches ${w.b}. A longer-range weapon or a Scope would help.`);
      case 'dist1': return tr(`Panika! funguje len na vzdialenosť 1, ${who} je vo vzdialenosti ${w.a}. Zbraň dostrel Paniky nemení.`, `Panic! only works at distance 1, ${who} is at distance ${w.a}. A weapon does not change the reach of Panic!.`);
      case 'no-cards': return tr(`${who} nemá žiadnu kartu v ruke ani vyloženú, nie je čo vziať.`, `${who} has no card in hand or in play, there is nothing to take.`);
      case 'only-equip': return tr(`${who} má len vybavenie z Gold Rush. To sa nedá vziať ani odhodiť kartou, iba zaplatením nugetov.`, `${who} only has Gold Rush equipment. It cannot be taken or discarded by a card, only by paying nuggets.`);
      case 'calumet': return tr(`${who} má Kalumet a táto karta je kárová. Kárové karty súperov na neho nepôsobia.`, `${who} has a Calumet and this card is a Diamond. Rival cards of Diamonds do not affect them.`);
      case 'sheriff': return tr('Šerifa nemožno poslať do väzenia.', 'The Sheriff cannot be sent to jail.');
      case 'jailed': return tr(`${who} už vo väzení je.`, `${who} is already in jail.`);
      case 'full-hp-other': return tr(`${who} má plný počet životov.`, `${who} has full health.`);
      case 'ghost': return tr(`${who} je tieň a životy nezískava.`, `${who} is a shadow and cannot gain lives.`);
      case 'wanted': return tr(`${who} už je Hľadaný.`, `${who} is already Wanted.`);
      case 'self': return tr('Túto kartu nemôžeš zahrať na seba.', 'You cannot play this card on yourself.');
      case 'dead': return tr(`${who} je vyradený z hry.`, `${who} is out of the game.`);
      case 'bang-limit': return tr('V tomto ťahu si už BANG! zahral. Viac ich môžeš hrať len s Volcanicom alebo ako Willy the Kid.', 'You already played a BANG! this turn. More are only possible with a Volcanic or as Willy the Kid.');
      case 'missed': return tr('Vedľa! sa hrá len ako odpoveď, keď na teba niekto strieľa.', 'Missed! is only played in response, when someone shoots at you.');
      case 'full-hp': return tr('Máš plný počet životov, Pivo by nič nevyliečilo.', 'You have full health, a Beer would heal nothing.');
      case 'two-players': return tr('Keď ostali v hre len 2 hráči, Pivo nemá účinok.', 'With only 2 players left in the game, a Beer has no effect.');
      case 'ghost-heal': return tr('Ako tieň životy nezískaš.', 'As a shadow you cannot gain lives.');
      case 'dup': return tr('Kartu s rovnakým názvom už máš vyloženú pred sebou.', 'You already have a card with the same name in play.');
      case 'no-target': return tr('Túto kartu teraz nemáš na koho zahrať.', 'There is nobody you can play this card on right now.');
      default: return tr('Teraz sa to nedá.', 'That is not possible right now.');
    }
  };
  /** Kratky stitok na tabulku hraca, ktory nemoze byt cielom. */
  const whyTag = (w: Why | undefined): string => {
    switch (w?.code) {
      case 'range': return tr(`Mimo dosahu: ${w.a} > ${w.b}`, `Out of range: ${w.a} > ${w.b}`);
      case 'dist1': return tr(`Ďaleko: ${w.a} > 1`, `Too far: ${w.a} > 1`);
      case 'no-cards': return tr('Nemá karty', 'No cards');
      case 'only-equip': return tr('Len vybavenie', 'Equipment only');
      case 'calumet': return tr('Chráni ho Kalumet', 'Calumet');
      case 'sheriff': return tr('Šerif nejde do väzenia', 'Sheriff: no jail');
      case 'jailed': return tr('Už vo väzení', 'Already jailed');
      case 'full-hp-other': return tr('Plné životy', 'Full health');
      case 'wanted': return tr('Už Hľadaný', 'Already Wanted');
      case 'ghost': return tr('Tieň', 'Shadow');
      default: return tr('Nedá sa', 'Not possible');
    }
  };
  /** Dovody podla hracov pre prave vyberanu kartu alebo ucinok. */
  const whyKey = (m: Mode): string | null => m.k === 'target' ? String(m.card.id) : m.k === 'etarget' ? m.as ?? m.card.type : m.k === 'jacky' ? 'bang' : null;
  const whyLines = (key: string) => Object.entries(view.targetWhy[key] ?? {}).filter(([, w]) => w.code !== 'dead').map(([id, w]) => `${byId(id)?.name}: ${whyTag(w)}`);
  const ability = (n: AbilityInfo['name']) => view.abilities.find(a => a.name === n);
  /** Odosle pouzitie vybavenia: nakup z ponuky alebo Joshova karta. */
  const sendEquip = (card: Equip, via: Via, as?: string, target?: string, pick?: 'hand' | number) =>
    send(via === 'buy' ? { type: 'buy', equipId: card.id, as, target, pick } : { type: 'equipUse', as, target, pick });
  const joshCard = mine && pd?.kind === 'josh' ? pd.equip ?? null : null;
  /** Hrac si vybral, ako kartu pouzije. Bez ciela sa hned odosle, inak sa vybera hrac. */
  const chooseEquip = (card: Equip, via: Via, o: EquipOption) => {
    if (!o.targets) return sendEquip(card, via, o.as);
    setMode({ k: 'etarget', card, via, as: o.as, targets: o.targets });
  };

  // Miesta: ty dole, ostatni v smere hodin.
  const myIndex = view.players.findIndex(p => p.id === view.me);
  const seated = [...view.players.slice(myIndex), ...view.players.slice(0, myIndex)];
  const angles = seatAngles(seated.length);
  const angleOf = (id: string) => angles[seated.findIndex(p => p.id === id)];

  const canSid = me.character === 'sidketchum' && me.alive && me.hp < me.maxHp && view.hand.length >= 2
    && (!pd || (mine && pd.kind === 'lethal')) && !view.winner;

  const toggle = (id: number, max: number) =>
    setChosen(c => (c.includes(id) ? c.filter(x => x !== id) : c.length < max ? [...c, id] : c));

  // Zahranie karty z ruky.
  const clickHand = (card: Card) => {
    if (view.winner) return;
    if (mode.k === 'sid') return toggle(card.id, 2);
    if (mine && pd) {
      if (pd.kind === 'discard') return toggle(card.id, pd.count!);
      if (REACTIONS.includes(pd.kind) && view.eligible.includes(card.id)) return send({ type: 'respond', cardId: card.id });
      if (REACTIONS.includes(pd.kind)) {
        const need = pd.kind === 'bang' ? tr('Na výstrel odpovieš len kartou Vedľa!.', 'Only a Missed! answers a shot.')
          : pd.kind === 'lethal' ? tr('Pri smrteľnom zásahu ťa zachráni len Pivo (nie keď ostali 2 hráči).', 'Only a Beer saves you from a lethal hit (not with 2 players left).')
          : tr('Tu pomôže len karta BANG!.', 'Only a BANG! card helps here.');
        return nope(cardName(card.type), `${need} ${tr('Ak ju nemáš, použi tlačidlo na plagáte.', 'If you do not have one, use the button on the poster.')}`);
      }
      return nope(cardName(card.type), tr('Najprv dokonči rozhodnutie na plagáte nad stolom.', 'First finish the decision on the poster above the table.'));
    }
    if (!myTurn) {
      if (!me.alive) return nope(cardName(card.type), tr('Si mimo hry.', 'You are out of the game.'));
      if (view.turn.player !== view.me) return nope(tr('Nie si na ťahu', 'Not your turn'), tr(`Na ťahu je ${name(view.turn.player)}. Karty môžeš hrať až vo svojom ťahu, mimo neho len odpovedáš na útoky.`, `It is ${name(view.turn.player)}'s turn. You can play cards on your own turn, outside it you only respond to attacks.`));
      if (pd) return nope(tr('Čaká sa', 'Waiting'), tr(`Hra čaká na hráča ${name(pd.player)}. Potom môžeš pokračovať.`, `The game is waiting for ${name(pd.player)}. Then you can go on.`));
      return nope(cardName(card.type), view.turn.phase === 'discard' ? tr('Fáza hrania sa skončila, už len odhadzuješ.', 'The play phase is over, you are only discarding now.') : tr('Najprv si potiahni karty.', 'Draw your cards first.'));
    }
    if (gr && card.type === 'birra' && (view.beerGold.includes(card.id) || card.id in view.playable)) return setMode(mode.k === 'beer' && mode.card.id === card.id ? { k: 'idle' } : { k: 'beer', card });
    if (!(card.id in view.playable)) {
      const w = view.why[card.id];
      return nope(cardName(card.type), whyText(w), w?.code === 'no-target' ? whyLines(String(card.id)) : []);
    }
    const targets = view.playable[card.id];
    if (!targets) return send({ type: 'play', cardId: card.id });
    if (mode.k === 'target' && mode.card.id === card.id) return setMode({ k: 'idle' });
    setMode({ k: 'target', card, targets });
  };

  // Tap na kartu: na dotyku v mojom tahu najprv vyber (zvacsenie), az druhy tap alebo "Zahraj" ju zahra.
  const onHandTap = (card: Card) => {
    const twoStep = coarse && myTurn && !view.winner && mode.k !== 'sid';
    if (!twoStep) return clickHand(card);
    const current = mode.k === 'target' ? mode.card.id : sel;
    if (current !== card.id) { setMode({ k: 'idle' }); setSel(card.id); return; }
    setSel(null);
    clickHand(card);
  };

  // Klik na tabulku hraca.
  const seatTargets = mode.k === 'target' || mode.k === 'etarget' || mode.k === 'jacky' ? mode.targets : mine && pd?.kind === 'jesse' ? pd.options ?? [] : null;
  const clickSeat = (id: string, el?: HTMLElement) => {
    if (!seatTargets?.includes(id)) {
      // Pri vybere ciela klik na nedostupneho hraca vysvetli, preco to nejde.
      const key = whyKey(mode);
      if (key) {
        const o = byId(id);
        const w = id === view.me ? { code: 'self' } : view.targetWhy[key]?.[id];
        return nope(mode.k === 'target' ? cardName(mode.card.type) : mode.k === 'etarget' ? equipName(mode.card.type) : 'Jacky Murieta', whyText(w, o?.name ?? ''));
      }
      if (mine && pd?.kind === 'jesse' && id !== view.me) return nope('Jesse Jones', tr(`${byId(id)?.name} nemá v ruke žiadnu kartu.`, `${byId(id)?.name} has no card in hand.`));
      // Klik mimo vyberu ciela: rozbali sa detail hraca (druhy klik ho zavrie).
      if (detail?.id === id || !el) return setDetail(null);
      const r = el.getBoundingClientRect();
      return setDetail({ id, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } });
    }
    setDetail(null);
    if (mine && pd?.kind === 'jesse') return send({ type: 'choose', option: id });
    if (mode.k === 'jacky') return send({ type: 'ability', name: 'jacky', target: id });
    if (mode.k === 'etarget') {
      if (mode.as === 'panico' || mode.as === 'catbalou') {
        if (!byId(id)?.inPlay.length) return sendEquip(mode.card, mode.via, mode.as, id, 'hand');
        return setMode({ k: 'epick', card: mode.card, via: mode.via, as: mode.as, target: id });
      }
      return sendEquip(mode.card, mode.via, mode.as, id);
    }
    if (mode.k !== 'target') return;
    if (mode.card.type === 'panico' || mode.card.type === 'catbalou') {
      // Bez vylozenych kariet sa rovno berie z ruky (obet si ich najprv zamiesa).
      if (!byId(id)?.inPlay.length) return send({ type: 'play', cardId: mode.card.id, target: id, pick: 'hand' });
      return setMode({ k: 'pick', card: mode.card, target: id });
    }
    send({ type: 'play', cardId: mode.card.id, target: id });
  };

  const handMark = (c: Card) => {
    if (mode.k === 'sid') return chosen.includes(c.id) ? 'is-discard' : '';
    if (mine && pd) {
      if (pd.kind === 'discard') return chosen.includes(c.id) ? 'is-discard' : '';
      if (pd.kind === 'arrange') return '';
      return view.eligible.includes(c.id) ? 'is-playable' : 'is-disabled';
    }
    if ((mode.k === 'target' || mode.k === 'beer') && mode.card.id === c.id) return 'is-selected';
    if (myTurn) {
      const base = c.id in view.playable || view.beerGold.includes(c.id) ? 'is-playable' : 'is-disabled';
      return sel === c.id ? `${base} is-selected` : base;
    }
    return '';
  };

  // ---------- tabulky hracov ----------
  const seatProps = (p: PlayerView) => {
    const states: string[] = [];
    let tag: { text: string; style?: CSSProperties } | undefined;
    const isTarget = pd && ((REACTIONS.includes(pd.kind) || pd.kind === 'arrange') && pd.player === p.id || (pd.kind === 'steal' && pd.victim === p.id));
    if (p.id === view.me) states.push('me');
    if (p.ghost) states.push('ghost');
    if (!p.alive) { states.push('dead'); tag = { text: (view.opts.shadows && !view.winner ? tr('Tieň', 'Shadow') : tr('Vyradený', 'Eliminated')) + (p.role ? `\n${roleName(p.role)}` : ''), style: { display: 'block', background: 'var(--dead)', color: 'var(--on-role)' } }; }
    else if (isTarget) { states.push('target'); tag = { text: pd!.kind === 'arrange' || pd!.kind === 'steal' ? (pd!.kind === 'arrange' ? tr('Mieša karty', 'Shuffling') : tr('Berie sa mu karta', 'Card taken')) : p.id === view.me ? tr('Mieri na teba', 'Aimed at you') : pd!.kind === 'lethal' ? tr('Smrteľný zásah', 'Lethal hit') : tr('Cieľ', 'Target') }; }
    else if (seatTargets) {
      if (seatTargets.includes(p.id)) { states.push('inrange'); tag = { text: mode.k === 'target' ? tr('V dostrele', 'In range') : tr('Vyber', 'Choose'), style: { display: 'block', background: 'var(--missed)', color: 'var(--on-missed)' } }; }
      else if (p.id !== view.me) {
        states.push('outrange');
        const key = whyKey(mode);
        const w = key ? view.targetWhy[key]?.[p.id] : undefined;
        if (w && p.alive) tag = { text: whyTag(w), style: { display: 'block', background: 'var(--room)', color: 'var(--parchment)', boxShadow: 'inset 0 0 0 1px var(--parchment-muted)' } };
      }
    }
    if (p.alive && !view.winner && view.turn.player === p.id) { states.push('turn'); if (!tag) tag = { text: p.ghost ? tr('Tieň na ťahu', 'Shadow on turn') : tr('Na ťahu', 'On turn') }; }
    return { states, tag, clickable: !!seatTargets?.includes(p.id) };
  };
  const seatLabel = (p: PlayerView, clickable: boolean) =>
    tr(`${p.name}${p.id === view.me ? ' (ty)' : ''}, ${CHARACTERS[p.character].name}, životy ${Math.max(0, p.hp)} z ${p.maxHp}${!p.alive && p.role ? `, rola ${roleName(p.role)}` : ''}, karty v ruke ${p.handCount}${clickable ? ', vyber ako cieľ' : ', zobraz podrobnosti'}`, `${p.name}${p.id === view.me ? ' (you)' : ''}, ${CHARACTERS[p.character].name}, lives ${Math.max(0, p.hp)} of ${p.maxHp}${!p.alive && p.role ? `, role ${roleName(p.role)}` : ''}, cards in hand ${p.handCount}${clickable ? ', choose as target' : ', show details'}`);

  const pile = view.discardPile;
  const turnAngle = view.winner ? null : angleOf(view.turn.player);

  const deckAndPile = () => (
    <>
      <div className="bang-deck" title={tr(`V balíku ${view.deckCount} kariet`, `${view.deckCount} cards in the deck`)} aria-label={tr(`Balík: ${view.deckCount} kariet`, `Deck: ${view.deckCount} cards`)}>
        {view.deckCount > 0 && <CardBack />}
        <span className="bang-deck__count">{view.deckCount}</span>
        <span className="bang-slot-label bang-caption">{tr('Balík', 'Deck')}</span>
      </div>
      <button type="button" className="bang-pile" disabled={!pile.length}
        onClick={() => pile.length && setPreview(previewOfCard(pile[pile.length - 1]))}
        aria-label={tr(`Odhadzovací balík: ${view.discardCount} kariet${pile.length ? `, navrchu ${cardName(pile[pile.length - 1].type)}` : ''}`, `Discard pile: ${view.discardCount} cards${pile.length ? `, ${cardName(pile[pile.length - 1].type)} on top` : ''}`)}>
        {pile.slice(-4).map((c, i, arr) => {
          const rot = ((c.id * 37) % 33) - 16;
          const dx = ((c.id * 13) % 13) - 6;
          const dy = ((c.id * 7) % 13) - 6;
          return (
            <CardView key={c.id} card={c} size="table" className={`${i === arr.length - 1 ? 'is-landing' : ''} ${fl.hidden.includes(c.id) ? 'is-incoming' : ''}`}
              style={{ transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`, ['--rot' as string]: `${rot}deg`, ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px` }} />
          );
        })}
        <span className="bang-deck__count">{view.discardCount}</span>
        <span className="bang-slot-label bang-caption">{gr ? tr('Odhodené', 'Discard') : tr('Odhadzovací balík', 'Discard pile')}</span>
      </button>
    </>
  );

  const shopRow = gr && (
        <div className="gshop" role="group" aria-label={tr(`Ponuka vybavenia, máš ${nuggets(view.myGold)}`, `Equipment on offer, you have ${nuggets(view.myGold)}`)}>
          <span className="bang-slot-label bang-caption gshop__label">{tr('Vybavenie', 'Equipment')}<span className="gshop__heap" title={tr(`Na kôpke ostáva ${nuggets(view.heap)} z 30`, `${nuggets(view.heap)} of 30 left in the heap`)}><Gold size={14} n={view.heap} />{tr('na kôpke', 'in the heap')}</span></span>
          <span className="gshop__deck" title={tr(`V balíku vybavenia ${view.equipDeckCount} kariet`, `${view.equipDeckCount} cards in the equipment deck`)} aria-hidden="true"><b>{view.equipDeckCount}</b></span>
          {view.shop.map(it => {
            const can = myTurn && it.options.length > 0;
            return (
              <button key={it.card.id} type="button" className={`gshop__card ${can ? 'can' : myTurn ? 'cannot' : ''} ${mode.k !== 'idle' && 'card' in mode && mode.card.id === it.card.id ? 'is-sel' : ''}`}
                onClick={() => setMode(mode.k === 'equip' && mode.card.id === it.card.id ? { k: 'idle' } : { k: 'equip', card: it.card })}
                aria-label={tr(`${equipName(it.card.type)}, cena ${nuggets(it.price)}${can ? ', dá sa kúpiť' : ''}`, `${equipName(it.card.type)}, costs ${nuggets(it.price)}${can ? ', can be bought' : ''}`)}>
                <EquipView card={it.card} size="table" price={it.price} />
              </button>
            );
          })}
        </div>
      );


  const scene = (geo: Geo) => {
    const lamp = geo.lampPos(turnAngle ?? null);
    const pointer = turnAngle === null || turnAngle === undefined ? null : geo.pointerPos(turnAngle);
    const shot = !pd ? null
      : (pd.kind === 'bang' || pd.kind === 'duel' || pd.kind === 'arrange') && pd.src ? { from: geo.seatPos(angleOf(pd.src)), to: geo.seatPos(angleOf(pd.player)) }
      : pd.kind === 'steal' && pd.victim ? { from: geo.seatPos(angleOf(pd.player)), to: geo.seatPos(angleOf(pd.victim)) }
      : null;
    return (
      <>
        <div className="bang-lamp" style={{ transform: `translate(${lamp.x}px, ${lamp.y}px)` }} />
        {pointer && <div className="bang-pointer" style={{ transform: `translate(${pointer.x}px, ${pointer.y}px) rotate(${turnAngle}deg)` }} />}
        <div className={`bang-center ${gr ? 'has-shop' : ''}`} style={layout === 'compact' ? { top: geo.CY } : (() => { const h = Math.round(Math.max(gr ? 84 : 100, Math.min(150, (geo.TABLE.h - 44) * 0.66, gr ? ((geo.TABLE.w * 0.62 - 190) / 5) / 0.643 : 999))); return { top: geo.CY, ['--card-table-h' as string]: `${h}px`, ['--card-table-w' as string]: `${Math.round(h * 0.643)}px` } as CSSProperties; })()}>{deckAndPile()}{shopRow}</div>

        {shot && (
          <svg className="shot" width={geo.W} height={geo.H} viewBox={`0 0 ${geo.W} ${geo.H}`} aria-hidden="true">
            <line x1={shot.from.x} y1={shot.from.y} x2={shot.to.x} y2={shot.to.y} />
          </svg>
        )}

        {seated.map((p, k) => {
          const { states, tag, clickable } = seatProps(p);
          const pos = geo.seatPos(angles[k]);
          const hit = fx.some(f => f.pid === p.id && f.kind === 'hit');
          const role = p.id === view.me ? view.myRole : p.role;
          const showMine = p.id !== view.me || layout === 'compact';
          const peek = (p.inPlay.length > 0 || p.equip.length > 0) && showMine;
          const seatW = layout === 'compact' ? 136 : 230;
          const cw = layout === 'compact' ? 40 : 80;
          const pn = p.inPlay.length + p.equip.length;
          const gap = pn > 1 ? Math.min(6, (seatW - 20 - pn * cw) / (pn - 1)) : 0;
          return (
            <div key={p.id} className={`seat-wrap ${hit ? 'is-shaking' : ''} ${p.alive ? '' : 'is-dead'}`} style={{ left: pos.x, top: pos.y }}>
              {peek && (
                <span className="seat-peek" aria-hidden="true">
                  {p.inPlay.map((c, i) => (
                    <span key={c.id} className="seat-peek__card" style={{ marginLeft: i === 0 ? 0 : gap, zIndex: i } as CSSProperties}
                      title={cardTitle(c)} onClick={() => setPreview(previewOfCard(c))}>
                      <CardView card={c} size="table" />
                    </span>
                  ))}
                  {p.equip.map((e, i) => (
                    <span key={e.id} className="seat-peek__card is-equip" style={{ marginLeft: i + p.inPlay.length === 0 ? 0 : gap, zIndex: i + p.inPlay.length } as CSSProperties}
                      title={`${equipName(e.type)}: ${equipText(e.type)}`} onClick={() => setMode({ k: 'owned', card: e, owner: p.id })}>
                      <EquipView card={e} size="table" />
                    </span>
                  ))}
                </span>
              )}
              <button
                type="button" className="bang-seat bang-seat--static seat-btn" data-state={states.join(' ')}
                onClick={e => clickSeat(p.id, e.currentTarget)}
                aria-label={`${seatLabel(p, clickable)}${pn ? tr(`, vyložené: ${[...p.inPlay.map(c => cardName(c.type)), ...p.equip.map(e => equipName(e.type))].join(', ')}`, `, in play: ${[...p.inPlay.map(c => cardName(c.type)), ...p.equip.map(e => equipName(e.type))].join(', ')}`) : ''}`}
                data-seat={p.id} aria-expanded={detail?.id === p.id}
              >
                <Portrait ch={p.character} name={p.name} />
                <span className="bang-seat__name">{p.name}{p.id === view.me && tr(' (ty)', ' (you)')}</span>
                <span className="bang-seat__row">
                  <RoleBadge role={role} />
                  <span className="bang-seat__hand" title={tr('Karty v ruke', 'Cards in hand')}><Icon name="cards" />{p.handCount}</span>
                  {gr && <span className="bang-seat__gold" title={tr(`Nugety: ${p.gold}`, `Nuggets: ${p.gold}`)}><Gold size={15} n={p.gold} /></span>}
                </span>
                <span className="bang-seat__hpwrap"><Hp hp={p.hp} max={p.maxHp} /></span>
                {p.id !== view.me && p.alive && <span className="bang-seat__dist" title={tr('Vzdialenosť od teba', 'Distance from you')}>{p.distance}</span>}
                {tag && <span className="bang-seat__tag" style={tag.style}>{tag.text}</span>}
              </button>
            </div>
          );
        })}

        {fx.map(f => {
          const pos = geo.seatPos(angleOf(f.pid));
          return <span key={f.id} className={`bang-shout stage-shout is-small is-${f.kind}`} style={{ left: pos.x, top: pos.y - 46 }}>{f.text}</span>;
        })}

        {poster()}
      </>
    );
  };

  // ---------- plagat (na stole, alebo ako panel zospodu na telefone) ----------
  function timer(after = tr('potom sa rozhodne automaticky', 'then it is decided automatically')) {
    if (!deadline) return null;
    return <Countdown at={deadline.at} total={deadline.total} after={after} />;
  }

  function poster(): ReactNode {
    if (view.winner) {
      const won = me.won;
      return (
        <Poster kicker={won ? tr('Koniec hry · vyhral si', 'Game over · you won') : tr('Koniec hry · prehral si', 'Game over · you lost')} title={winnerText(view.winner, lang === 'en')} wide>
          <div className="roster">
            {view.players.map(p => (
              <div key={p.id} className="roster-row">
                <span className={p.dead ? 'gone' : 'alive'}>{p.won && <Star size={13} fill="currentColor" aria-label={tr('víťaz', 'winner')} />} {p.name}{p.id === view.me && tr(' (ty)', ' (you)')}</span>
                <span className="roster-role"><RoleBadge role={p.role} />{p.side && <small>{p.side === 'law' ? tr('tieň za zákon', 'shadow for the law') : tr('tieň za banditov', 'shadow for the outlaws')}</small>}</span>
              </div>
            ))}
          </div>
          {lobby.host === lobby.me ? (
            <div className="bang-prompt__actions">
              <button className="bang-btn bang-btn--primary" type="button" autoFocus onClick={() => act('start')}>{tr('Nová hra', 'New game')}</button>
              <button className="bang-btn bang-btn--on-paper" type="button" onClick={() => act('toLobby')}>{tr('Späť do lobby', 'Back to lobby')}</button>
            </div>
          ) : <p className="bang-prompt__body">{tr('Novú hru spúšťa zakladateľ.', 'The host starts a new game.')}</p>}
        </Poster>
      );
    }

    // ----- Gold Rush: vybavenie -----
    const equipPoster = (card: Equip, via: Via, options: EquipOption[], price: number | null) => {
      const def = EQUIP[card.type];
      const label = (o: EquipOption) => o.as ? tr(`Použi ako ${cardName(o.as as CardType)}`, `Use as ${cardName(o.as as CardType)}`)
        : via === 'josh' ? (def.black ? tr('Vylož pred seba', 'Put into play') : tr('Použi', 'Use it'))
        : tr(`Kúp za ${nuggets(price ?? def.cost)}`, `Buy for ${nuggets(price ?? def.cost)}`);
      const why = via === 'josh' ? '' : !myTurn ? tr('Kupovať môžeš len vo svojom ťahu, vo fáze hrania.', 'You can only buy on your turn, in the play phase.')
        : view.myGold < (price ?? def.cost) ? tr(`Treba ${nuggets(price ?? def.cost)}, máš ${view.myGold}.`, `It costs ${nuggets(price ?? def.cost)}, you have ${view.myGold}.`)
        : !options.length ? (def.black ? tr('Túto kartu už máš vyloženú.', 'You already have this card in play.') : tr('Teraz by nemala žiadny účinok.', 'It would have no effect right now.')) : '';
      return (
        <Poster kicker={via === 'josh' ? tr('Josh McCloud · vybavenie z balíka', 'Josh McCloud · equipment from the deck') : `${tr('Vybavenie', 'Equipment')} · ${def.black ? tr('čierna, ostáva vyložená', 'black, stays in play') : tr('hnedá, použije sa hneď', 'brown, used at once')}`}
          title={<><b>{equipName(card.type)}</b></>} wide>
          <div className="eposter">
            <span className="eposter__card"><EquipView card={card} size="table" price={price ?? undefined} /></span>
            <div className="eposter__txt">
              <p className="bang-prompt__body">{equipText(card.type)}</p>
              <p className="eposter__price"><Gold size={20} n={price ?? def.cost} />{price !== null && price !== def.cost && <s>{def.cost}</s>}<span>{tr(`máš ${nuggets(view.myGold)}`, `you have ${nuggets(view.myGold)}`)}</span></p>
              {why && <p className="eposter__why">{why}</p>}
            </div>
          </div>
          <div className="bang-prompt__actions">
            {options.map((o, i) => (
              <button key={o.as ?? 'x'} className={`bang-btn ${i === 0 ? 'bang-btn--primary' : 'bang-btn--on-paper'}`} type="button" autoFocus={i === 0} onClick={() => chooseEquip(card, via, o)}>
                {label(o)}{o.as && via === 'buy' && i === 0 ? ` (${nuggets(price ?? def.cost)})` : ''}
              </button>
            ))}
            {via === 'josh'
              ? <button className="bang-btn bang-btn--on-paper" type="button" onClick={() => send({ type: 'pass' })}>{tr('Odhoď kartu', 'Discard it')}</button>
              : <button className="bang-btn bang-btn--on-paper" type="button" onClick={() => setMode({ k: 'idle' })}>{tr('Zavri', 'Close')}</button>}
          </div>
        </Poster>
      );
    };
    if (mode.k === 'equip') {
      const it = view.shop.find(x => x.card.id === mode.card.id);
      if (it) return equipPoster(it.card, 'buy', it.options, it.price);
    }
    if (mode.k === 'epick') {
      const t = byId(mode.target)!;
      return (
        <Poster kicker={`${equipName(mode.card.type)} · ${cardName(mode.as as CardType)}`} title={<>{tr('Ktorú kartu hráča', 'Which card of')} <b>{t.name}</b>?</>} wide>
          <div className="choices">
            {t.handCount > 0 && (
              <button type="button" className="choice" onClick={() => sendEquip(mode.card, mode.via, mode.as, t.id, 'hand')}>
                <CardBack /><span className="bang-caption on-paper">{tr('Z ruky', 'From hand')} ({t.handCount}), {tr('vyberieš rubom', 'picked face down')}</span>
              </button>
            )}
            {t.inPlay.map(c => (
              <button key={c.id} type="button" className="choice" title={cardTitle(c)} onClick={() => sendEquip(mode.card, mode.via, mode.as, t.id, c.id)}>
                <span className="bang-card bang-card--table" data-kind="blue"><CardInner card={c} /></span>
                <span className="bang-caption on-paper">{cardName(c.type)}</span>
              </button>
            ))}
          </div>
          <div className="bang-prompt__actions">
            <button className="bang-btn bang-btn--on-paper" type="button" onClick={() => setMode({ k: 'idle' })}>{tr('Zruš', 'Cancel')}</button>
          </div>
        </Poster>
      );
    }
    if (mode.k === 'owned') {
      const owner = byId(mode.owner);
      const card = owner?.equip.find(e => e.id === mode.card.id);
      if (owner && card) {
        const cost = EQUIP[card.type].cost + 1;
        const ab = owner.id === view.me ? (card.type === 'setaccio' ? ability('setaccio') : card.type === 'zaino' ? ability('zaino') : undefined) : undefined;
        return (
          <Poster kicker={owner.id === view.me ? tr('Tvoje vybavenie', 'Your equipment') : tr(`Vybavenie hráča ${owner.name}`, `${owner.name}'s equipment`)} title={<><b>{equipName(card.type)}</b></>} wide>
            <div className="eposter">
              <span className="eposter__card"><EquipView card={card} size="table" /></span>
              <div className="eposter__txt">
                <p className="bang-prompt__body">{equipText(card.type)}</p>
                <p className="eposter__why">{tr(`Odhodiť ho môže ktokoľvek za ${nuggets(cost)} (cena karty + 1).`, `Anyone can make it be discarded for ${nuggets(cost)} (card price + 1).`)}</p>
              </div>
            </div>
            <div className="bang-prompt__actions">
              {ab && <button className="bang-btn bang-btn--primary" type="button" onClick={() => send({ type: 'ability', name: ab.name })}>{ab.name === 'setaccio' ? tr('Zaplať 1 nuget a ťahaj', 'Pay 1 nugget and draw') : tr('Zaplať 2 nugety: +1 život', 'Pay 2 nuggets: +1 life')}</button>}
              <button className={`bang-btn ${ab ? 'bang-btn--on-paper' : 'bang-btn--primary'}`} type="button" disabled={!myTurn || view.myGold < cost} onClick={() => send({ type: 'scrap', target: owner.id, equipId: card.id })}>
                {tr(`Odhoď za ${nuggets(cost)}`, `Discard for ${nuggets(cost)}`)}
              </button>
              <button className="bang-btn bang-btn--on-paper" type="button" onClick={() => setMode({ k: 'idle' })}>{tr('Zavri', 'Close')}</button>
            </div>
          </Poster>
        );
      }
    }
    if (mode.k === 'beer') {
      const canHeal = mode.card.id in view.playable;
      return (
        <Poster kicker={tr('Pivo · Gold Rush', 'Beer · Gold Rush')} title={tr('Život alebo nuget?', 'A life or a nugget?')}>
          <p className="bang-prompt__body">{canHeal ? tr('Pivo ti vylieči 1 život, alebo ho zahraj za 1 nuget z kôpky.', 'The Beer heals 1 life, or play it for 1 nugget from the heap.') : tr('Liečiť sa teraz nedá, Pivo môžeš zahrať len za nuget.', 'You cannot heal now, the Beer can only be played for a nugget.')}</p>
          <div className="bang-prompt__actions">
            <button className="bang-btn bang-btn--defend" type="button" disabled={!canHeal} onClick={() => send({ type: 'play', cardId: mode.card.id })}>{tr('+1 život', '+1 life')}</button>
            <button className="bang-btn bang-btn--primary" type="button" autoFocus disabled={!view.beerGold.includes(mode.card.id)} title={view.heap ? undefined : tr('Kôpka nugetov je prázdna', 'The nugget heap is empty')} onClick={() => send({ type: 'play', cardId: mode.card.id, gold: true })}><Gold size={18} />{tr('+1 nuget', '+1 nugget')}</button>
            <button className="bang-btn bang-btn--on-paper" type="button" onClick={() => setMode({ k: 'idle' })}>{tr('Zruš', 'Cancel')}</button>
          </div>
        </Poster>
      );
    }
    if (joshCard && mode.k === 'idle') return equipPoster(joshCard, 'josh', pd?.equipOptions ?? [], null);
    if (mine && pd?.kind === 'dutch') {
      return (
        <Poster kicker={tr('Dutch Will · ťahaj', 'Dutch Will · draw')} title={tr('Ktorú kartu odhodíš?', 'Which card do you discard?')}>
          <p className="bang-prompt__body">{tr('Jedna z dvoch potiahnutých kariet ide preč. Za to si berieš 1 nuget.', 'One of the two cards you drew has to go. You take 1 nugget for it.')}</p>
          <div className="choices">
            {(pd.cards ?? []).map(c => (
              <button key={c.id} type="button" className="choice" title={cardTitle(c)} onClick={() => send({ type: 'discard', cardIds: [c.id] })}>
                <span className="bang-card bang-card--table" data-kind={isBlue(c.type) ? 'blue' : 'brown'}><CardInner card={c} /></span>
                <span className="bang-caption on-paper">{tr('Odhoď', 'Discard')} {cardName(c.type)}</span>
              </button>
            ))}
          </div>
        </Poster>
      );
    }

    if (mode.k === 'pick') {
      const t = byId(mode.target)!;
      return (
        <Poster kicker={cardName(mode.card.type)} title={<>{tr('Ktorú kartu hráča', 'Which card of')} <b>{t.name}</b>{tr('?', '?')}</>} wide>
          <div className="choices">
            {t.handCount > 0 && (
              <button type="button" className="choice" onClick={() => send({ type: 'play', cardId: mode.card.id, target: t.id, pick: 'hand' })}>
                <CardBack /><span className="bang-caption on-paper">{tr('Z ruky', 'From hand')} ({t.handCount}), {tr('vyberieš rubom', 'picked face down')}</span>
              </button>
            )}
            {t.inPlay.map(c => (
              <button key={c.id} type="button" className="choice" title={cardTitle(c)} onClick={() => send({ type: 'play', cardId: mode.card.id, target: t.id, pick: c.id })}>
                <span className="bang-card bang-card--table" data-kind="blue"><CardInner card={c} /></span>
                <span className="bang-caption on-paper">{cardName(c.type)}</span>
              </button>
            ))}
          </div>
          <div className="bang-prompt__actions">
            <button className="bang-btn bang-btn--on-paper" type="button" onClick={() => setMode({ k: 'idle' })}>{tr('Zruš', 'Cancel')}</button>
          </div>
        </Poster>
      );
    }

    if (view.store.length > 0) {
      const pick = mine && pd?.kind === 'store';
      return (
        <Poster kicker={tr('Hokynárstvo', 'General Store')} title={pick ? tr('Vyber si kartu', 'Pick a card') : <>{tr('Vyberá', 'Picking:')} <b>{name(pd?.player)}</b></>} wide>
          <div className="choices">
            {view.store.map(c => (
              <button key={c.id} type="button" className="choice" disabled={!pick} title={cardTitle(c)} onClick={() => send({ type: 'storePick', cardId: c.id })}>
                <span className="bang-card bang-card--table" data-kind="brown"><CardInner card={c} /></span>
                <span className="bang-caption on-paper">{cardName(c.type)}</span>
              </button>
            ))}
          </div>
        </Poster>
      );
    }

    if (pd?.kind === 'arrange' && pd.src === view.me) {
      return (
        <Poster kicker={`${handPickName(pd.card ?? 'panico')} · ${tr('čakaj', 'wait')}`} title={<><b>{name(pd.player)}</b> {tr('si mieša karty', 'is shuffling cards')}</>} wide>
          <LiveShuffle key={view.version} count={byId(pd.player)?.handCount ?? 0} />
          <p className="bang-prompt__body">{tr('Keď potvrdí poradie, vyberieš si jednu kartu rubom.', 'When they confirm the order, you pick one card face down.')}</p>
        </Poster>
      );
    }

    if (!mine || !pd) return null;
    const first = view.eligible[0];
    switch (pd.kind) {
      case 'bang':
        return (
          <Poster kicker={tr('Wanted · tvoja reakcia', 'Wanted · your reaction')} title={<>{name(pd.src)} {tr('strieľa', 'shoots')} <b>BANG!</b></>}>
            <p className="bang-prompt__body">
              {(pd.needed ?? 1) > 1 ? tr(`Na zrušenie treba ešte ${pd.needed}× Vedľa!.`, `${pd.needed}× Missed! still needed to cancel it.`) : tr('Zahraj Vedľa! alebo stratíš 1 život.', 'Play Missed! or lose 1 life.')}
            </p>
            {timer()}
            <div className="bang-prompt__actions">
              <button className="bang-btn bang-btn--defend" type="button" autoFocus disabled={first === undefined} onClick={() => send({ type: 'respond', cardId: first })}>{tr('Zahraj Vedľa!', 'Play Missed!')}</button>
              <button className="bang-btn bang-btn--on-paper" type="button" onClick={() => send({ type: 'pass' })}>{tr('Prijmi zásah', 'Take the hit')}</button>
            </div>
          </Poster>
        );
      case 'indians':
        return (
          <Poster kicker={tr('Wanted · tvoja reakcia', 'Wanted · your reaction')} title={<><b>{tr('Indiáni!', 'Indians!')}</b></>}>
            <p className="bang-prompt__body">{tr('Odhoď BANG! alebo stratíš 1 život.', 'Discard a BANG! or lose 1 life.')}</p>
            {timer()}
            <div className="bang-prompt__actions">
              <button className="bang-btn bang-btn--defend" type="button" autoFocus disabled={first === undefined} onClick={() => send({ type: 'respond', cardId: first })}>{tr('Odhoď BANG!', 'Discard BANG!')}</button>
              <button className="bang-btn bang-btn--on-paper" type="button" onClick={() => send({ type: 'pass' })}>{tr('Strať život', 'Lose a life')}</button>
            </div>
          </Poster>
        );
      case 'duel':
        return (
          <Poster kicker="Wanted · duel" title={<><b>{tr('Duel', 'Duel')}</b> {tr('s hráčom', 'with')} {name(pd.src)}</>}>
            <p className="bang-prompt__body">{tr('Odhoď BANG!, inak duel prehráš a stratíš 1 život.', 'Discard a BANG! or you lose the duel and 1 life.')}</p>
            {timer()}
            <div className="bang-prompt__actions">
              <button className="bang-btn bang-btn--defend" type="button" autoFocus disabled={first === undefined} onClick={() => send({ type: 'respond', cardId: first })}>{tr('Odhoď BANG!', 'Discard BANG!')}</button>
              <button className="bang-btn bang-btn--on-paper" type="button" onClick={() => send({ type: 'pass' })}>{tr('Vzdaj duel', 'Give up the duel')}</button>
            </div>
          </Poster>
        );
      case 'lethal':
        return (
          <Poster kicker={tr('Wanted · posledný život', 'Wanted · last life')} title={lang === 'en' ? <><b>Lethal</b> hit</> : <><b>Smrteľný</b> zásah</>}>
            <p className="bang-prompt__body">{first !== undefined ? tr('Zahraj Pivo, inak si vyradený.', 'Play a Beer or you are eliminated.') : tr('Zachrániť ťa môže už len schopnosť postavy alebo Batoh.', 'Only your character ability or a Rucksack can save you now.')}</p>
            {timer()}
            <div className="bang-prompt__actions">
              {first !== undefined && <button className="bang-btn bang-btn--defend" type="button" autoFocus onClick={() => send({ type: 'respond', cardId: first })}>{tr('Zahraj Pivo', 'Play Beer')}</button>}
              {canSid && <button className="bang-btn bang-btn--defend" type="button" onClick={() => setMode({ k: 'sid' })}>{tr('Odhoď 2 karty', 'Discard 2 cards')}</button>}
              {ability('zaino') && <button className="bang-btn bang-btn--defend" type="button" onClick={() => send({ type: 'ability', name: 'zaino' })}>{tr('Batoh: 2 nugety', 'Rucksack: 2 nuggets')}</button>}
              <button className="bang-btn bang-btn--on-paper" type="button" onClick={() => send({ type: 'pass' })}>{tr('Vzdaj sa', 'Give up')}</button>
            </div>
          </Poster>
        );
      case 'jesse':
        return (
          <Poster kicker={tr('Jesse Jones · ťahaj', 'Jesse Jones · draw')} title={tr('Odkiaľ prvú kartu?', 'Where from the first card?')}>
            <p className="bang-prompt__body">{tr('Klikni na hráča so žltým obrysom: zamieša si karty a ty si vyberieš ktorúkoľvek z nich rubom. Alebo ťahaj z balíka.', 'Click a player with a yellow outline: they shuffle their cards and you pick any one of them face down. Or draw from the deck.')}</p>
            <div className="bang-prompt__actions">
              <button className="bang-btn bang-btn--primary" type="button" autoFocus onClick={() => send({ type: 'choose', option: 'deck' })}>{tr('Ťahaj 2 z balíka', 'Draw 2 from the deck')}</button>
            </div>
          </Poster>
        );
      case 'pedro':
        return (
          <Poster kicker={tr('Pedro Ramirez · ťahaj', 'Pedro Ramirez · draw')} title={tr('Odkiaľ prvú kartu?', 'Where from the first card?')}>
            {view.discardTop && <p className="bang-prompt__body">{tr('Navrchu odhadzovacieho balíka je', 'On top of the discard pile is')} {cardName(view.discardTop.type)}.</p>}
            <div className="bang-prompt__actions">
              <button className="bang-btn bang-btn--primary" type="button" autoFocus onClick={() => send({ type: 'choose', option: 'discard' })}>{tr('Z odhadzovacieho balíka', 'From the discard pile')}</button>
              <button className="bang-btn bang-btn--on-paper" type="button" onClick={() => send({ type: 'choose', option: 'deck' })}>{tr('Z balíka', 'From the deck')}</button>
            </div>
          </Poster>
        );
      case 'kit':
        return <KitPoster cards={pd.cards ?? []} send={send} />;
      case 'arrange':
        return <ArrangePoster key={view.version} cards={view.hand} attacker={name(pd.src)} card={pd.card ?? 'panico'} timer={timer(tr('potom sa karty zamiešajú automaticky', 'then the cards are shuffled automatically'))} send={send} />;
      case 'steal':
        return (
          <Poster kicker={`${handPickName(pd.card ?? 'panico')} · ${tr('vyber kartu', 'pick a card')}`} title={<>{tr('Ktorú kartu hráča', 'Which card of')} <b>{name(pd.victim)}</b>?</>} wide>
            <p className="bang-prompt__body">
              {pd.count === 1 ? tr('Hráč má v ruke jedinú kartu.', 'The player has one card in hand.') : tr(`Karty ležia rubom v poradí, ako si ich ${name(pd.victim)} zamiešal.`, `The cards lie face down in the order ${name(pd.victim)} shuffled them.`)} {pd.card === 'catbalou' ? tr('Vybraná karta pôjde na odhadzovací balík.', 'The chosen card goes to the discard pile.') : tr('Vybraná karta pôjde k tebe do ruky.', 'The chosen card goes to your hand.')}
            </p>
            <div className="choices steal-row">
              {Array.from({ length: pd.count ?? 0 }, (_, i) => (
                <button key={i} type="button" className="choice steal-card" aria-label={tr(`Karta ${i + 1} z ${pd.count}`, `Card ${i + 1} of ${pd.count}`)} onClick={() => send({ type: 'steal', index: i })}>
                  <CardBack />
                  <span className="bang-caption on-paper">{i + 1}</span>
                </button>
              ))}
            </div>
          </Poster>
        );
      default:
        return null;
    }
  }

  // ---------- banner a ovladanie pod stolom ----------
  const turnPlayer = byId(view.turn.player);
  const phaseIdx = view.turn.phase === 'draw' ? 0 : view.turn.phase === 'play' ? 1 : 2;
  const bangLimit = me.inPlay.some(c => c.type === 'volcanic') || me.character === 'willythekid' ? '∞' : '1';

  let banner: { text: string; color: string; sub: string };
  if (view.winner) {
    const won = me.won;
    banner = { text: won ? tr('Vyhral si', 'You won') : tr('Prehral si', 'You lost'), color: won ? 'var(--brass)' : 'var(--bang-text)', sub: tr('Všetky roly sú odkryté.', 'All roles are revealed.') };
  } else if (!me.alive) {
    banner = view.opts.shadows
      ? { text: tr('Si tieň', 'You are a shadow'), color: 'var(--parchment-muted)', sub: tr('Na svoj ťah sa vrátiš do hry: potiahneš si 2 karty a hráš ako vždy.', 'On your turn you return to the game: you draw 2 cards and play as usual.') }
      : { text: tr('Si mimo hry', 'You are out'), color: 'var(--parchment-muted)', sub: tr('Môžeš ďalej sledovať, ako to dopadne.', 'You can keep watching how it ends.') };
  } else if (mode.k === 'sid') {
    banner = { text: tr('Odhoď 2 karty', 'Discard 2 cards'), color: 'var(--heal)', sub: tr(`Sid Ketchum: vyber 2 karty z ruky za +1 život (${chosen.length}/2).`, `Sid Ketchum: pick 2 cards from hand for +1 life (${chosen.length}/2).`) };
  } else if (mine && pd?.kind === 'discard') {
    banner = { text: tr(`Odhoď ${pd.count} ${pd.count === 1 ? 'kartu' : 'karty'}`, `Discard ${pd.count} card${pd.count === 1 ? '' : 's'}`), color: 'var(--bang-text)', sub: tr(`Máš ${view.hand.length} kariet a ${me.hp} ${me.hp === 1 ? 'život' : 'životy'}. Vyber karty, ktoré pôjdu na odhadzovací balík.`, `You have ${view.hand.length} cards and ${me.hp} ${me.hp === 1 ? 'life' : 'lives'}. Pick the cards that go to the discard pile.`) };
  } else if (mine && pd && REACTIONS.includes(pd.kind)) {
    banner = { text: tr('Bráň sa', 'Defend yourself'), color: 'var(--bang-text)', sub: tr('Zvýraznené karty môžeš zahrať. Ťukni na kartu alebo na tlačidlo na plagáte.', 'You can play the highlighted cards. Tap a card or the button on the poster.') };
  } else if (mine && pd?.kind === 'arrange') {
    banner = { text: tr('Zamiešaj si karty', 'Shuffle your cards'), color: 'var(--missed)', sub: tr(`${name(pd.src)} ti berie kartu z ruky. Poprehadzuj ich na plagáte a potvrď poradie.`, `${name(pd.src)} is taking a card from your hand. Rearrange them on the poster and confirm the order.`) };
  } else if (mine && pd?.kind === 'steal') {
    banner = { text: tr('Vyber kartu', 'Pick a card'), color: 'var(--brass)', sub: tr('Ťukni na jednu kartu rubom na plagáte.', 'Tap one face-down card on the poster.') };
  } else if (mine && pd?.kind === 'store') {
    banner = { text: tr('Vyber si kartu', 'Pick a card'), color: 'var(--brass)', sub: tr('Hokynárstvo: ťukni na jednu kartu na plagáte.', 'General Store: tap one card on the poster.') };
  } else if (mine && pd) {
    banner = { text: tr('Ťahaj', 'Draw'), color: 'var(--brass)', sub: tr('Rozhodni sa na plagáte nad stolom.', 'Decide on the poster above the table.') };
  } else if (mine && pd?.kind === 'dutch') {
    banner = { text: tr('Odhoď 1 kartu', 'Discard 1 card'), color: 'var(--brass)', sub: tr('Dutch Will: vyber na plagáte, ktorú z dvoch kariet odhodíš.', 'Dutch Will: pick on the poster which of the two cards to discard.') };
  } else if (mine && pd?.kind === 'josh' && mode.k === 'idle') {
    banner = { text: tr('Použi vybavenie', 'Use the equipment'), color: 'var(--brass)', sub: tr('Josh McCloud: rozhodni na plagáte, čo s potiahnutou kartou.', 'Josh McCloud: decide on the poster what to do with the card you drew.') };
  } else if (mode.k === 'etarget' || mode.k === 'jacky') {
    banner = { text: tr('Vyber cieľ', 'Choose a target'), color: 'var(--missed)', sub: tr(`${mode.k === 'jacky' ? 'Jacky Murieta' : equipName(mode.card.type)}: ťukni na hráča s modrým obrysom.`, `${mode.k === 'jacky' ? 'Jacky Murieta' : equipName(mode.card.type)}: tap a player with a blue outline.`) };
  } else if (mode.k === 'target') {
    banner = { text: tr('Vyber cieľ', 'Choose a target'), color: 'var(--missed)', sub: tr(`${cardName(mode.card.type)}: ťukni na hráča s modrým obrysom.`, `${cardName(mode.card.type)}: tap a player with a blue outline.`) };
  } else if (myTurn) {
    banner = { text: me.ghost ? tr('Si na ťahu ako tieň', 'Your turn as a shadow') : tr('Si na ťahu', 'Your turn'), color: 'var(--brass)', sub: coarse ? tr('Ťukni na kartu, druhým ťuknutím ju zahráš. Podržaním ju zväčšíš.', 'Tap a card, tap again to play it. Hold to enlarge it.') : tr('Zahraj kartu alebo ukonči ťah. Stmavené karty sa teraz zahrať nedajú.', 'Play a card or end your turn. Dimmed cards cannot be played now.') };
  } else if (pd) {
    banner = { text: tr(`Čaká sa na hráča ${name(pd.player)}`, `Waiting for ${name(pd.player)}`), color: 'var(--parchment)', sub: '' };
  } else {
    banner = { text: tr(`Na ťahu je ${name(view.turn.player)}`, `It is ${name(view.turn.player)}'s turn`), color: 'var(--parchment)', sub: '' };
  }

  const n = view.hand.length;
  const alive = view.players.filter(p => p.alive).length;
  const shown = logOpen ? view.log : view.log.slice(-1);
  const names = view.players.map(p => p.name);
  const phaseHint = myTurn && mode.k === 'idle';
  const selCard = sel !== null ? view.hand.find(c => c.id === sel) : undefined;
  const selPlayable = !!selCard && (selCard.id in view.playable || view.beerGold.includes(selCard.id));

  const phases = (
    <div className="gb-phases" aria-label={tr(`Fázy ťahu hráča ${turnPlayer?.name ?? ''}`, `Turn phases of ${turnPlayer?.name ?? ''}`)}>
      {PHASES.map((ph, i) => (
        <span key={ph[0]} className={`${!view.winner && i < phaseIdx ? 'is-done' : ''} ${!view.winner && i === phaseIdx ? 'is-active' : ''}`}>
          <em>{i + 1}</em>{tr(ph)}
        </span>
      ))}
    </div>
  );

  const buttons = (
    <>
      {selCard && myTurn && mode.k === 'idle' && (selPlayable
        ? <button className="bang-btn bang-btn--primary bang-btn--play" type="button" onClick={() => { setSel(null); clickHand(selCard); }}>{tr('Zahraj', 'Play')} {cardName(selCard.type)}</button>
        : <span className="bang-caption nope">{view.why[selCard.id] ? whyText(view.why[selCard.id]) : tr('Túto kartu teraz nemôžeš zahrať.', 'You cannot play this card now.')}</span>)}
      {phaseHint && <button className="bang-btn bang-btn--primary" type="button" onClick={() => send({ type: 'endTurn' })}>{tr('Ukonči ťah', 'End turn')}</button>}
      {(mode.k === 'target' || mode.k === 'pick' || mode.k === 'etarget' || mode.k === 'jacky') && <button className="bang-btn" type="button" onClick={() => setMode({ k: 'idle' })}>{tr('Zruš výber', 'Cancel selection')}</button>}
      {phaseHint && view.abilities.map(a => (
        <button key={a.name} className="bang-btn bang-btn--gold" type="button"
          onClick={() => (a.name === 'jacky' ? setMode({ k: 'jacky', targets: a.targets ?? [] }) : send({ type: 'ability', name: a.name }))}>
          <Gold size={16} n={a.cost} />
          {a.name === 'setaccio' ? tr(`Panvica: ťahaj kartu (${a.left})`, `Gold Pan: draw a card (${a.left})`)
            : a.name === 'raddie' ? tr(`Raddie: ťahaj kartu (${a.left})`, `Raddie: draw a card (${a.left})`)
            : a.name === 'jacky' ? tr('Jacky: BANG! navyše', 'Jacky: extra BANG!')
            : a.name === 'josh' ? tr('Josh: vybavenie z balíka', 'Josh: equipment from the deck')
            : tr('Batoh: +1 život', 'Rucksack: +1 life')}
        </button>
      ))}
      {mine && pd?.kind === 'discard' && mode.k !== 'sid' && (
        <button className="bang-btn bang-btn--primary" type="button" disabled={chosen.length !== pd.count} onClick={() => send({ type: 'discard', cardIds: chosen })}>{tr('Potvrď odhodenie', 'Confirm discard')}</button>
      )}
      {mode.k === 'sid' && (
        <>
          <button className="bang-btn bang-btn--primary" type="button" disabled={chosen.length !== 2} onClick={() => send({ type: 'sid', cardIds: chosen })}>{tr('Odhoď a vylieč', 'Discard and heal')}</button>
          <button className="bang-btn" type="button" onClick={() => setMode({ k: 'idle' })}>{tr('Zruš', 'Cancel')}</button>
        </>
      )}
      {canSid && mode.k === 'idle' && !(mine && pd?.kind === 'lethal') && (
        <button className="bang-btn" type="button" onClick={() => setMode({ k: 'sid' })}>{tr('Sid: 2 karty za život', 'Sid: 2 cards for a life')}</button>
      )}
    </>
  );
  const status = myTurn ? tr(`Dostrel ${view.range} · BANG! v tomto ťahu: ${view.turn.bangs} z ${bangLimit}${view.turn.extra ? ' · ťah navyše' : ''}`, `Range ${view.range} · BANG! this turn: ${view.turn.bangs} of ${bangLimit}${view.turn.extra ? ' · extra turn' : ''}`) : view.turn.player === view.me ? tr('Tvoj ťah', 'Your turn') : tr(`Ťah hráča ${name(view.turn.player)}`, `${name(view.turn.player)}'s turn`);

  const ariaOfCard = (c: Card, mark: string) => `${cardTitle(c)}${mark.includes('is-disabled') ? ` ${view.why[c.id] ? whyText(view.why[c.id]) : tr('Teraz sa nedá zahrať.', 'Cannot be played now.')}` : ''}`;
  const hand = (
    <HandFan
      cards={view.hand} variant={layout === 'wide' ? 'wide' : 'swipe'} markOf={handMark} ariaOf={ariaOfCard}
      onTap={onHandTap} onPreview={c => setPreview(previewOfCard(c))}
      empty={me.alive ? tr('Nemáš žiadne karty v ruke.', 'You have no cards in hand.') : ''}
    />
  );

  const ident = (
    <div className="gb-ident">
      <div className="gb-pcard">
        <button type="button" className="gb-pcard__img" onClick={() => setPreview({ faceKey: me.character, kind: 'brown', title: CHARACTERS[me.character].name, sub: tr('Tvoja postava', 'Your character'), text: charText(me.character) })}
          aria-label={tr(`Tvoja postava ${CHARACTERS[me.character].name}, zväčšiť`, `Your character ${CHARACTERS[me.character].name}, enlarge`)}>
          <BigCard k={me.character} title={CHARACTERS[me.character].name} />
          <span className="gb-pcard__cap"><b>{CHARACTERS[me.character].name}</b><Hp hp={me.hp} max={me.maxHp} /></span>
        </button>
        <div className="gb-pcard__txt">
          <div className="gb-pcard__row"><h4 className="t-title">{CHARACTERS[me.character].name}</h4><span className="gb-chip">{tr('Postava', 'Character')}</span></div>
          <div className="gb-pcard__hp"><span>{tr('Životy', 'Lives')}</span><Hp hp={me.hp} max={me.maxHp} /></div>
          <p>{charText(me.character)}</p>
        </div>
      </div>
      <div className="gb-pcard gb-pcard--role" data-role={ROLE_KEY[view.myRole]}>
        <button type="button" className="gb-pcard__img" onClick={() => setPreview({ faceKey: view.myRole, kind: 'brown', title: roleName(view.myRole), sub: tr('Tvoja tajná rola', 'Your secret role'), text: roleGoal(view.myRole) })}
          aria-label={tr(`Tvoja rola ${roleName(view.myRole)}, zväčšiť`, `Your role ${roleName(view.myRole)}, enlarge`)}>
          <BigCard k={view.myRole} title={roleName(view.myRole)} />
          <span className="gb-pcard__cap"><b>{roleName(view.myRole)}</b><span>{roleGoal(view.myRole)}</span></span>
        </button>
        <div className="gb-pcard__txt">
          <span className="gb-kick">{tr('Tajná rola', 'Secret role')}</span>
          <h4 className="t-title">{roleName(view.myRole)}</h4>
          <div className="gb-goal"><span>{tr('Cieľ hry', 'Goal')}</span>{roleGoal(view.myRole)}</div>
        </div>
      </div>
    </div>
  );

  /** Zakladatel moze pocas hry vyhodit cloveka: nahradi ho bot, alebo sa vyradi z hry (volba v okne). */
  const kickFor = (id: string) => {
    const m = lobby.players.find(x => x.id === id);
    if (lobby.host !== lobby.me || !m || m.bot || id === lobby.me) return null;
    const label = tr(`Vyhodiť hráča ${m.name}`, `Remove player ${m.name}`);
    return (
      <button type="button" className="kick-btn kick-btn--text" title={label} aria-label={label} onClick={e => { e.stopPropagation(); setDetail(null); setAdmin(false); setKicking(id); }}>
        <UserX size={16} /><span>{tr('Vyhodiť', 'Remove')}</span>
      </button>
    );
  };
  const kickTarget = kicking ? view.players.find(p => p.id === kicking) : undefined;
  const kickMember = kicking ? lobby.players.find(p => p.id === kicking) : undefined;
  const kickDialog = kicking && kickTarget && kickMember && lobby.host === lobby.me && (
    <KickDialog
      name={kickMember.name} sheriff={(kickTarget.id === view.me ? view.myRole : kickTarget.role) === 'sceriffo'} out={!kickTarget.alive}
      onClose={() => setKicking(null)}
      onChoose={mode => { setKicking(null); void act('kick', { id: kicking, mode }); }}
    />
  );
  const humans = lobby.players.filter(p => !p.bot && p.id !== lobby.me);
  const adminDialog = admin && lobby.host === lobby.me && (
    <div className="gb-modal" role="presentation" onClick={() => setAdmin(false)} onKeyDown={e => { if (e.key === 'Escape') setAdmin(false); }}>
      <div className="gb-dialog kd" role="dialog" aria-modal="true" aria-labelledby="ad-t" onClick={e => e.stopPropagation()}>
        <div className="bang-prompt__kicker">{tr('Zakladateľ', 'Host')}</div>
        <h2 id="ad-t" className="bang-prompt__title">{tr('Hráči pri stole', 'Players at the table')}</h2>
        <ul className="kd__list">
          {humans.map(p => (
            <li key={p.id}><span className="who">{p.name}</span>{kickFor(p.id)}</li>
          ))}
          {!humans.length && <li className="kd__none">{tr('Si tu sám, nikoho nemáš koho vyhodiť.', 'You are alone here, there is nobody to remove.')}</li>}
        </ul>
        <button className="bang-btn bang-btn--on-paper" type="button" autoFocus onClick={() => setAdmin(false)}>{tr('Zavrieť', 'Close')}</button>
      </div>
    </div>
  );

  const leaveDialog = leaving && (
    <div className="gb-modal" role="presentation" onClick={() => setLeaving(false)} onKeyDown={e => { if (e.key === 'Escape') setLeaving(false); }}>
      <div className="gb-dialog" role="alertdialog" aria-modal="true" aria-labelledby="gb-leave-t" onClick={e => e.stopPropagation()}>
        <div className="bang-prompt__kicker">{tr('Opustiť hru', 'Leave the game')}</div>
        <h2 id="gb-leave-t" className="bang-prompt__title">{tr('Si si istý?', 'Are you sure?')}</h2>
        <p className="bang-prompt__body">{tr('Odídeš od stola. Ostatní hráči budú pokračovať a tvoje miesto prevzme bot.', 'You will leave the table. The other players will continue and a bot will take your seat.')}{lobby.host === lobby.me && tr(' Zakladateľom hry sa stane iný hráč.', ' Another player will become the host.')}</p>
        <div className="bang-prompt__actions">
          <button className="bang-btn bang-btn--primary" type="button" autoFocus onClick={() => setLeaving(false)}>{tr('Zostať v hre', 'Stay in the game')}</button>
          <button className="bang-btn bang-btn--on-paper" type="button" onClick={onLeave}>{tr('Áno, odísť', 'Yes, leave')}</button>
        </div>
      </div>
    </div>
  );

  const head = (
    <header className="gb-head">
      <a className="ch-logo" href="#/" aria-label="BANG! Online"><img src="/cards/bang_bandita.webp" alt="" draggable={false} /><span className="t-title brand">BANG! Online</span></a>
      <div className="gb-meta">
        <span>{tr('Miestnosť', 'Room')} <b className="gb-code">{lobby.code}</b></span>
        <i />
        <span>{tr('Živí hráči', 'Players alive')} <b className="gb-alive">{alive} {tr('z', 'of')} {view.players.length}</b></span>
        <i />
        <span>{tr('V balíčku', 'In deck')} <b>{view.deckCount} {tr('kariet', 'cards')}</b></span>
      </div>
      <div className="gb-mini" aria-label={tr('Miestnosť a živí hráči', 'Room and players alive')}>
        <b className="gb-code">{lobby.code}</b><span>{alive}/{view.players.length}</span>
      </div>
      <div className="gb-tools">
        {drawerLog && (
          <>
            <button type="button" className="gb-ico" aria-label={tr('Moja postava a rola', 'My character and role')} title={tr('Moja postava a rola', 'My character and role')} onClick={() => setDrawer('me')}><IdCard size={20} /></button>
            <button type="button" className="gb-ico" aria-label={tr('Denník a hráči', 'Log and players')} title={tr('Denník a hráči', 'Log and players')} onClick={() => setDrawer('log')}><ScrollText size={20} /></button>
          </>
        )}
        {lobby.host === lobby.me && humans.length > 0 && (
          <button type="button" className="gb-ico" aria-label={tr('Hráči: vyhodiť hráča', 'Players: remove a player')} title={tr('Hráči: vyhodiť hráča', 'Players: remove a player')} onClick={() => setAdmin(true)}><Users size={20} /></button>
        )}
        {layout !== 'wide' && <VoiceHeaderButton onClick={() => setDrawer('voice')} />}
        <LangSwitch />
        <SoundSwitch />
        <a className="gb-ico gb-ico--rules" href="#/pravidla" target="_blank" rel="noreferrer" title={tr('Pravidlá hry', 'Rules')} aria-label={tr('Pravidlá hry', 'Rules')}><BookOpen size={20} /></a>
        {layout === 'wide' && <button type="button" className="gb-ico gb-ico--fs" title={tr('Celá obrazovka', 'Fullscreen')} aria-label={tr('Celá obrazovka', 'Fullscreen')}
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}><Maximize size={20} /></button>}
        <button type="button" className="gb-ico gb-ico--leave" title={tr('Opustiť hru', 'Leave the game')} aria-label={tr('Opustiť hru', 'Leave the game')} onClick={() => setLeaving(true)}>
          <LogOut size={20} /><span>{tr('Odísť', 'Leave')}</span>
        </button>
      </div>
    </header>
  );

  const drawers = (
    <>
      <Drawer open={drawer === 'log'} onClose={() => setDrawer(null)} title={tr('Denník a hráči', 'Log and players')}>
        <ul className="dr-players" aria-label={tr('Hráči', 'Players')}>
          {view.players.map(p => (
            <li key={p.id} className={p.alive ? '' : 'is-dead'}>
              <span className="who">{p.name}{p.id === view.me && tr(' (ty)', ' (you)')}</span>
              <RoleBadge role={p.id === view.me ? view.myRole : p.role} />
              <Hp hp={p.hp} max={p.maxHp} />
              <span className="bang-seat__hand"><Icon name="cards" />{p.handCount}</span>
              {gr && <Gold size={15} n={p.gold} />}
              {kickFor(p.id)}
            </li>
          ))}
        </ul>
        <div className="dr-tools"><LangSwitch /><SoundSwitch /><a className="bang-btn" href="#/pravidla" target="_blank" rel="noreferrer"><BookOpen size={18} />{tr('Pravidlá hry', 'Rules')}</a></div>
        <div className="bang-label dr-sub">{tr('Saloon denník', 'Saloon log')}</div>
        <ul className="bang-log" aria-live="polite" ref={logRef}>
          {view.log.map((l, i) => <LogLine key={view.log.length - i + ':' + l.t} entry={l} names={names} />)}
        </ul>
      </Drawer>
      <Drawer open={drawer === 'voice'} onClose={() => setDrawer(null)} title={tr('Hlas a chat', 'Voice and chat')}>
        {drawer === 'voice' && <VoicePanel />}
      </Drawer>
      <Drawer open={drawer === 'me'} onClose={() => setDrawer(null)} title={tr('Moja postava a rola', 'My character and role')}>
        <div className="dr-ident">{ident}</div>
      </Drawer>
    </>
  );
  const hintEl = (
    <>
      {hint && !bigHint && (
        <div key={hint.id} className="gb-hint" role="status" aria-live="polite" onClick={() => setHint(null)}>
          <b>{hint.title}</b>
          <span>{hint.text}</span>
          {hint.lines.length > 0 && <small>{hint.lines.join(' · ')}</small>}
        </div>
      )}
      {bigHint && (
        <div className="gb-modal" role="presentation" onClick={() => setBigHint(null)} onKeyDown={e => { if (e.key === 'Escape') setBigHint(null); }}>
          <div className="gb-dialog hint-dialog" role="alertdialog" aria-modal="true" aria-labelledby="gb-hint-t" onClick={e => e.stopPropagation()}>
            <div className="bang-prompt__kicker">{tr('Prečo to nejde', 'Why it does not work')}</div>
            <h2 id="gb-hint-t" className="bang-prompt__title">{bigHint.title}</h2>
            <p className="bang-prompt__body hint-dialog__text">{bigHint.text}</p>
            {bigHint.lines.length > 0 && <ul className="hint-dialog__list">{bigHint.lines.map(l => <li key={l}>{l}</li>)}</ul>}
            <div className="bang-prompt__actions">
              <button className="bang-btn bang-btn--primary" type="button" autoFocus onClick={() => setBigHint(null)}>{tr('Rozumiem', 'Got it')}</button>
              <a className="bang-btn bang-btn--on-paper" href={gr ? '#/pravidla/gold-rush' : '#/pravidla'} target="_blank" rel="noreferrer">{tr('Otvoriť pravidlá', 'Open the rules')}</a>
            </div>
          </div>
        </div>
      )}
    </>
  );
  const previewEl = <><CardPreview data={preview} onClose={() => setPreview(null)} /><FlightLayer flights={fl.flights} done={fl.done} /></>;
  const detailP = detail ? byId(detail.id) : undefined;
  const closeDetail = useCallback(() => setDetail(null), []);
  const detailEl = detail && detailP && (
    <SeatDetail
      key={detail.id} p={detailP} role={detailP.id === view.me ? view.myRole : detailP.role} isMe={detailP.id === view.me}
      onTurn={!view.winner && view.turn.player === detailP.id} anchor={detail.rect} onClose={closeDetail}
      onPreview={c => setPreview(previewOfCard(c))} gold={gr} extra={kickFor(detailP.id)}
      onEquip={e => { setDetail(null); setMode({ k: 'owned', card: e, owner: detailP.id }); }}
    />
  );

  // ====================== telefon na vysku ======================
  if (layout === 'phone') {
    const opps = seated.slice(1);
    const posterNode = poster();
    const inflow = !!posterNode && !view.winner && mode.k !== 'pick' && view.store.length === 0 && mine && !!pd && ['bang', 'indians', 'duel', 'lethal', 'jesse', 'pedro'].includes(pd.kind);
    const meState = seatProps(me);
    const shout = (pid: string) => fx.find(f => f.pid === pid) ?? null;
    return (
      <main className={`gb ph ${inflow ? 'has-sheet' : ''}`} data-layout="phone">
        {head}
        <div className="ph-turn" aria-live="polite">
          <div className="ph-turn__t" style={{ color: banner.color }}>{banner.text}</div>
          {banner.sub && <p>{banner.sub}</p>}
        </div>

        <Orbit center={<><div className="ph-deckrow">{deckAndPile()}</div>{phases}</>}>
          {opps.map((p, i) => {
            const { states, tag, clickable } = seatProps(p);
            return (
              <OppToken
                key={p.id} p={p} role={p.role} states={states} tag={tag?.text} clickable={clickable} pos={orbitPos(i, opps.length)}
                shout={shout(p.id)} label={seatLabel(p, clickable)} onClick={el => clickSeat(p.id, el)} open={detail?.id === p.id} gold={gr}
              />
            );
          })}
        </Orbit>
        {shopRow}

        {inflow && <section className="ph-sheet" aria-live="assertive">{posterNode}</section>}

        <section className="ph-me" data-state={meState.states.join(' ')}>
          <button type="button" className="ph-me__id" onClick={() => setDrawer('me')} aria-label={tr('Moja postava a rola', 'My character and role')}>
            <span className="opp__pic"><Portrait ch={me.character} name={me.name} /></span>
            <span className="ph-me__txt">
              <span className="ph-me__name">{CHARACTERS[me.character].name}</span>
              <Hp hp={me.hp} max={me.maxHp} />
            </span>
          </button>
          <RoleBadge role={view.myRole} />
          {gr && <span className="ph-me__gold"><Gold size={20} n={view.myGold} /></span>}
          {myTurn && <span className="ph-me__stat">{status}</span>}
          {shout(me.id) && <span className={`bang-shout stage-shout is-small is-${shout(me.id)!.kind}`}>{shout(me.id)!.text}</span>}
        </section>

        <ShelfPanel cards={me.inPlay} equip={me.equip} onPreview={c => setPreview(previewOfCard(c))} onEquip={e => setMode({ k: 'owned', card: e, owner: me.id })} />

        <div className="ph-actions">{buttons}</div>
        <HandPanel count={n} hint={tr('Podrž kartu pre náhľad', 'Hold a card to enlarge')}>
          <HandFan
            cards={view.hand} variant="rail" markOf={handMark} ariaOf={ariaOfCard}
            onTap={onHandTap} onPreview={c => setPreview(previewOfCard(c))}
            empty={me.alive ? tr('Nemáš žiadne karty v ruke.', 'You have no cards in hand.') : ''}
          />
        </HandPanel>

        {!inflow && posterNode && (
          <div className="ph-modal">
            <div className="ph-modal__sheet">{posterNode}</div>
          </div>
        )}
        {drawers}
        {previewEl}
        {detailEl}
        {hintEl}
        {leaveDialog}{kickDialog}{adminDialog}
      </main>
    );
  }

  // ====================== telefon na sirku a tablet/desktop ======================
  return (
    <main className="gb" data-layout={layout}>
      {head}

      <section className="gb-main">
        {!drawerLog && (
          <section className={`gb-log ${logOpen ? 'is-open' : ''}`} aria-label={tr('Saloon denník', 'Saloon log')}>
            <button type="button" className="gb-log__head" onClick={() => setLogOpen(o => !o)} aria-expanded={logOpen}>
              <span><ScrollText size={15} />{tr('Saloon denník', 'Saloon log')}</span>
              <ChevronDown size={16} />
            </button>
            <ul className="bang-log" aria-live="polite" ref={logRef}>
              {shown.map((l, i) => <LogLine key={shown.length - i + ':' + l.t} entry={l} names={names} />)}
            </ul>
          </section>
        )}
        <Stage compact={layout === 'compact'}>{scene}</Stage>
        {layout === 'wide' && <VoiceDock slim={slimVoice} />}

        <div className="gb-banner">
          <div className="t-banner banner-line" style={{ color: banner.color }}>{banner.text}</div>
          {banner.sub && <p>{banner.sub}</p>}
          <div className="gb-actions">
            {phases}
            {buttons}
            <span className="bang-caption">{status}</span>
          </div>
        </div>
      </section>

      <footer className="gb-dock">
        {ident}
        <div className="gb-handwrap">
          <div className="gb-handhead">{tr('Tvoja ruka', 'Your hand')} ({n} {tr(n === 1 ? 'karta' : n < 5 && n > 0 ? 'karty' : 'kariet', n === 1 ? 'card' : 'cards')}) <small>{coarse ? tr('Ťukni na kartu, druhým ťuknutím ju zahráš, podržaním ju zväčšíš', 'Tap a card, tap again to play it, hold to enlarge') : tr('Kliknutím kartu zahráš, pravým tlačidlom ju zväčšíš', 'Click a card to play it, right-click to enlarge')}</small></div>
          {hand}
        </div>
        <section className={`gb-mytable ${me.inPlay.length + me.equip.length ? '' : 'is-empty'}`} aria-label={tr('Tvoje vyložené karty', 'Your cards in play')}>
          <div className="gb-handhead">
            {tr('Pred tebou', 'In front of you')} ({me.inPlay.length + me.equip.length})
            {gr && <span className="gb-gold" title={tr(`Máš ${nuggets(view.myGold)}`, `You have ${nuggets(view.myGold)}`)} aria-label={tr(`Máš ${nuggets(view.myGold)}`, `You have ${nuggets(view.myGold)}`)}><Gold size={22} n={view.myGold} /></span>}
          </div>
          <div className="gb-mytable__row">
            {me.equip.map(e => (
              <button key={e.id} type="button" className="gb-mytable__card is-equip" onClick={() => setMode({ k: 'owned', card: e, owner: me.id })}
                aria-label={equipName(e.type)} title={`${equipName(e.type)}: ${equipText(e.type)}`}>
                <EquipView card={e} size="table" />
              </button>
            ))}
            {me.inPlay.length + me.equip.length === 0
              ? <span className="gb-mytable__empty">{gr ? tr('Sem sa vyložia tvoje modré karty a kúpené vybavenie.', 'Your blue cards and bought equipment go here.') : tr('Sem sa vyložia tvoje modré karty: zbraň, Barel, Mustang, Mieridlo.', 'Your blue cards go here: weapon, Barrel, Mustang, Scope.')}</span>
              : me.inPlay.map(c => (
                <button key={c.id} type="button" className="gb-mytable__card" onClick={() => setPreview(previewOfCard(c))}
                  aria-label={tr(`${cardName(c.type)}, zväčšiť`, `${cardName(c.type)}, enlarge`)} title={cardTitle(c)}>
                  <CardView card={c} size="table" />
                  <span className="gb-mytable__name">{cardName(c.type)}</span>
                </button>
              ))}
          </div>
        </section>
      </footer>
      {drawers}
      {previewEl}
      {detailEl}
      {hintEl}
      {leaveDialog}{kickDialog}{adminDialog}
    </main>
  );
}







