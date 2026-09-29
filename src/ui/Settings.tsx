// Settings and diagnostics, in one place: the look (light or dark), which people model runs (Classic or Living), and a
// quick check that Jev's two server functions are there, have their key, and answer.
import { Fragment, useState } from 'react';

type Check = { state: 'idle' | 'running' | 'ok' | 'nokey' | 'offline' | 'error'; text: string; ms?: number };

/** Call one endpoint and say plainly what came back. */
async function probe(url: string, describe: (j: Record<string, unknown>) => string): Promise<Check> {
  const t0 = performance.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000), cache: 'no-store' });
    const ms = Math.round(performance.now() - t0);
    // No function behind the path (a static preview, the local dev server): the page itself comes back.
    if (!(r.headers.get('content-type') ?? '').includes('application/json')) return { state: 'offline', text: 'No server function here (local preview or static host). The built-in rules stand in.', ms };
    const j = (await r.json()) as Record<string, unknown>;
    if (j.ok) return { state: 'ok', text: describe(j), ms };
    if (j.reason === 'no-key') return { state: 'nokey', text: 'The function is there, but no API key is set (TYPESAFE_API_KEY in Vercel).', ms };
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
}

export function SettingsPanel({ dark, setDark, alive, setAlive, onClose, census }: { dark: boolean; setDark: (v: boolean) => void; alive: boolean; setAlive: (v: boolean) => void; onClose: () => void; census: Census }) {
  const [reads, setReads] = useState<Check>({ state: 'idle', text: 'Reads the conflicting reports on a target and judges how many people are inside.' });
  const [city, setCity] = useState<Check>({ state: 'idle', text: 'Judges how each district is behaving this hour (Living only).' });
  const [after, setAfter] = useState<Check>({ state: 'idle', text: 'Judges how the area round a strike responds (Living only).' });
  const running = [reads, city, after].some((c) => c.state === 'running');

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
            <span>Drawn on the map right now</span>
            <b>{census.drawn.toLocaleString()}</b>
          </div>
          <p className="set-foot">{alive ? 'Living: groups listed separately. ' : 'Classic: no separate groups. '}The map draws a sample of those outside; the estimate counts them all.</p>
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
      </div>
    </div>
  );
}
