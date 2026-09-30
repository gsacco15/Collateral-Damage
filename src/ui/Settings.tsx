// Settings and diagnostics, in one place: the look (light or dark), which people model runs (Classic or Living), and a
// quick check that Jev's two server functions are there, have their key, and answer.
import { Fragment, useState } from 'react';
import { jevHeaders, ownKey, ownKeyOn, setOwnKey, setOwnKeyOn } from './jevKey';

type Check = { state: 'idle' | 'running' | 'ok' | 'nokey' | 'offline' | 'error'; text: string; ms?: number };

/** Call one endpoint and say plainly what came back. */
async function probe(url: string, describe: (j: Record<string, unknown>) => string): Promise<Check> {
  const t0 = performance.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000), cache: 'no-store', headers: jevHeaders() });
    const ms = Math.round(performance.now() - t0);
    // No function behind the path (a static preview, the local dev server): the page itself comes back.
    if (!(r.headers.get('content-type') ?? '').includes('application/json')) return { state: 'offline', text: 'No server function here (local preview or static host). The built-in rules stand in.', ms };
    const j = (await r.json()) as Record<string, unknown>;
    if (j.ok) return { state: 'ok', text: describe(j), ms };
    if (j.reason === 'no-key') return { state: 'nokey', text: 'The function is there, but there is no key: set TYPESAFE_API_KEY in Vercel, or add your own below.', ms };
    return { state: 'error', text: `Answered with an error: ${String(j.reason ?? r.status)}${j.status ? ` (upstream ${j.status})` : ''}.`, ms };
  } catch {
    return { state: 'offline', text: 'No answer (network error or timed out after 20 s).', ms: Math.round(performance.now() - t0) };
  }
}

const LABEL: Record<Check['state'], string> = { idle: 'Not tested', running: 'Testing…', ok: 'Working', nokey: 'No key', offline: 'Offline', error: 'Error' };

export interface Census {
  hour: string;
  residents: number;
  inside: number;
  outdoors: number;
  streets: number;
  groups: [string, number][];
  drawn: number;
  dots: number;
}

/** One strike, as the ledger keeps it. */
export interface StrikeLog {
  target: string;
  hour: number;
  day: 'weekday' | 'friday';
  hurt: number;
  who: { children: number; adults: number; elderly: number };
  buildings: number; // destroyed by this strike
  homes: number;
  homeless: number; // people who lived in the homes it destroyed
  armed: number | null; // Living: armed men who were really there
}

const hhmm = (h: number) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

