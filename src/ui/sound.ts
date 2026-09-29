// The soundscape. Off until someone turns it on (browsers only allow audio after a click anyway).
// Ambience follows the hour and where you're looking; radio lines go through a band-pass "radio" filter;
// the guide has a narrator. Files live in public/audio/.

export type Bed = 'amb-city-day' | 'amb-city-night' | 'amb-cell-room' | 'amb-market' | 'amb-park' | 'amb-water' | 'amb-pitch' | 'amb-traffic' | 'amb-wind' | 'amb-school';
const BEDS: Bed[] = ['amb-city-day', 'amb-city-night', 'amb-cell-room', 'amb-market', 'amb-park', 'amb-water', 'amb-pitch', 'amb-traffic', 'amb-wind', 'amb-school'];
const KEY = 'cd.sound';
const MIX_KEY = 'cd.mix';

/** The mixer: one level for everything, and one each for the city, the effects and the voices. */
export interface Mix {
  master: number;
  ambience: number;
  effects: number;
  voices: number;
}
const DEFAULT_MIX: Mix = { master: 0.8, ambience: 0.7, effects: 0.8, voices: 1 };
type Bus = 'ambience' | 'effects' | 'voices';

export type Cue =
  | 'ui-hover'
  | 'ui-click'
  | 'ui-toggle'
  | 'ui-discover'
  | 'ui-weapon'
  | 'ui-building'
  | 'hold-abort'
  | 'jev-start'
  | 'jev-tick'
  | 'jev-read'
  | 'jev-done'
  | 'hold-charge'
  | 'aircraft-approach'
  | 'bomb-whistle'
  | 'impact'
  | 'aftermath'
  | 'stamp'
  | 'radio-static'
  | 'amb-call-to-prayer';

export type RadioLine = 'radio-01-pol' | 'radio-02-estimate' | 'radio-03-cleared' | 'radio-04-away' | 'radio-05-splash' | 'radio-06-destroyed' | 'radio-07-intact' | 'radio-08-bda' | 'radio-09-jev-run' | 'radio-10-jev-done' | 'radio-11-abort' | 'radio-12-calloff';

const VOLUME: Partial<Record<Cue, number>> = {
  'ui-hover': 0.12,
  'ui-click': 0.25,
  'ui-toggle': 0.3,
  'ui-discover': 0.35,
  'ui-weapon': 0.45,
  'ui-building': 0.3,
  'hold-abort': 0.4,
  'jev-start': 0.4,
  'jev-tick': 0.08,
  'jev-read': 0.4,
  'jev-done': 0.4,
  'hold-charge': 0.5,
  'aircraft-approach': 0.8,
  'bomb-whistle': 0.25,
  impact: 1,
  aftermath: 0.6,
  stamp: 0.7,
  'radio-static': 0.16,
  'amb-call-to-prayer': 0.35,
};

class SoundEngine {
  enabled = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Partial<Record<Bus, GainNode>> = {};
  mix: Mix = { ...DEFAULT_MIX };
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private beds = new Map<Bed, { src: AudioBufferSourceNode; gain: GainNode }>();
  private voiceNode: AudioBufferSourceNode | null = null;
  private charge: AudioBufferSourceNode | null = null;
  private lastTick = 0;
  private radioFree = 0; // when the radio is next free
  private listeners = new Set<(on: boolean) => void>();

  constructor() {
    try {
      this.enabled = localStorage.getItem(KEY) === '1';
      const m = JSON.parse(localStorage.getItem(MIX_KEY) ?? 'null');
      if (m) this.mix = { ...DEFAULT_MIX, ...m };
    } catch {
      /* stays off, default mix */
    }
  }

  onChange(f: (on: boolean) => void) {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  }

