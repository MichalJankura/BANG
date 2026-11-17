import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as RKeyEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Headphones, HeadphoneOff, Mic, MicOff, MessageSquare, PhoneOff, RefreshCw, SendHorizontal, Users, Volume2, VolumeX } from 'lucide-react';
import { useLang } from './i18n';
import { sendChat, setChatOpen, toggleMic, toggleMute, toggleMuteAll, leaveVoice, retryPeer, selectMic, unlockAudio, usePeerVolume, useVoice, voiceDebug, voiceDebugOn, VOLUME_ADJUSTABLE, VOLUME_MAX, VOLUME_MIN, VOLUME_STEP, type ChatMsg, type MicError, type VoiceDebug, type VoiceState } from './voice';
import './voice.css';

type Tr = ReturnType<typeof useLang>['tr'];

const ICON = 20;

function micNote(e: MicError, tr: Tr): string {
  switch (e) {
    case 'denied': return tr('Prehliadač zablokoval mikrofón. Povoľ ho cez ikonu zámku pri adrese. Ostatných počuješ.', 'The browser blocked the microphone. Allow it with the lock icon by the address. You can hear the others.');
    case 'none': return tr('Nenašiel sa žiadny mikrofón. Ostatných počuješ.', 'No microphone found. You can hear the others.');
    case 'insecure': return tr('Mikrofón funguje len na zabezpečenej adrese (https). Ostatných počuješ.', 'The microphone only works on a secure (https) address. You can hear the others.');
    case 'busy': return tr('Mikrofón práve používa iná aplikácia. Ostatných počuješ.', 'Another app is using the microphone. You can hear the others.');
    default: return '';
  }
}

function micLabel(v: VoiceState, tr: Tr): string {
  if (v.busy) return tr('Pripájam hlas', 'Connecting voice');
  if (!v.joined) return tr('Zapnúť hlasový chat', 'Join voice chat');
  if (!v.hasMic) return tr('Zapnúť môj mikrofón', 'Turn on my microphone');
  return v.selfMuted ? tr('Zapnúť môj mikrofón', 'Unmute my microphone') : tr('Stlmiť môj mikrofón', 'Mute my microphone');
}

/** Tlacidlo mikrofonu: prvy klik pripoji do hlasu, dalsie stlmuju a zapinaju mikrofon. */
export function MicButton({ className = '' }: { className?: string }) {
  const { tr } = useLang();
  const v = useVoice();
  const live = v.joined && v.hasMic && !v.selfMuted;
  const off = v.joined && (!v.hasMic || v.selfMuted);
  const talking = live && v.speaking.includes(v.me);
  const label = micLabel(v, tr);
  return (
    <button type="button" className={`vc__btn vc__mic ${live ? 'is-live' : ''} ${off ? 'is-off' : ''} ${talking ? 'is-talking' : ''} ${className}`}
      onClick={() => void toggleMic()} disabled={v.busy} aria-pressed={v.joined ? live : false} aria-label={label} title={label}>
      {off ? <MicOff size={ICON} /> : <Mic size={ICON} />}
    </button>
  );
}

/** Rychle stlmenie vsetkych ostatnych naraz. */
export function MuteAllButton({ className = '' }: { className?: string }) {
  const { tr } = useLang();
  const v = useVoice();
  const label = v.muteAll ? tr('Zrušiť stlmenie všetkých', 'Unmute everyone') : tr('Stlmiť všetkých', 'Mute everyone');
  return (
    <button type="button" className={`vc__btn vc__all ${v.muteAll ? 'is-off' : ''} ${className}`} onClick={toggleMuteAll} aria-pressed={v.muteAll} aria-label={label} title={label}>
      {v.muteAll ? <VolumeX size={ICON} /> : <Volume2 size={ICON} />}
    </button>
  );
}

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex na @Meno (mena mozu mat medzery, dlhsie mena maju prednost). */
function mentionRe(names: string[]): RegExp | null {
  const list = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length).map(esc);
  return list.length ? new RegExp(`@(${list.join('|')})(?![\\p{L}\\p{N}_])`, 'giu') : null;
}

