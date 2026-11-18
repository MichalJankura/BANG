import { Lobby } from './net';
import { FullscreenButton } from './Setup';
import { LangSwitch, useLang } from './i18n';
import { VoiceDock, VoicePanel } from './VoiceDock';
import { seatAngles } from './geometry';
import { Gold } from './Cards';
import { useLayout, useNarrow } from './device';
import type { Act } from './appTypes';
import { KickButton } from './Dialogs';
import { Shell, Stage } from './Layout';
import { InviteButton } from './Invite';
import { useAccount } from './account';
import { ProfileMini, SeatBadge } from './Ranked';

export function LobbyScreen({ lobby, act, onLeave }: { lobby: Lobby; act: Act; onLeave: () => void }) {
  const { tr } = useLang();
  const layout = useLayout();
  const host = lobby.host === lobby.me;
  const n = lobby.players.length;
  const enough = n >= lobby.minPlayers;
  const i = Math.max(0, lobby.players.findIndex(p => p.id === lobby.me));
  const seated = [...lobby.players.slice(i), ...lobby.players.slice(0, i)];
  const angles = seatAngles(Math.max(n, 1));
  const slimVoice = useNarrow(1500);
  const ranked = !!lobby.ranked;
  const acc = useAccount();
  const rankedChip = ranked && <span className="rk-chip" title={tr('Ranked stôl: XP, rating a hodnosti', 'Ranked table: XP, rating and ranks')}>RANKED</span>;
  const rankedNote = tr('Ranked: len prihlásení hráči, bez botov. XP a rating sa zapíšu po konci hry.', 'Ranked: logged-in players only, no bots. XP and rating are recorded after the game.');

  if (layout === 'phone') {
    return (
      <main className="ph-lobby">
        <header className="ph-lobby__head">
          <span className="t-title brand">BANG!</span>
          {rankedChip}
          <span className="ph-lobby__tools"><LangSwitch /><FullscreenButton framed /><button className="bang-btn" type="button" onClick={onLeave}>{tr('Odíď', 'Leave')}</button></span>
        </header>
        <section className="ph-lobby__code" aria-label={tr('Kód miestnosti', 'Room code')}>
          <div className="bang-label">{tr('Kód miestnosti', 'Room code')}</div>
          <div className="t-display code-big">{lobby.code}</div>
          <div className="bang-caption">{tr('Pošli ho kamarátom', 'Send it to your friends')}</div>
          <InviteButton code={lobby.code} />
        </section>
        <section className="ph-lobby__list" aria-label={tr('Hráči', 'Players')}>
          <div className="t-title">{tr(`Pri stole ${n} zo 7`, `${n} of 7 at the table`)}</div>
          <ul>
            {lobby.players.map(p => (
              <li key={p.id} className={p.id === lobby.me ? 'is-me' : ''} style={{ opacity: p.connected ? 1 : 0.55 }}>
                <span className="bang-seat__portrait">{p.name.slice(0, 1).toUpperCase()}</span>
                <span className="who">{p.name}{p.id === lobby.me && tr(' (ty)', ' (you)')}</span>
                {p.badge && <SeatBadge badge={p.badge} />}
                <span className="state">{[p.id === lobby.host && tr('Zakladateľ', 'Host'), p.bot && 'Bot', !p.connected && tr('Odpojený', 'Disconnected')].filter(Boolean).join(', ') || tr('Pripravený', 'Ready')}</span>
                {host && p.id !== lobby.me && <KickButton name={p.name} onKick={() => act('kick', { id: p.id })} />}
              </li>
            ))}
          </ul>
        </section>
        <details className="ph-lobby__chat">
          <summary>{tr('Hlas a chat', 'Voice and chat')}</summary>
          <VoicePanel />
        </details>
        <section className="ph-lobby__act">
          <div className="t-banner" style={{ color: 'var(--brass)' }}>{enough ? tr('Môžete začať', 'You can start') : tr(`Čaká sa na hráčov (${n}/${lobby.minPlayers})`, `Waiting for players (${n}/${lobby.minPlayers})`)}</div>
          {host ? (
            <>
              <button className="bang-btn bang-btn--primary" type="button" disabled={!enough} onClick={() => act('start')}>{tr('Začni hru', 'Start game')}</button>
              {!ranked && <div className="ph-lobby__two">
                <button className="bang-btn" type="button" disabled={n >= 7} onClick={() => act('addBot')}>{tr('Pridaj bota', 'Add a bot')}</button>
                <button className="bang-btn" type="button" disabled={!lobby.players.some(p => p.bot)} onClick={() => act('removeBot')}>{tr('Odober bota', 'Remove a bot')}</button>
              </div>}
            </>
          ) : <p className="bang-caption">{tr('Čaká sa, kým zakladateľ spustí hru.', 'Waiting for the host to start the game.')}</p>}
          {host ? <LobbyOptions lobby={lobby} act={act} /> : <LobbyOptions lobby={lobby} />}
          <p className="bang-caption">{ranked ? rankedNote : tr('Hra je pre 4 až 7 hráčov. Boti hrajú náhodne, slúžia na skúšanie.', 'The game is for 4 to 7 players. Bots play randomly and are for testing.')}</p>
          {ranked && acc.profile && <ProfileMini profile={acc.profile} />}
        </section>
      </main>
    );
  }

  return (
    <Shell
      top={<>
        <span className="t-title brand">BANG!</span>
        {rankedChip}
        <span className="bang-caption">{tr('Miestnosť', 'Room')} <b>{lobby.code}</b> · {n} {tr(n === 1 ? 'hráč' : n < 5 ? 'hráči' : 'hráčov', n === 1 ? 'player' : 'players')}</span>
        <span className="ph-lobby__tools" style={{ marginLeft: 'auto' }}><LangSwitch /><FullscreenButton framed /></span>
        <button className="bang-btn" type="button" onClick={onLeave}>{tr('Odíď', 'Leave')}</button>
      </>}
      stage={<>
        <Stage compact={layout === 'compact'}>{geo => (
          <>
            <div className="bang-lamp" style={{ transform: `translate(${geo.CX}px, ${geo.CY}px)` }} />
            <div className="felt-code">
              <div className="bang-label">{tr('Kód miestnosti', 'Room code')}</div>
              <div className="t-display code-big">{lobby.code}</div>
              <div className="bang-caption">{tr('Pošli ho kamarátom', 'Send it to your friends')}</div>
              <InviteButton code={lobby.code} />
            </div>
            {seated.map((p, k) => {
              const pos = geo.seatPos(angles[k]);
              return (
                <div key={p.id} className="bang-seat" data-state={p.id === lobby.me ? 'me' : ''} style={{ left: pos.x, top: pos.y, opacity: p.connected ? 1 : 0.5 }}>
                  <span className="bang-seat__portrait">{p.name.slice(0, 1).toUpperCase()}</span>
                  <span className="bang-seat__name">{p.name}{p.id === lobby.me && tr(' (ty)', ' (you)')}</span>
                  {p.badge && <SeatBadge badge={p.badge} />}
                  <span className="bang-seat__row bang-caption">
                    {[p.id === lobby.host && tr('Zakladateľ', 'Host'), p.bot && 'Bot', !p.connected && tr('Odpojený', 'Disconnected')].filter(Boolean).join(' · ') || tr('Pripravený', 'Ready')}
                  </span>
                  {host && p.id !== lobby.me && <KickButton name={p.name} onKick={() => act('kick', { id: p.id })} floating />}
                </div>
              );
            })}
          </>
        )}</Stage>
        <div className="vc-lobby"><VoiceDock slim={slimVoice} /></div>
      </>}
      left={<>
        {ranked && acc.profile && <ProfileMini profile={acc.profile} />}
        <div className="t-title">{tr(`Pri stole ${n} zo 7`, `${n} of 7 at the table`)}</div>
        {!ranked && <p className="bang-caption">{tr('Hra je pre 4 až 7 hráčov. Miesta sa pri každom novom hráčovi rozostúpia okolo stola.', 'The game is for 4 to 7 players. Seats spread around the table with every new player.')}</p>}
      </>}
      center={<>
        <div className="t-banner" style={{ color: 'var(--brass)' }}>{enough ? tr('Môžete začať', 'You can start') : tr(`Čaká sa na hráčov (${n}/${lobby.minPlayers})`, `Waiting for players (${n}/${lobby.minPlayers})`)}</div>
        {host ? (
          <div className="row center">
            <button className="bang-btn bang-btn--primary" type="button" disabled={!enough} onClick={() => act('start')}>{tr('Začni hru', 'Start game')}</button>
            {!ranked && <button className="bang-btn" type="button" disabled={n >= 7} onClick={() => act('addBot')}>{tr('Pridaj bota', 'Add a bot')}</button>}
            {!ranked && <button className="bang-btn" type="button" disabled={!lobby.players.some(p => p.bot)} onClick={() => act('removeBot')}>{tr('Odober bota', 'Remove a bot')}</button>}
          </div>
        ) : <p className="bang-caption">{tr('Čaká sa, kým zakladateľ spustí hru.', 'Waiting for the host to start the game.')}</p>}
        {host ? <LobbyOptions lobby={lobby} act={act} /> : <LobbyOptions lobby={lobby} />}
        <p className="bang-caption">{ranked ? rankedNote : tr('Boti hrajú náhodne, slúžia na skúšanie.', 'Bots play randomly and are for testing.')}</p>
      </>}
      right={null}
    />
  );
}

