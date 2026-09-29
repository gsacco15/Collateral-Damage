// Asks Jev (TypeSafe) to read the intelligence for one target, hour, day and amount of watching.
// The API key stays here on the server. The page can only name a target and an hour: this function builds the
// question itself, so the endpoint can't be used to send Jev anything else. Answers are cached by Vercel's CDN,
// so each distinct reading is paid for once, not once per visitor.
import { buildCity } from '../src/jev/city';
import { JEV_URL, jevRequest, parseKey, readAnswers, type JevReply } from '../src/jev/intel';

export const config = { runtime: 'edge' };

declare const process: { env: Record<string, string | undefined> };

let world: ReturnType<typeof buildCity> | null = null;
const memo = new Map<string, string>(); // this instance's answers, in case the CDN hasn't cached one yet

const json = (body: JevReply, status: number, cache = false) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cache ? 'public, max-age=3600, s-maxage=2592000, stale-while-revalidate=86400' : 'no-store',
    },
  });

export default async function handler(req: Request): Promise<Response> {
  const key = parseKey(new URL(req.url).searchParams);
  if (!key) return json({ ok: false, reason: 'bad-request' }, 400);
  // A visitor's own key (from Settings, sent for this request only, never stored) comes first; then the site's.
  const own = req.headers.get('x-jev-key');
  const apiKey = own && /^[\w.-]{8,200}$/.test(own) ? own : (process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY);
  if (!apiKey) return json({ ok: false, reason: 'no-key' }, 503);

  const id = `${key.target}|${key.hour}|${key.day}|${key.watched}${key.armed ? '|armed' : ''}`;
  const hit = memo.get(id);
  if (hit) return new Response(hit, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600, s-maxage=2592000' } });

  world ??= buildCity();
  // A picked building must exist and have people who use it.
  if (key.target.startsWith('b:') && !(world.buildings[Number(key.target.slice(2))]?.capacity > 0)) return json({ ok: false, reason: 'bad-request' }, 400);
  const { body, sites, reports } = jevRequest(world, key);
  const t0 = Date.now();
  // Retry once on rate limits or overload, as the API asks.
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(JEV_URL, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(9000) });
    } catch {
      return json({ ok: false, reason: 'upstream' }, 502);
    }
    if ((res.status === 429 || res.status === 529) && attempt === 0) {
      await new Promise((r) => setTimeout(r, 700));
      continue;
    }
    if (!res.ok) return json({ ok: false, reason: 'upstream', status: res.status }, 502);
    try {
      const reading = readAnswers(key, sites, reports, await res.json(), Date.now() - t0);
      const out = JSON.stringify(reading);
      if (memo.size > 500) memo.clear();
      memo.set(id, out);
      return json(reading, 200, true);
    } catch {
      return json({ ok: false, reason: 'upstream', status: res.status }, 502);
    }
  }
  return json({ ok: false, reason: 'upstream', status: 429 }, 502);
}