  setMix(k: keyof Mix, v: number) {
    this.mix = { ...this.mix, [k]: Math.max(0, Math.min(1, v)) };
    try {
      localStorage.setItem(MIX_KEY, JSON.stringify(this.mix));
    } catch {
      /* fine */
    }
    this.applyMix();
    this.listeners.forEach((f) => f(this.enabled));
  }
  private applyMix() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.enabled) this.master?.gain.setTargetAtTime(this.mix.master, t, 0.1);
    for (const b of ['ambience', 'effects', 'voices'] as Bus[]) this.buses[b]?.gain.setTargetAtTime(this.mix[b], t, 0.1);
  }

  /** Must be called from a click or key press the first time, so the browser lets audio start. */
  setEnabled(on: boolean) {
    this.enabled = on;
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      /* fine */
    }
    if (on) {
      this.ensure();
      void this.ctx?.resume();
      this.unlock();
      this.master?.gain.setTargetAtTime(this.mix.master, this.ctx!.currentTime, 0.2);
    } else if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
      this.voiceNode?.stop();
      this.voiceNode = null;
    }
    this.listeners.forEach((f) => f(on));
  }

  /** Called on taps and key presses until the browser lets audio run. True once it does. */
  wake(): boolean {
    if (!this.enabled) return true;
    if (this.ctx?.state === 'running') return true;
    this.ensure();
    void this.ctx!.resume();
    this.unlock();
    this.master?.gain.setTargetAtTime(this.mix.master, this.ctx!.currentTime, 0.2);
    return (this.ctx!.state as string) === 'running'; // resume() is async: the next tap will see it running
  }

  /** iPhones and iPads: play through the silent switch, and start the audio inside this tap. */
  private unlock() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
  }

  private ensure() {
    if (this.ctx) return;
    try {
      // Safari 17+: treat this as media playback, so the ring/silent switch doesn't mute it.
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'playback';
    } catch {
      /* not supported */
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    for (const b of ['ambience', 'effects', 'voices'] as Bus[]) {
      const g = this.ctx.createGain();
      g.gain.value = this.mix[b];
      g.connect(this.master);
      this.buses[b] = g;
    }
  }

  private load(name: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(name);
    if (!p) {
      const ctx = this.ctx!;
      p = fetch(`/audio/${name}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((b) => ctx.decodeAudioData(b))
        .then((b) => (name.startsWith('voice/') ? tightenPauses(ctx, b, 0.8) : b))
        .catch(() => null);
      this.buffers.set(name, p);
    }
    return p;
  }

  private async start(name: string, volume: number, dest?: AudioNode, when = 0, loop = false) {
    if (!this.enabled) return null;
    this.ensure();
    const ctx = this.ctx!;
    const buf = await this.load(name);
    if (!buf || !this.enabled) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(dest ?? this.buses[name.startsWith('amb-') ? 'ambience' : name.startsWith('voice/') || name.startsWith('radio-') ? 'voices' : 'effects']!);
    src.start(ctx.currentTime + when);
    return { src, gain: g };
  }

  play(cue: Cue, delay = 0, volume = VOLUME[cue] ?? 0.5) {
    if (cue === 'jev-tick') {
      const now = performance.now();
      if (now - this.lastTick < 110) return;
      this.lastTick = now;
    }
    void this.start(cue, volume, undefined, delay);
  }

  /** The hold-to-release tone: starts on press, stops if let go early. */
  chargeStart() {
    void this.start('hold-charge', VOLUME['hold-charge']!).then((n) => (this.charge = n?.src ?? null));
  }
  chargeStop() {
    try {
      this.charge?.stop();
    } catch {
      /* already stopped */
    }
    this.charge = null;
  }

  /** A radio call: squelch, the line through a narrow band-pass with a little grit, squelch. */
  async radio(line: RadioLine, delay = 0) {
    if (!this.enabled) return;
    this.ensure();
    const ctx = this.ctx!;
    const buf = await this.load(line);
    if (!this.enabled) return;
    if (!buf) return; // line not recorded yet: say nothing
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 320;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3000;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 1.4);
    }
    shaper.curve = curve;
    const g = ctx.createGain();
    g.gain.value = 0.9;
    hp.connect(lp).connect(shaper).connect(g).connect(this.buses.voices!);
    // One call at a time: a new one waits until the last has finished.
    const at = Math.max(ctx.currentTime + delay, this.radioFree);
    this.radioFree = at + 0.14 + buf.duration + 0.35;
    this.play('radio-static', at - ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(hp);
    src.start(at + 0.14);
  }

  /** The narrator: one line at a time. */
  async voice(n: number) {
    if (!this.enabled) return;
    this.voiceNode?.stop();
    this.voiceNode = null;
    const name = `voice/guide-${String(n).padStart(2, '0')}`;
    const r = await this.start(name, 1);
    if (r) this.voiceNode = r.src;
  }
  stopVoice() {
    try {
      this.voiceNode?.stop();
    } catch {
      /* fine */
    }
    this.voiceNode = null;
  }

  /** Crossfade the ambient beds to these levels (0–1). */
  async ambience(levels: Partial<Record<Bed, number>>) {
    if (!this.enabled) return;
    this.ensure();
    const ctx = this.ctx!;
    for (const bed of BEDS) {
      const want = (levels[bed] ?? 0) * 0.5;
      if (!this.enabled) return;
      let b = this.beds.get(bed);
      if (!b && want > 0.001) {
        const n = await this.start(bed, 0, undefined, 0, true);
        if (!n) continue;
        b = n;
        this.beds.set(bed, b);
      }
      b?.gain.gain.setTargetAtTime(want, ctx.currentTime, 1.2);
    }
  }
}

export const sound = new SoundEngine();

/** Shorten any silence longer than `max` seconds to `max`, keeping the voice itself untouched. */
function tightenPauses(ctx: BaseAudioContext, b: AudioBuffer, max: number): AudioBuffer {
  const sr = b.sampleRate;
  const win = Math.round(sr * 0.02);
  const d0 = b.getChannelData(0);
  const keep: [number, number][] = []; // sample ranges to keep
  let quietFrom = -1;
  let from = 0;
  for (let i = 0; i < d0.length; i += win) {
    let m = 0;
    for (let j = i; j < Math.min(d0.length, i + win); j++) m = Math.max(m, Math.abs(d0[j]));
    if (m < 0.01) {
      if (quietFrom < 0) quietFrom = i;
    } else if (quietFrom >= 0) {
      if (i - quietFrom > max * sr) {
        const half = Math.round((max * sr) / 2);
        keep.push([from, quietFrom + half]);
        from = i - half;
      }
      quietFrom = -1;
    }
  }
  keep.push([from, d0.length]);
  if (keep.length === 1) return b;
  const len = keep.reduce((n, [a, z]) => n + (z - a), 0);
  const out = ctx.createBuffer(b.numberOfChannels, len, sr);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const src = b.getChannelData(c);
    const dst = out.getChannelData(c);
    let o = 0;
    for (const [a, z] of keep) {
      dst.set(src.subarray(a, z), o);
      o += z - a;
    }
  }
  return out;
}