/** Volby hry v lobby: rozsirenie Gold Rush a variant tienov. Meni ich len zakladatel. */
export function LobbyOptions({ lobby, act }: { lobby: Lobby; act?: Act }) {
  const { tr } = useLang();
  const o = { goldRush: false, shadows: false, ...lobby.opts };
  const set = (patch: Partial<typeof o>) => act?.('options', { ...o, ...patch });
  const items: [keyof typeof o, string, string][] = [
    ['goldRush', 'Gold Rush', tr('Nugety, vybavenie a 8 nových postáv', 'Nuggets, equipment and 8 new characters')],
    ['shadows', tr('Tieňoví pištoľníci', 'Shadow gunslingers'), tr('Vyradení hráči sa vracajú na svoj ťah', 'Eliminated players return for their turn')],
  ];
  return (
    <div className="lobby-opts" role="group" aria-label={tr('Rozšírenia', 'Expansions')}>
      {items.map(([k, title, sub]) => (
        <button key={k} type="button" className={`lobby-opt ${o[k] ? 'is-on' : ''}`} role="switch" aria-checked={o[k]} disabled={!act} onClick={() => set({ [k]: !o[k] })}>
          <span className="lobby-opt__sw" aria-hidden="true"><i /></span>
          <span className="lobby-opt__txt"><b>{k === 'goldRush' && <Gold size={16} />}{title}</b><small>{sub}</small></span>
        </button>
      ))}
      <a className="lobby-opts__more" href="#/pravidla/gold-rush" target="_blank" rel="noreferrer">{tr('Pravidlá rozšírenia', 'Expansion rules')}</a>
    </div>
  );
}
