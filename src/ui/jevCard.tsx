// What Jev made of the intelligence: one typed judgment per site, the chance of each head count, and what the call cost.
import { AGREE, fmtHour, LEVELS, readingCost, type JevReply } from '../jev';

export function JevCard({ reading, hour }: { reading: JevReply | null; hour: number }) {
  return (
    <section className="card jevcard">
      <h3>Jev reads the intelligence</h3>
      <p className="sub">
        The reports on who is inside disagree. Jev weighs them and answers with a probability for each head count. The simulator draws from those answers every time it replays the strike.
      </p>
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
          <p className="jev-meta mono">
            {reading.sites.length + 1} typed judgments · one call · {reading.ms} ms
          </p>
          <div className="judgments">
            {reading.sites.map((s) => {
              const top = s.p.indexOf(Math.max(...s.p));
              return (
                <div key={s.id} className="judgment">
                  <span className="k">score</span>
                  <span className="q">
                    Inside {s.name}
                    {s.role === 'protected' && <em className="protected"> protected</em>}
                  </span>
                  <span className="dist" role="img" aria-label={LEVELS.map((l, i) => `${l.label}: ${Math.round(s.p[i] * 100)}%`).join(', ')}>
                    {s.p.map((v, i) => (
                      <i key={i} className={i === top ? 'top' : ''} style={{ height: `${Math.max(2, v * 100)}%` }} title={`${LEVELS[i].label}: ${Math.round(v * 100)}%`} />
                    ))}
                  </span>
                  <b>{LEVELS[top].label}</b>
                  <span className="conf mono">{s.confidence.toFixed(2)}</span>
                </div>
              );
            })}
            <div className="judgment">
              <span className="k">choice</span>
              <span className="q">Do the sources agree?</span>
              <span />
              <b title={AGREE[reading.agree.choice]}>{reading.agree.choice}</b>
              <span className="conf mono">{reading.agree.confidence.toFixed(2)}</span>
            </div>
          </div>
          <p className="jev-meta mono">
            {reading.model} · {reading.usage.input_tokens.toLocaleString()} input tokens · ≈ ${readingCost(reading).toFixed(5)} · cached after the first ask
          </p>
          <details className="reports">
            <summary>The {reading.reports.length} reports Jev read</summary>
            <ul>
              {reading.reports.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