/** Rozdeli text spravy na obycajny text a zvyraznene @oznacenia. */
function renderText(text: string, re: RegExp | null, myName: string): ReactNode {
  if (!re) return text;
  const out: ReactNode[] = [];
  let last = 0;
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const me = m[1].toLowerCase() === myName.toLowerCase();
    out.push(<mark key={m.index} className={`vc__at ${me ? 'is-me' : ''}`}>{m[0]}</mark>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function pingsMe(text: string, myName: string): boolean {
  return !!myName && new RegExp(`@${esc(myName)}(?![\\p{L}\\p{N}_])`, 'iu').test(text);
}

function Line({ m, re, myName, tr }: { m: ChatMsg; re: RegExp | null; myName: string; tr: Tr }) {
  if (m.sys) return <li className="is-sys">{m.text}</li>;
  return <li className={`${m.mine ? 'is-mine' : ''} ${!m.mine && pingsMe(m.text, myName) ? 'is-ping' : ''}`}><b>{m.mine ? tr('Ty', 'You') : m.name}:</b> <span>{renderText(m.text, re, myName)}</span></li>;
}

function Bars({ on }: { on: boolean }) {
  return <span className={`vc__bars ${on ? 'is-on' : ''}`} aria-hidden="true"><i /><i /><i /></span>;
}

/** Posuvnik hlasitosti jedneho hraca: 0 az 200 %, 100 % je zvyraznene, dvojklik alebo klik na cislo vrati 100 %. */
function VolumeSlider({ id, name, tr }: { id: string; name: string; tr: Tr }) {
  const { volume, muted, set, reset } = usePeerVolume(id);
  const pct = Math.round(volume * 100);
  return (
    <div className={`vc__vol ${muted ? 'is-off' : ''} ${volume > 1 ? 'is-boost' : ''}`}>
      <span className="vc__rng" style={{ ['--p' as string]: `${(volume / VOLUME_MAX) * 100}%` }}>
        <input type="range" className="vc__range" min={VOLUME_MIN * 100} max={VOLUME_MAX * 100} step={VOLUME_STEP * 100} value={pct}
          onChange={e => set(Number(e.target.value) / 100)} onDoubleClick={reset}
          aria-label={tr(`Hlasitosť hráča ${name}`, `Volume of ${name}`)} aria-valuetext={`${pct} %`} />
      </span>
      <button type="button" className="vc__pct" onClick={reset} disabled={pct === 100}
        title={tr('Vrátiť na 100 %', 'Reset to 100%')} aria-label={tr(`Vrátiť hlasitosť hráča ${name} na 100 %`, `Reset ${name} volume to 100%`)}>{pct} %</button>
    </div>
  );
}

function PeerRow({ id, name, v, tr }: { id: string; name: string; v: VoiceState; tr: Tr }) {
  const here = v.inVoice.includes(id);
  const st = v.peers[id];
  const muted = v.muted.includes(id);
  const poor = st === 'live' && v.quality[id] === 'poor';
  const status = !here ? tr('nie je v hlase', 'not in voice')
    : !v.joined ? tr('v hlase', 'in voice')
    : st === 'live' ? (poor ? tr('slabé spojenie', 'weak connection') : v.speaking.includes(id) ? tr('hovorí', 'talking') : tr('v hlase', 'in voice'))
    : st === 'failed' ? tr('spojenie zlyhalo', 'connection failed') : tr('pripája sa', 'connecting');
  return (
    <li className={`${muted ? 'is-muted' : ''} ${here ? '' : 'is-away'}`}>
      <Bars on={v.speaking.includes(id)} />
      <span className="vc__who"><b>{name}</b><small className={st === 'failed' || poor ? 'is-bad' : ''}>{status}</small>
        {v.joined && here && st === 'failed' && <button type="button" className="vc__retry" onClick={() => retryPeer(id)}><RefreshCw size={13} />{tr('Skúsiť znova', 'Try again')}</button>}
      </span>
      <button type="button" className={`vc__btn vc__btn--sm ${muted ? 'is-off' : ''}`} onClick={() => toggleMute(id)} aria-pressed={muted}
        aria-label={muted ? tr(`Zrušiť stlmenie hráča ${name}`, `Unmute ${name}`) : tr(`Stlmiť hráča ${name} (hlas aj chat)`, `Mute ${name} (voice and chat)`)}
        title={muted ? tr('Zrušiť stlmenie', 'Unmute') : tr('Stlmiť hlas aj chat', 'Mute voice and chat')}>
        {muted ? <HeadphoneOff size={17} /> : <Headphones size={17} />}
        <span>{muted ? tr('Stlmený', 'Muted') : tr('Stlmiť', 'Mute')}</span>
      </button>
      {VOLUME_ADJUSTABLE && <VolumeSlider id={id} name={name} tr={tr} />}
    </li>
  );
}

/** Pas navrchu obrazovky: zvuk ostatnych caka na klepnutie (iOS), alebo sa hlas po prerusenom spojeni pripaja znova. */
export function VoiceBanner() {
  const { tr } = useLang();
  const v = useVoice();
  if (v.audioBlocked) {
    return (
      <button type="button" className="vc-banner" onClick={unlockAudio}>
        <Volume2 size={18} aria-hidden="true" />
        <span>{tr('Klepni, aby si počul ostatných', 'Tap to hear the others')}</span>
      </button>
    );
  }
  if (v.rejoining) {
    return <div className="vc-banner vc-banner--note" role="status"><RefreshCw size={16} aria-hidden="true" /><span>{tr('Hlas sa prerušil. Pripájam znova.', 'Voice was interrupted. Reconnecting.')}</span></div>;
  }
  return null;
}

/** Diagnostika hlasu pre telefon (`?voicedebug=1`): stav zvukoveho kontextu, prehravacov, typ cesty (relay / priamo) a hladina zvuku. */
export function VoiceDebugPanel() {
  const [d, setD] = useState<VoiceDebug>(() => voiceDebug());
  useEffect(() => { const t = setInterval(() => setD(voiceDebug()), 1000); return () => clearInterval(t); }, []);
  return (
    <pre className="vc__debug" aria-label="voice debug">
      {`ios ${d.ios} | ctx ${d.ctx} | https ${d.secure}\nturn ${d.hasTurn} | ice ${d.iceServers} | rejoin ${d.wantVoice}`}
      {d.peers.map(p => `\n${p.name}: ${p.state} ${p.mode}${p.paused ? ' PAUSED' : ''} ${p.path} lvl ${p.level} ${p.quality}`).join('')}
    </pre>
  );
}

/** Zoznam hracov: kazdeho mozno stlmit zvlast (hlas aj chat) a nastavit mu hlasitost. */
export function Roster({ onClose }: { onClose?: () => void }) {
  const { tr } = useLang();
  const v = useVoice();
  const others = v.players.filter(p => p.id !== v.me && !p.bot);
  return (
    <div className="vc__roster" role="group" aria-label={tr('Hráči v hlasovom chate', 'Players in voice chat')}>
      <div className="vc__roster-head">
        <b>{tr('Hlas hráčov', 'Player voices')}</b>
        {onClose && <button type="button" className="vc__x" onClick={onClose} aria-label={tr('Zavrieť', 'Close')}><ChevronDown size={18} /></button>}
      </div>
      {v.micError && v.joined && <p className="vc__note" role="status">{micNote(v.micError, tr)}</p>}
      {v.joined && v.devices.length > 0 && (
        <label className="vc__sel">
          <span>{tr('Mikrofón', 'Microphone')}</span>
          <select value={v.micId} onChange={e => void selectMic(e.target.value)} aria-label={tr('Vybrať mikrofón', 'Choose microphone')}>
            {!v.devices.some(d => d.id === v.micId) && <option value="">{tr('Predvolený mikrofón', 'Default microphone')}</option>}
            {v.devices.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
      )}
      {others.length === 0 && <p className="vc__empty">{tr('Ostatní hráči sú boti, nikoho tu nepočuješ.', 'The other players are bots, there is nobody to hear.')}</p>}
      {v.joined && others.some(p => v.peers[p.id] === 'failed') && (
        <p className="vc__note" role="status">{v.hasTurn
          ? tr('Spojenie sa nepodarilo ani cez relay. Skús znova, alebo zmeň sieť (napr. mobilné dáta).', 'The connection failed even through the relay. Try again or switch network (e.g. mobile data).')
          : tr('Spojenie sa nepodarilo. Server nemá nastavený relay (TURN), preto to cez prísnu sieť nemusí ísť. Skús znova alebo zmeň sieť.', 'The connection failed. The server has no relay (TURN) set up, so strict networks may not work. Try again or switch network.')}</p>
      )}
      <ul>
        {others.map(p => <PeerRow key={p.id} id={p.id} name={p.name} v={v} tr={tr} />)}
      </ul>
      {v.joined && (
        <button type="button" className="vc__leave" onClick={leaveVoice}><PhoneOff size={17} />{tr('Odpojiť sa z hlasu', 'Leave voice')}</button>
      )}
      {voiceDebugOn() && <VoiceDebugPanel />}
    </div>
  );
}

/** Okno textoveho chatu. `open` = zobrazeny cely vlakno, inak len posledna sprava a pole na pisanie. */
export function ChatBox({ open, onToggle, className = '' }: { open: boolean; onToggle?: () => void; className?: string }) {
  const { tr } = useLang();
  const v = useVoice();
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [caret, setCaret] = useState(0);
  const [pick, setPick] = useState(0);
  const msgs = v.messages.filter(m => m.sys || !v.muted.includes(m.from));
  const last = msgs[msgs.length - 1];
  const myName = v.players.find(p => p.id === v.me)?.name ?? '';
  const re = useMemo(() => mentionRe(v.players.map(p => p.name)), [v.players]);

  // Navrhy po napisani @: hraci, ktorych meno zacina (alebo obsahuje) napisane pismena.
  const q = /(^|\s)@([^\s@]*)$/.exec(text.slice(0, caret));
  const cands = q ? v.players.filter(p => p.id !== v.me && !p.bot && p.name.toLowerCase().includes(q[2].toLowerCase()))
    .sort((a, b) => Number(b.name.toLowerCase().startsWith(q[2].toLowerCase())) - Number(a.name.toLowerCase().startsWith(q[2].toLowerCase()))).slice(0, 5) : [];
  const showCands = cands.length > 0;
  const choose = (name: string) => {
    if (!q) return;
    const at = caret - q[2].length - 1;
    const next = `${text.slice(0, at)}@${name} ${text.slice(caret)}`;
    const pos = at + name.length + 2;
    setText(next); setPick(0); setCaret(pos);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(pos, pos); });
  };
  const onKey = (e: RKeyEvent<HTMLInputElement>) => {
    if (!showCands) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setPick(i => (i + 1) % cands.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setPick(i => (i - 1 + cands.length) % cands.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(cands[Math.min(pick, cands.length - 1)].name); }
    else if (e.key === 'Escape') { e.stopPropagation(); setCaret(0); }
  };

  useEffect(() => { setChatOpen(open); return () => setChatOpen(false); }, [open]);
  useEffect(() => { const el = list.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs.length, open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true);
    const t = text;
    setText('');
    const r = await sendChat(t);
    setBusy(false);
    if (r) { setErr(r); setText(t); setTimeout(() => setErr(''), 4000); } else setErr('');
  };

  return (
    <section className={`vc__chat ${open ? 'is-open' : ''} ${className}`} aria-label={tr('Textový chat', 'Text chat')}>
      {open ? (
        <>
          <header className="vc__chat-head">
            <b><MessageSquare size={15} />{tr('Chat miestnosti', 'Room chat')}</b>
            {onToggle && <button type="button" className="vc__x" onClick={onToggle} aria-label={tr('Zbaliť chat', 'Collapse chat')}><ChevronDown size={18} /></button>}
          </header>
          <ul className="vc__log" role="log" aria-live="polite" ref={list}>
            {msgs.length === 0 && <li className="vc__empty">{tr('Zatiaľ nikto nič nenapísal. Pošli prvú správu.', 'Nobody has written yet. Send the first message.')}</li>}
            {msgs.map(m => <Line key={m.id} m={m} re={re} myName={myName} tr={tr} />)}
          </ul>
        </>
      ) : (
        <button type="button" className="vc__peek" onClick={onToggle} aria-label={tr('Otvoriť chat', 'Open chat')} title={tr('Otvoriť chat', 'Open chat')}>
          {last ? (last.sys ? <span className="vc__sys">{last.text}</span> : <><b>{last.mine ? tr('Ty', 'You') : last.name}:</b> <span>{last.text}</span></>) : <span className="vc__empty">{tr('Chat miestnosti', 'Room chat')}</span>}
          {v.unread > 0 && <em className="vc__badge" aria-label={tr(`${v.unread} nových správ`, `${v.unread} new messages`)}>{v.unread}</em>}
          <ChevronUp size={16} aria-hidden="true" />
        </button>
      )}
      {err && <p className="vc__err" role="alert">{err}</p>}
      {showCands && (
        <ul className="vc__cands" role="listbox" aria-label={tr('Označiť hráča', 'Mention a player')}>
          {cands.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === pick}>
              <button type="button" className={i === pick ? 'is-on' : ''} onPointerDown={e => e.preventDefault()} onClick={() => choose(p.name)}>@{p.name}</button>
            </li>
          ))}
        </ul>
      )}
      <form className="vc__form" onSubmit={submit}>
        <input ref={input} type="text" value={text} maxLength={300} onChange={e => { setText(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); setPick(0); }}
          onKeyDown={onKey} onKeyUp={e => setCaret(e.currentTarget.selectionStart ?? 0)} onClick={e => setCaret(e.currentTarget.selectionStart ?? 0)}
          autoComplete="off" enterKeyHint="send"
          aria-label={tr('Správa pre ostatných hráčov', 'Message for the other players')} aria-autocomplete="list" placeholder={tr('Napíš správu, @ označí hráča', 'Write a message, @ mentions a player')} />
        <button type="submit" className="vc__send" disabled={busy || !text.trim()} aria-label={tr('Odoslať správu', 'Send message')} title={tr('Odoslať', 'Send')}><SendHorizontal size={18} /></button>
      </form>
    </section>
  );
}

