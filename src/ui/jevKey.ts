// Your own Jev (TypeSafe) key, if you'd rather not use the site's: kept for this browser tab only (sessionStorage),
// gone when the tab closes, never stored on the server. When switched on, it rides along with each Jev request and the
// server functions use it instead of their own.
const KEY = 'cd-jev-key';
const ON = 'cd-jev-own';

const read = (k: string) => {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v == null) sessionStorage.removeItem(k);
    else sessionStorage.setItem(k, v);
  } catch {
    /* no storage */
  }
};

export const ownKey = () => read(KEY) ?? '';
export const ownKeyOn = () => read(ON) === '1' && !!ownKey();
export const setOwnKey = (k: string) => write(KEY, k.trim() ? k.trim() : null);
export const setOwnKeyOn = (on: boolean) => write(ON, on ? '1' : null);
/** The headers to add to a Jev request: your key, when you've switched it on. */
export const jevHeaders = (): Record<string, string> => (ownKeyOn() ? { 'X-Jev-Key': ownKey() } : {});
/** Part of a cache id, so switching keys asks again rather than reusing an answer that failed. */
export const keyTag = () => (ownKeyOn() ? 'own' : 'site');
