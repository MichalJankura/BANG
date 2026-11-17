import { useEffect, useState } from 'react';
import { UserX } from 'lucide-react';
import { useLang } from './i18n';
import type { JoinAsk } from './appTypes';

/** Vyhodenie hraca z lobby: prvy dotyk len pripravi (zmeni sa na "Vyhodiť?"), druhy ho naozaj vyhodi. */
export function KickButton({ name, onKick, floating }: { name: string; onKick: () => void; floating?: boolean }) {
  const { tr } = useLang();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  const label = tr(`Vyhodiť hráča ${name}`, `Remove player ${name}`);
  return (
    <button type="button" className={`kick-btn ${armed ? 'is-armed' : ''} ${floating ? 'kick-btn--float' : ''}`} title={label} aria-label={armed ? tr(`Potvrdiť vyhodenie: ${name}`, `Confirm removing ${name}`) : label}
      onClick={e => { e.stopPropagation(); if (armed) { setArmed(false); onKick(); } else setArmed(true); }}>
      <UserX size={16} />{armed && <span>{tr('Vyhodiť?', 'Remove?')}</span>}
    </button>
  );
}

/** Okno pre schvalovatela: novy hrac sa chce pripojit do rozbehnutej hry a nahradi bota. Po case sa otazka presunie na dalsieho. */
export function JoinAskDialog({ ask, onAnswer }: { ask: JoinAsk; onAnswer: (ok: boolean) => void }) {
  const { tr } = useLang();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((ask.at - now) / 1000));
  return (
    <div className="gb-modal join-ask" role="presentation">
      <div className="gb-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ja-t" aria-describedby="ja-d">
        <div className="bang-prompt__kicker">{tr('Žiadosť o pripojenie', 'Join request')}</div>
        <h2 id="ja-t" className="bang-prompt__title">{tr(`${ask.name} sa chce pripojiť do hry`, `${ask.name} wants to join the game`)}</h2>
        <p id="ja-d" className="bang-prompt__body">
          {ask.bot
            ? tr(`Nahradí bota ${ask.bot.name}, ktorý má najviac životov (${ask.bot.hp}). Počet hráčov sa nezmení.`, `They will replace ${ask.bot.name}, the bot with the most lives (${ask.bot.hp}). The number of players stays the same.`)
            : tr('Nahradí jedného z botov. Počet hráčov sa nezmení.', 'They will replace one of the bots. The number of players stays the same.')}
          {!ask.host && ' ' + tr('Zakladateľ neodpovedal, rozhodni ty.', 'The host did not answer, it is up to you.')}
        </p>
        <div className="bang-prompt__bar" aria-hidden="true"><i className="drain" style={{ animationDuration: `${ask.ms}ms` }} /></div>
        <p className="bang-caption on-paper bang-prompt__time" role="timer" aria-live="off"><b className="secs">{left} s</b> {tr('na rozhodnutie, potom sa otázka presunie na iného hráča', 'to decide, then the question moves to another player')}</p>
        <div className="bang-prompt__actions">
          <button className="bang-btn bang-btn--primary" type="button" onClick={() => onAnswer(true)}>{tr('Schváliť', 'Approve')}</button>
          <button className="bang-btn bang-btn--on-paper" type="button" autoFocus onClick={() => onAnswer(false)}>{tr('Zamietnuť', 'Decline')}</button>
        </div>
      </div>
    </div>
  );
}

/** Zakladatel vyhadzuje hraca z rozohratej hry: nahradi ho bot, alebo sa vyradi z hry. Serifa vyradit nejde. */
export function KickDialog({ name, sheriff, out, onChoose, onClose }: { name: string; sheriff: boolean; out: boolean; onChoose: (mode: 'bot' | 'kill') => void; onClose: () => void }) {
  const { tr } = useLang();
  return (
    <div className="gb-modal" role="presentation" onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className="gb-dialog kd" role="alertdialog" aria-modal="true" aria-labelledby="kd-t" onClick={e => e.stopPropagation()}>
        <div className="bang-prompt__kicker">{tr('Vyhodiť hráča', 'Remove player')}</div>
        <h2 id="kd-t" className="bang-prompt__title">{name}</h2>
        <p className="bang-prompt__body">{tr('Vyhodený hráč sa už do tejto hry nevráti. Čo sa stane s jeho miestom?', 'The removed player cannot come back to this game. What happens to their seat?')}</p>
        <div className="kd__opts">
          <button className="bang-btn bang-btn--primary" type="button" autoFocus onClick={() => onChoose('bot')}>
            {tr('Nahradiť botom', 'Replace with a bot')}
            <small>{tr('Hra pokračuje, bot prevezme jeho karty a životy.', 'The game goes on, a bot takes over their cards and lives.')}</small>
          </button>
          <button className="bang-btn kd__kill" type="button" disabled={sheriff} onClick={() => onChoose('kill')}>
            {out ? tr('Odstrániť zo stola', 'Remove from the table') : tr('Vyradiť z hry', 'Eliminate from the game')}
            <small>{sheriff
              ? tr('Šerifa nemožno vyradiť, kým je v hre Bandita alebo Odpadlík.', 'The Sheriff cannot be eliminated while an Outlaw or the Renegade is in the game.')
              : tr('Hráč je hneď vyradený, jeho karty sa odhodia a rola sa odkryje.', 'The player is out at once, their cards are discarded and the role is revealed.')}</small>
          </button>
          <button className="bang-btn bang-btn--on-paper" type="button" onClick={onClose}>{tr('Zrušiť', 'Cancel')}</button>
        </div>
      </div>
    </div>
  );
}
