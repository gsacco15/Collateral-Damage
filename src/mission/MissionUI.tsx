// The secret mission's cards: someone talking to you, the file you keep (what to do next, and the clues so far),
// and how it ended.
import { useEffect, useState } from 'react';
import { current, FIGURES, MEETS, inHours, type MissionState } from './mission';

export interface Talk {
  key: string;
  name: string;
  role: string;
  text: string;
  tone: 'gold' | 'red' | 'handler';
  secs?: number; // how long the voice runs: the words come in with it
  actions: { label: string; primary?: boolean; onClick: () => void }[];
}

/** Someone speaking: their name, what they do, and their words appearing as they say them. */
export function TalkCard({ talk, onClose }: { talk: Talk; onClose: () => void }) {
  const words = talk.text.split(' ');
  const [shown, setShown] = useState(talk.secs === 0 ? 0 : words.length);
  useEffect(() => {
    if (!talk.secs) return setShown(talk.secs === 0 ? 0 : words.length);
    setShown(0);
    const per = (talk.secs * 1000 * 0.92) / words.length;
    let i = 0;
    const id = window.setInterval(() => {
      i++;
      setShown(i);
      if (i >= words.length) window.clearInterval(id);
    }, per);
    return () => window.clearInterval(id);
  }, [talk.key, talk.secs]); // eslint-disable-line react-hooks/exhaustive-deps
  // No voice coming (sound off): show it all after a moment.
  useEffect(() => {
    if (talk.secs !== 0) return;
    const id = window.setTimeout(() => setShown((s) => (s === 0 ? words.length : s)), 1400);
    return () => window.clearTimeout(id);
  }, [talk.key, talk.secs]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`talk ${talk.tone}`} role="dialog" aria-label={`${talk.name} speaking`}>
      <button className="talk-x" onClick={onClose} aria-label="Close">
        ×
      </button>
      <div className="talk-who">
        <b>{talk.name}</b>
        <span>{talk.role}</span>
      </div>
      <p>
        {words.map((w, i) => (
          <span key={i} className={i < shown ? 'on' : ''}>
            {w}{' '}
          </span>
        ))}
      </p>
      {talk.actions.length > 0 && (
        <div className="talk-acts">
          {talk.actions.map((a) => (
            <button key={a.label} className={a.primary ? 'primary' : ''} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The file: who to find next, where and when, and every clue so far. */
export function MissionHud({ s, hour, onGo, onBrief, onNew, onHide }: { s: MissionState; hour: number; onGo: () => void; onBrief: () => void; onNew: () => void; onHide: () => void }) {
  const [open, setOpen] = useState(false);
  // Folded or open, remembered in this browser; folded to begin with on a phone, where the map is small.
  const [small, setSmall] = useState(() => {
    try {
      const v = localStorage.getItem('cd-mission-fold');
      return v ? v === '1' : matchMedia('(max-width: 760px)').matches;
    } catch {
      return false;
    }
  });
  const fold = (v: boolean) => {
    setSmall(v);
    try {
      localStorage.setItem('cd-mission-fold', v ? '1' : '0');
    } catch {
      /* no storage */
    }
  };
  const c = current(s);
  const meet = MEETS[s.meet] ?? MEETS[0];
  let title = '';
  let where = '';
  let here = false;
  if (c === 'samir') {
    title = 'Find Samir, the courier';
    where = `${meet.place[0].toUpperCase()}${meet.place.slice(1)}, ${meet.when}`;
    here = inHours(hour, meet.from, meet.to);
  } else if (c) {
    title = `Find ${c.name}`;
    where = `${c.where}, ${c.when}`;
    here = inHours(hour, c.from, c.to);
  }
  // Folded, the file is one compact row: what to do next, whether they're there now, and a way to open it.
  if (small) {
    const label = s.step === 0 ? 'A new file' : s.step === 6 ? (s.result === 'clean' ? 'File closed' : 'File closed, at a cost') : title;
    return (
      <div className="mission-hud small" role="region" aria-label="Secret file">
        <span className="mh-star" aria-hidden>
          ✦
        </span>
        <b>{label}</b>
        {c && <span className={`mh-dot ${here ? 'yes' : ''}`} title={here ? 'There now' : 'Not there at this hour'} />}
        {c && (
          <button className="mh-go" onClick={onGo}>
            Go
          </button>
        )}
        <button className="mh-x" onClick={() => fold(false)} aria-label="Open the secret file" aria-expanded={false} title="Open the file">
          ▾
        </button>
      </div>
    );
  }
  return (
    <div className="mission-hud" role="region" aria-label="Secret file">
      <div className="mh-top">
        <span className="k">Secret file · The Courier</span>
        <span>
          <button className="mh-x" onClick={() => fold(true)} aria-label="Fold the file to one line" aria-expanded title="Fold it to one line">
            ▴
          </button>
          <button className="mh-x" onClick={onHide} aria-label="Put the file away" title="Put the file away (it keeps your place)">
            ×
          </button>
        </span>
      </div>
      {s.step === 0 && (
        <>
          <b>A new file</b>
          <button className="mh-go" onClick={onBrief}>
            Hear the brief
          </button>
        </>
      )}
      {c && (
        <>
          <b>{title}</b>
          <span className="mh-where">{where}</span>
          <span className={`mh-now ${here ? 'yes' : ''}`}>{here ? (c === 'samir' ? 'He’s there now. Look for the red tag.' : 'There now. Look for the gold tag.') : 'Not there at this hour.'}</span>
          <button className="mh-go" onClick={onGo}>
            {here ? 'Go there' : 'Go there, at that hour'}
          </button>
        </>
      )}
      {s.step === 6 && (
        <>
          <b>{s.result === 'clean' ? 'File closed' : 'File closed, at a cost'}</b>
          <button className="mh-go" onClick={onNew}>
            Open a new file
          </button>
        </>
      )}
      {s.clues.length > 0 && (
        <>
          <button className="mh-clues-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
            Clues {s.clues.length}/{FIGURES.length} {open ? '▴' : '▾'}
          </button>
          {open && (
            <ol className="mh-clues">
              {s.clues.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

/** How it ended: a stamp, what the handler says, and who else was there. */
export function EndCard({ result, others, names, onAgain, onClose }: { result: 'clean' | 'hurt' | 'miss'; others: number; names: string[]; onAgain: () => void; onClose: () => void }) {
  return (
    <div className={`mission-end ${result}`} role="dialog" aria-label="The file">
      <div className="me-stamp">{result === 'miss' ? 'He got away' : 'File closed'}</div>
      <p className="me-line">
        {result === 'miss'
          ? 'He’s gone. The bike was seen heading out of town. He knows now. He’ll change the route, and so will the Engineer.'
          : result === 'clean'
            ? 'Courier down. No one else near him. The Engineer’s line has gone quiet. For now. Somewhere tonight, a letter is not going to arrive.'
            : 'Courier down. He was not alone. We will count the others later… they have names too. The Engineer will find another pair of hands by the end of the week.'}
      </p>
      {result !== 'miss' && (
        <div className="me-count">
          <b>{others}</b>
          <span>{others === 1 ? 'other person killed or badly hurt' : 'other people killed or badly hurt'}</span>
        </div>
      )}
      {names.length > 0 && (
        <ul className="me-names">
          {names.map((n) => (
            <li key={n}>{n}</li>
          ))}
          {others > names.length && <li className="more">and {others - names.length} more</li>}
        </ul>
      )}
      <p className="me-foot">{result === 'miss' ? 'Umm Rami may know where he goes now.' : 'The Engineer was never on the map.'}</p>
      <div className="talk-acts">
        <button className="primary" onClick={onAgain}>
          {result === 'miss' ? 'Back to the baker' : 'Open a new file'}
        </button>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