/** Ovladanie vlavo dole pri stole: mikrofon, stlmit vsetkych, hraci, chat. */
export function VoiceDock({ slim }: { slim: boolean }) {
  const { tr } = useLang();
  const v = useVoice();
  const [roster, setRoster] = useState(false);
  const [chat, setChat] = useState(false);
  const root = useRef<HTMLElement>(null);

  // Zatvorenie rozbalenych okien kliknutim mimo alebo klavesom Escape.
  useEffect(() => {
    if (!roster && !(slim && chat)) return;
    const down = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) { setRoster(false); if (slim) setChat(false); } };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setRoster(false); if (slim) setChat(false); } };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [roster, chat, slim]);

  const others = v.players.filter(p => p.id !== v.me && !p.bot).length;
  const inVoiceOthers = v.inVoice.filter(id => id !== v.me).length;
  const note = v.joined && v.micError ? micNote(v.micError, tr) : '';

  return (
    <aside className={`vc ${slim ? 'is-slim' : ''}`} ref={root} aria-label={tr('Hlasový a textový chat', 'Voice and text chat')}>
      {roster && <Roster onClose={() => setRoster(false)} />}
      {slim && chat && <ChatBox open onToggle={() => setChat(false)} className="vc__chat--float" />}
      {note && !roster && <p className="vc__note vc__note--dock" role="status">{note}</p>}
      <div className="vc__bar">
        <MicButton />
        <MuteAllButton />
        <button type="button" className={`vc__btn vc__people ${roster ? 'is-open' : ''}`} onClick={() => { setRoster(r => !r); if (slim) setChat(false); }} aria-expanded={roster}
          aria-label={tr('Stlmiť jednotlivých hráčov', 'Mute individual players')} title={tr('Stlmiť jednotlivých hráčov', 'Mute individual players')} disabled={others === 0 && !v.joined}>
          <Users size={ICON} />
          {inVoiceOthers > 0 && <em className="vc__badge vc__badge--count" aria-hidden="true">{inVoiceOthers}</em>}
        </button>
        {slim ? (
          <button type="button" className={`vc__btn vc__chatbtn ${chat ? 'is-open' : ''}`} onClick={() => { setChat(c => !c); setRoster(false); }} aria-expanded={chat}
            aria-label={tr('Otvoriť chat', 'Open chat')} title={tr('Otvoriť chat', 'Open chat')}>
            <MessageSquare size={ICON} />
            {v.unread > 0 && <em className="vc__badge">{v.unread}</em>}
          </button>
        ) : (
          <ChatBox open={chat} onToggle={() => setChat(c => !c)} />
        )}
      </div>
    </aside>
  );
}

