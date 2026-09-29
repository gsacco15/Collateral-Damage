// What Jev made of the intelligence: one typed judgment per site, the chance of each head count, and what the call cost.
import { AGREE, fmtHour, LEVELS, readingCost, type JevReading, type JevReply } from '../jev';

/** Where a report comes from, from how it begins. */
const sourceOf = (r: string) => (/^Overhead/.test(r) ? 'Overhead' : /^Phone/.test(r) ? 'Phones' : /^Census|^Records/.test(r) ? 'Records' : /^Observer/.test(r) ? 'Observer' : 'Note');

/** Does a report's count fit Jev's answer for its site? Reports with no count (notes) aren't compared. */
function fits(r: string, reading: JevReading) {
  const site = [...(reading.sites ?? [])].filter((s) => s?.name && Array.isArray(s.p)).sort((a, b) => b.name.length - a.name.length).find((s) => r.includes(s.name));
  const nums = r.replace(site?.name ?? '', '').match(/\d+/g) ?? [];
  // The observer's report starts with how long they watched: their count is the last number.
  const n = site && /nobody visible/.test(r) ? 0 : Number(/^Observer/.test(r) ? nums[nums.length - 1] : nums[0]);
  if (!site || Number.isNaN(n) || /^[^:]*: (no classes|classes|Friday)/.test(r)) return null;
  const top = LEVELS[site.p.indexOf(Math.max(...site.p))];
  return n < top.lo ? 'fewer' : n > top.hi ? 'more' : 'fits';
}

/** How sure, in words: a plain label for the confidence number. */
const sureWord = (c: number) => (c >= 0.8 ? 'sure' : c >= 0.5 ? 'fairly sure' : 'a guess');

export function JevCard({ reading, hour }: { reading: JevReply | null; hour: number }) {
  const n = reading && reading.ok ? (reading.reports?.length ?? 0) : 0;
  return (
    <section className="card jevcard">
      <h3>
        Jev <span className="role-tag">· AI analyst</span>
        <span className="src">AI · one call</span>
      </h3>
      <p className="sub">{n ? `Jev reads ${n} conflicting reports and gives a range for how many people are inside each place.` : 'Jev reads the conflicting reports on the target and the places around it, and gives a range for how many people are inside each.'}</p>
      {!reading ? (
        <p className="hint mono">
          <i className="spin" /> asking Jev about {fmtHour(Math.floor(hour))}…
        </p>
      ) : !reading.ok ? (
        <p className="hint">
          {reading.reason === 'no-key'
            ? 'Jev is not connected: the server has no TYPESAFE_API_KEY. The simulator is using its built-in guess of who is inside.'
            : reading.reason === 'open-ground'
              ? 'The target is a spot on open ground, not a building, so there are no reports for Jev to read. The simulator is using its built-in guess of who is around.'
              : reading.reason === 'offline'
              ? 'Jev is offline here (no server). The simulator is using its built-in guess of who is inside.'
              : `Jev didn't answer${reading.status ? ` (${reading.status})` : ''}. The simulator is using its built-in guess of who is inside.`}
        </p>
      ) : (
        <>
          <div className="judgments">
            {reading.sites.map((s) => {
              const top = s.p.indexOf(Math.max(...s.p));
              return (
                <div key={s.id} className="judgment">
                  <span className="k">inside</span>
                  <span className="q">
                    {s.name}
                    <em className={`role ${s.role}`}>{s.role === 'target' ? 'the target' : s.role === 'protected' ? 'protected, within reach' : 'nearby homes'}</em>
                  </span>
                  <span className="dist" role="img" aria-label={LEVELS.map((l, i) => `${l.label}: ${Math.round(s.p[i] * 100)}%`).join(', ')}>
                    {s.p.map((v, i) => (
                      <i key={i} className={i === top ? 'top' : ''} style={{ height: `${Math.max(2, v * 100)}%` }} title={`${LEVELS[i].label}: ${Math.round(v * 100)}%`} />
                    ))}
                  </span>
                  <b>{LEVELS[top].label}</b>
                  <span className="conf" title={`How sure Jev is about this answer: ${Math.round(s.confidence * 100)} out of 100`}>
                    <b>{Math.round(s.confidence * 100)}%</b> {sureWord(s.confidence)}
                  </span>
                </div>
              );
            })}
            <div className="judgment">
              <span className="k">sources</span>
              <span className="q">Do the reports agree?</span>
              <span />
              <b title={AGREE[reading.agree.choice]}>{reading.agree.choice}</b>
              <span className="conf" title={`How sure Jev is about this answer: ${Math.round(reading.agree.confidence * 100)} out of 100`}>
                <b>{Math.round(reading.agree.confidence * 100)}%</b> {sureWord(reading.agree.confidence)}
              </span>
            </div>
          </div>
          <details className="jev-fold">
            <summary>Details</summary>
            <p className="jev-meta mono">
              {reading.sites.length + 1} typed judgments in one call · {reading.ms} ms · {reading.model} · {reading.usage.input_tokens.toLocaleString()} input tokens · ≈ ${readingCost(reading).toFixed(5)} · cached after the first ask
            </p>
            <p className="jev-meta">Each answer ends with how sure Jev is: above 80% it's sure, 50 to 80% fairly sure, below that it's a guess. The bars are the chances of each head count, and the simulator draws from them.</p>
          </details>
          <details className="jev-fold reports">
            <summary>The {n} reports Jev read</summary>
            <ul>
              {(reading.reports ?? []).map((r) => {
                const f = fits(r, reading);
                return (
                  <li key={r}>
                    <span className="rsrc">{sourceOf(r)}</span>
                    <span className="rtext">{r.replace(/^(Overhead image of |Phone signals: |Census from before the conflict: |Records from before the conflict: |Observer, )/, '')}</span>
                    {f && <span className={`rfit ${f}`}>{f === 'fits' ? 'fits' : f === 'fewer' ? 'fewer' : 'more'}</span>}
                  </li>
                );
              })}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