export function SettingsPanel({ dark, setDark, alive, setAlive, onClose, census, ledger }: { dark: boolean; setDark: (v: boolean) => void; alive: boolean; setAlive: (v: boolean) => void; onClose: () => void; census: Census; ledger: StrikeLog[] }) {
  const sum = (f: (l: StrikeLog) => number) => ledger.reduce((t, l) => t + f(l), 0);
  const [reads, setReads] = useState<Check>({ state: 'idle', text: 'Reads the conflicting reports on a target and judges how many people are inside.' });
  const [city, setCity] = useState<Check>({ state: 'idle', text: 'Judges how each district is behaving this hour (Living only).' });
  const [after, setAfter] = useState<Check>({ state: 'idle', text: 'Judges how the area round a strike responds (Living only).' });
  const running = [reads, city, after].some((c) => c.state === 'running');
  const [key, setKey] = useState(ownKey());
  const [useOwn, setUseOwn] = useState(ownKeyOn());
  const [shown, setShown] = useState(false);

  const test = async () => {
    const wait: Check = { state: 'running', text: 'Asking…' };
    setReads(wait);
    setCity(wait);
    setAfter(wait);
    // The same questions every time, so after the first test they come straight from the cache (no cost).
    const [a, b, c] = await Promise.all([
      probe('/api/jev?target=warehouse&hour=10&day=weekday&watched=6', (j) => {
        const sites = (j.sites as { name: string }[] | undefined)?.length ?? 0;
        const u = j.usage as { input_tokens: number } | undefined;
        return `Read ${sites} site${sites === 1 ? '' : 's'} at Warehouse 14, 10:00${u ? ` · ${u.input_tokens} tokens` : ''} · model ${String(j.model ?? '?')}.`;
      }),
      probe('/api/behave?kind=city&hour=10&day=weekday&events=', (j) => {
        const d = j.districts as Record<string, Record<string, number>> | undefined;
        const n = d ? Object.keys(d).length : 0;
        const off = d ? Object.values(d).reduce((s, m) => s + Object.values(m).filter((v) => v !== 1).length, 0) : 0;
        return `Read ${n} districts at 10:00 · ${off} answer${off === 1 ? '' : 's'} away from normal.`;
      }),
      probe('/api/behave?kind=after&district=workshops&hour=10&day=weekday&sev=mid', (j) => {
        const m = j.mood as Record<string, number> | undefined;
        return m ? `Strike in the Workshops, 10:00: ${Object.entries(m).map(([k, v]) => `${k} ×${v}`).join(', ')}.` : 'Answered.';
      }),
    ]);
    setReads(a);
    setCity(b);
    setAfter(c);
  };

  const row = (name: string, c: Check) => (
    <div className="set-check">
      <div className="set-check-head">
        <b>{name}</b>
        <span className={`set-state ${c.state}`}>
          {LABEL[c.state]}
          {c.ms != null && c.state !== 'running' ? ` · ${c.ms} ms` : ''}
        </span>
      </div>
      <p>{c.text}</p>
    </div>
  );

  return (
    <div className="settings-scrim" onClick={onClose}>
      <div className="settings" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <div className="set-head">
          <b>Settings</b>
          <button className="x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="set-row">
          <div>
            <b>Dark mode</b>
            <span>Easier on the eyes at night.</span>
          </div>
          <button className={`set-switch ${dark ? 'on' : ''}`} role="switch" aria-checked={dark} onClick={() => setDark(!dark)}>
            <i />
          </button>
        </div>

        <div className="set-row">
          <div>
            <b>Living people</b>
            <span>{alive ? 'On: people live somewhere and go somewhere, react to strikes, and Jev steers how districts behave.' : 'Off (Classic): every place of a kind is equally full at a given hour.'}</span>
          </div>
          <button className={`set-switch ${alive ? 'on' : ''}`} role="switch" aria-checked={alive} onClick={() => setAlive(!alive)}>
            <i />
          </button>
        </div>

        <div className="set-sec">
          <b>City census · {census.hour}</b>
          <div className="census">
            <span>Residents (everyone who lives here)</span>
            <b>{census.residents.toLocaleString()}</b>
            <span>Inside buildings now</span>
            <b>{census.inside.toLocaleString()}</b>
            <span>Out in squares, the souk, yards, parks</span>
            <b>{census.outdoors.toLocaleString()}</b>
            <span>On the streets</span>
            <b>{census.streets.toLocaleString()}</b>
            {census.groups.map(([k, n]) => (
              <Fragment key={k}>
                <span className="grp">{k}</span>
                <b>{n}</b>
              </Fragment>
            ))}
            <span>People drawn outside (a sample)</span>
            <b>{census.drawn.toLocaleString()}</b>
            <span>Dots drawn inside buildings</span>
            <b>{census.dots.toLocaleString()}</b>
          </div>
          <p className="set-foot">{alive ? 'Living: groups listed separately. ' : 'Classic: no separate groups. '}The map draws only some of the people outside, to stay fast; the estimate counts everyone.</p>
        </div>

        <div className="set-sec">
          <b>Since the city was last rebuilt</b>
          {ledger.length === 0 ? (
            <p className="set-foot">No strikes yet. Every strike is added here: who it hurt, and what it destroyed.</p>
          ) : (
            <>
              <div className="census">
                <span>Strikes</span>
                <b>{ledger.length}</b>
                <span>Killed or badly hurt</span>
                <b className="bad">{sum((l) => l.hurt)}</b>
                <span className="grp">Children</span>
                <b>{sum((l) => l.who.children)}</b>
                <span className="grp">Adults</span>
                <b>{sum((l) => l.who.adults)}</b>
                <span className="grp">Elderly</span>
                <b>{sum((l) => l.who.elderly)}</b>
                <span>Buildings destroyed</span>
                <b>{sum((l) => l.buildings)}</b>
                <span>Homes destroyed</span>
                <b>{sum((l) => l.homes)}</b>
                <span>People who lost their home</span>
                <b>{sum((l) => l.homeless)}</b>
                <span>Residents with a home left</span>
                <b>{Math.max(0, census.residents - sum((l) => l.homeless)).toLocaleString()}</b>
                {ledger.some((l) => l.armed != null) && (
                  <>
                    <span>Armed men who were really there</span>
                    <b>{sum((l) => l.armed ?? 0)}</b>
                  </>
                )}
              </div>
              <ol className="ledger">
                {ledger.map((l, i) => (
                  <li key={i}>
                    <span>
                      {l.target}, {l.day === 'friday' ? 'Fri' : ''} {hhmm(l.hour)}
                    </span>
                    <b>{l.hurt} hurt</b>
                  </li>
                ))}
              </ol>
              <p className="set-foot">Each strike's own outcome, counted person by person. Rolling again replaces the last; Rebuild the city starts the count again.</p>
            </>
          )}
        </div>

        <div className="set-sec">
          <div className="set-row" style={{ borderBottom: 0, paddingBottom: 2 }}>
            <div>
              <b>Use my own Jev key</b>
              <span>{useOwn && key ? 'On: Jev runs on your TypeSafe key.' : "Off: Jev runs on the site's key."} Kept in this tab only, gone when you close it.</span>
            </div>
            <button
              className={`set-switch ${useOwn && key ? 'on' : ''}`}
              role="switch"
              aria-checked={useOwn && !!key}
              disabled={!key}
              title={key ? '' : 'Paste a key first'}
              onClick={() => {
                const next = !(useOwn && key);
                setOwnKeyOn(next);
                setUseOwn(next);
              }}
            >
              <i />
            </button>
          </div>
          <div className="key-row">
            <input
              type={shown ? 'text' : 'password'}
              value={key}
              placeholder="Paste your TypeSafe API key"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setKey(e.target.value);
                setOwnKey(e.target.value);
                if (!e.target.value.trim()) {
                  setOwnKeyOn(false);
                  setUseOwn(false);
                }
              }}
            />
            <button className="btn small" onClick={() => setShown(!shown)}>
              {shown ? 'Hide' : 'Show'}
            </button>
            {key && (
              <button
                className="btn small"
                onClick={() => {
                  setKey('');
                  setOwnKey('');
                  setOwnKeyOn(false);
                  setUseOwn(false);
                }}
              >
                Clear
              </button>
            )}
          </div>
          <p className="set-foot">Sent with each Jev request to this site's own server function and passed straight to TypeSafe; never saved there. Answers already asked are cached and cost nothing either way.</p>
        </div>

        <div className="set-sec">
          <div className="set-check-head">
            <b>Jev diagnostics</b>
            <button className="btn small" onClick={test} disabled={running}>
              {running ? 'Testing…' : 'Test Jev'}
            </button>
          </div>
          {row('Reading the reports', reads)}
          {row('District behaviour', city)}
          {row('After a strike', after)}
          <p className="set-foot">Offline or without a key, the game still works: the built-in guess and rules stand in for Jev.</p>
        </div>
        <button className="btn set-done" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