/** Obsah panela pre telefon: to iste ako dock, len pod sebou. */
export function VoicePanel() {
  const { tr } = useLang();
  const v = useVoice();
  const label = !v.joined ? tr('Zapnúť hlasový chat', 'Join voice chat') : v.selfMuted || !v.hasMic ? tr('Mikrofón je vypnutý', 'Microphone is off') : tr('Mikrofón je zapnutý', 'Microphone is on');
  return (
    <div className="vc-panel">
      <div className="vc-panel__row">
        <MicButton />
        <MuteAllButton />
        <span className="vc-panel__label">{label}</span>
      </div>
      <Roster />
      <ChatBox open className="vc__chat--panel" />
    </div>
  );
}

/** Tlacidlo v hlavicke (telefon): otvori panel. Ukazuje, ci niekto hovori a pocet neprecitanych sprav. */
export function VoiceHeaderButton({ onClick }: { onClick: () => void }) {
  const { tr } = useLang();
  const v = useVoice();
  const talking = v.speaking.some(id => id !== v.me);
  const label = tr('Hlas a chat', 'Voice and chat');
  return (
    <button type="button" className={`gb-ico vc__hdr ${v.joined ? 'is-joined' : ''} ${talking ? 'is-talking' : ''}`} onClick={onClick} aria-label={label} title={label}>
      {v.joined && (!v.hasMic || v.selfMuted) ? <MicOff size={20} /> : <Mic size={20} />}
      {v.unread > 0 && <em className="vc__badge">{v.unread}</em>}
    </button>
  );
}
