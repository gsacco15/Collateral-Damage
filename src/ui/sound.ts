// The soundscape. Off until someone turns it on (browsers only allow audio after a click anyway).
// Ambience follows the hour and where you're looking; radio lines go through a band-pass "radio" filter;
// the guide has a narrator. Files live in public/audio/.

type Bed = 'amb-city-day' | 'amb-city-night' | 'amb-cell-room' | 'amb-market';
const BEDS: Bed[] = ['amb-city-day', 'amb-city-night', 'amb-cell-room', 'amb-market'];
const KEY = 'cd.sound';

export type Cue =
  | 'ui-hover'
  | 'ui-click'
  | 'ui-toggle'
  | 'ui-discover'
  | 'ui-weapon'
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

export type RadioLine = 'radio-01-pol' | 'radio-02-estimate' | 'radio-03-cleared' | 'radio-04-away' | 'radio-05-splash' | 'radio-06-destroyed' | 'radio-07-intact' | 'radio-08-bda';

const VOLUME: Partial<Record<Cue, number>> = {
  'ui-hover': 0.12,
  'ui-click': 0.25,
  'ui-toggle': 0.3,
  'ui-discover': 0.35,
  'ui-weapon': 0.45,
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
  'radio-static': 0.35,
  'amb-call-to-prayer': 0.35,
};

class SoundEngine {
  enabled = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private beds = new Map<Bed, { src: AudioBufferSourceNode; gain: GainNode }>();
  private voiceNode: AudioBufferSourceNode | null = null;
  private charge: AudioBufferSourceNode | null = null;
  private lastTick = 0;
  private listeners = new Set<(on: boolean) => void>();

  constructor() {
    try {
      this.enabled = localStorage.getItem(KEY) === '1';
    } catch {
      /* stays off */
    }
  }

  onChange(f: (on: boolean) => void) {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
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
      this.master?.gain.setTargetAtTime(1, this.ctx!.currentTime, 0.2);
    } else if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
      this.voiceNode?.stop();
      this.voiceNode = null;
    }
    this.listeners.forEach((f) => f(on));
  }

  private ensure() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
  }

  private load(name: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(name);
    if (!p) {
      const ctx = this.ctx!;
      p = fetch(`/audio/${name}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((b) => ctx.decodeAudioData(b))
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
    src.connect(g).connect(dest ?? this.master!);
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
    if (!buf) return this.play('radio-static', delay); // line not recorded yet: just the squelch
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
      curve[i] = Math.tanh(x * 2.2);
    }
    shaper.curve = curve;
    const g = ctx.createGain();
    g.gain.value = 0.9;
    hp.connect(lp).connect(shaper).connect(g).connect(this.master!);
    this.play('radio-static', delay);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(hp);
    const t = ctx.currentTime + delay + 0.18;
    src.start(t);
    this.play('radio-static', delay + 0.18 + buf.duration + 0.05);
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
