// The soundscape. Off until someone turns it on (browsers only allow audio after a click anyway).
// Ambience follows the hour and where you're looking; radio lines go through a band-pass "radio" filter;
// the guide has a narrator. Files live in public/audio/.

export type Bed = 'amb-city-day' | 'amb-city-night' | 'amb-cell-room' | 'amb-market' | 'amb-park' | 'amb-water' | 'amb-pitch' | 'amb-traffic' | 'amb-wind' | 'amb-school' | 'amb-industry' | 'amb-camp' | 'amb-groves' | 'amb-desert' | 'amb-mosque' | 'amb-crowd' | 'amb-siren' | 'amb-hose';
const BEDS: Bed[] = ['amb-city-day', 'amb-city-night', 'amb-cell-room', 'amb-market', 'amb-park', 'amb-water', 'amb-pitch', 'amb-traffic', 'amb-wind', 'amb-school', 'amb-industry', 'amb-camp', 'amb-groves', 'amb-desert', 'amb-mosque', 'amb-crowd', 'amb-siren', 'amb-hose'];
const KEY = 'cd.sound.v2'; // v2: everyone starts with sound on again
const MIX_KEY = 'cd.mix.v2'; // v2: everyone starts again from the quieter default
const HEADROOM = 0.85; // the loudest the page ever gets, at 100% on every slider

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
  | 'after-0'
  | 'after-few'
  | 'after-some'
  | 'after-many'
  | 'after-mass'
  | 'jev-start'
  | 'jev-tick'
  | 'jev-read'
  | 'jev-done'
  | 'hold-charge'
  | 'aircraft-approach'
  | 'aircraft-cargo'
  | 'bomb-whistle'
  | 'impact'
  | 'impact-mega'
  | 'aftermath'
  | 'stamp'
  | 'radio-static'
  | 'moto'
  | 'paper-flutter'
  | 'mission-sting'
  | 'amb-call-to-prayer';

/** Small one-off sounds of the city, played now and then, placed left or right by where they are on screen. */
export type CityCue =
  | 'cue-dog'
  | 'cue-moped'
  | 'cue-pigeons'
  | 'cue-shutter'
  | 'cue-rooster'
  | 'cue-kitchen'
  | 'cue-generator'
  | 'cue-bus'
  | 'cue-workshop'
  | 'cue-frogs'
  | 'cue-chimes'
  | 'cue-radio-music'
  | 'cue-sellers'
  | 'cue-siren'
  | 'cue-train'
  | 'cue-pump'
  | 'cue-canvas'
  | 'cue-jerrycan'
  | 'cue-bricks'
  | 'cue-goats'
  | 'cue-gathering'
  | 'cue-crew' // Living: a responder crew pulling up at a strike (doors, a call)
  | 'amb-call-to-prayer'; // played as a placed city sound, from the minaret

export type RadioLine = 'radio-01-pol' | 'radio-02-estimate' | 'radio-03-cleared' | 'radio-04-away' | 'radio-05-splash' | 'radio-06-destroyed' | 'radio-07-intact' | 'radio-08-bda' | 'radio-09-jev-run' | 'radio-10-jev-done' | 'radio-11-abort' | 'radio-12-calloff';

const VOLUME: Partial<Record<Cue, number>> = {
  'ui-hover': 0.12,
  'ui-click': 0.15,
  'ui-toggle': 0.18,
  'ui-discover': 0.18,
  'ui-weapon': 0.3,
  'ui-building': 0.2,
  'hold-abort': 0.3,
  'jev-start': 0.28,
  'jev-tick': 0.045,
  'jev-read': 0.28,
  'jev-done': 0.3,
  'hold-charge': 0.5,
  'aircraft-approach': 0.24,
  'aircraft-cargo': 0.55,
  'bomb-whistle': 0.3,
  impact: 1,
  'impact-mega': 0.75,
  aftermath: 0.6,
  stamp: 0.7,
  'radio-static': 0.16,
  moto: 0.45,
  'paper-flutter': 0.5,
  'mission-sting': 0.45,
  'amb-call-to-prayer': 0.3,
};

class SoundEngine {
  enabled = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Partial<Record<Bus, GainNode>> = {};
  mix: Mix = { ...DEFAULT_MIX };
  /** During the guide: the narrator leads. No radio, no Jev noises, the city turned right down. */
  quiet = false;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private beds = new Map<Bed, { src: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode }>();
  private starting = new Set<Bed>(); // beds being loaded, so a bed is never started twice
  private distance: BiquadFilterNode | null = null; // the city muffled from high up
  private lastWhoosh = 0;
  private voiceNode: AudioBufferSourceNode | null = null;
  private voiceSeq = 0; // the latest narration asked for; an older one that finishes loading later is dropped
  private charge: AudioBufferSourceNode | null = null;
  private lastTick = 0;
  private radioFree = 0; // when the radio is next free
  private listeners = new Set<(on: boolean) => void>();

  constructor() {
    try {
      this.enabled = localStorage.getItem(KEY) !== '0'; // on unless you've turned it off
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
  setQuiet(q: boolean) {
    if (q === this.quiet) return;
    this.quiet = q;
    this.applyMix();
  }
  private applyMix() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.enabled) this.master?.gain.setTargetAtTime(this.mix.master * HEADROOM, t, 0.1);
    for (const b of ['ambience', 'effects', 'voices'] as Bus[]) this.buses[b]?.gain.setTargetAtTime(this.level(b), t, this.ducked ? 0.6 : 0.4);
  }
  /** A bus's level: the mix, less the ambience while the guide talks, less everything else under a feature narration. */
  private level(b: Bus) {
    const duck = this.ducked ? (b === 'ambience' ? 0.3 : b === 'effects' ? 0.45 : 1) : 1;
    return this.mix[b] * (this.quiet && b === 'ambience' ? 0.25 : 1) * duck;
  }
  // A feature narration (the closing debrief): everything else ducks under it, and no other voice may start.
  private ducked = false;
  private held = false;
  private release() {
    if (!this.held) return;
    this.held = false;
    this.ducked = false;
    this.applyMix();
  }
  /** Play a narration that holds the floor: other sound ducks, other speech waits; levels come back after. */
  async feature(name: string): Promise<number> {
    this.stopVoice(true);
    if (!this.enabled) return 0;
    this.ensure();
    this.held = true;
    this.ducked = true;
    this.applyMix();
    const seq = this.voiceSeq;
    const r = await this.start(name, 1);
    if (!r || seq !== this.voiceSeq) {
      if (r) r.src.stop();
      if (seq === this.voiceSeq) this.release();
      return 0;
    }
    this.voiceNode = r.src;
    r.src.onended = () => {
      if (this.voiceNode === r.src) this.release();
    };
    return r.src.buffer?.duration ?? 0;
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
      this.master?.gain.setTargetAtTime(this.mix.master * HEADROOM, this.ctx!.currentTime, 0.2);
    } else if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
      this.voiceNode?.stop();
      this.voiceNode = null;
    }
    this.listeners.forEach((f) => f(on));
  }

  /** Called on taps and key presses until the browser lets audio run. True once it does. */
  /** Whether the browser is letting audio play right now. */
  running() {
    return this.ctx?.state === 'running';
  }
  wake(): boolean {
    if (!this.enabled) return true;
    if (this.ctx?.state === 'running') return true;
    this.ensure();
    void this.ctx!.resume();
    this.unlock();
    this.master?.gain.setTargetAtTime(this.mix.master * HEADROOM, this.ctx!.currentTime, 0.2);
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
    // The city goes through a low-pass filter: high above it is soft and far away, close to the roofs it's clear.
    this.distance = this.ctx.createBiquadFilter();
    this.distance.type = 'lowpass';
    this.distance.frequency.value = 2000;
    this.distance.Q.value = 0.4;
    this.distance.connect(this.master);
    for (const b of ['ambience', 'effects', 'voices'] as Bus[]) {
      const g = this.ctx.createGain();
      g.gain.value = this.level(b);
      g.connect(b === 'ambience' ? this.distance : this.master);
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

  /** Fetch and decode these now, so they play the moment they're asked for. */
  preload(names: string[]) {
    if (!this.enabled) return;
    this.ensure();
    for (const n of names) void this.load(n);
  }

  play(cue: Cue, delay = 0, volume = VOLUME[cue] ?? 0.5) {
    if (this.quiet && cue.startsWith('jev-')) return;
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
    if (!this.enabled || this.quiet || this.held) return;
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
    return this.narrate(`voice/guide-${String(n).padStart(2, '0')}`);
  }
  /** Play one narration (a file under voice/), stopping any other. Resolves with its length in seconds, or 0. */
  async narrate(name: string): Promise<number> {
    if (this.held) return 0; // a feature narration has the floor
    this.stopVoice();
    if (!this.enabled) return 0;
    const seq = this.voiceSeq;
    const r = await this.start(name, 1);
    if (!r) return 0;
    if (seq !== this.voiceSeq) {
      // Something else was asked for while this one loaded.
      try {
        r.src.stop();
      } catch {
        /* fine */
      }
      return 0;
    }
    this.voiceNode = r.src;
    return r.src.buffer?.duration ?? 0;
  }
  /** Stop the narration. A feature narration only stops when asked for by name (force), e.g. its card is closed. */
  stopVoice(force = false) {
    if (this.held && !force) return;
    this.release();
    this.voiceSeq++;
    try {
      this.voiceNode?.stop();
    } catch {
      /* fine */
    }
    this.voiceNode = null;
  }

  /** Crossfade the ambient beds to these levels (0–1). */
  async ambience(levels: Partial<Record<Bed, number>>, pans: Partial<Record<Bed, number>> = {}) {
    if (!this.enabled) return;
    this.ensure();
    const ctx = this.ctx!;
    for (const bed of BEDS) {
      const want = (levels[bed] ?? 0) * 0.4;
      const b = this.beds.get(bed);
      if (b) {
        b.gain.gain.setTargetAtTime(want, ctx.currentTime, 1.2);
        b.pan.pan.setTargetAtTime(pans[bed] ?? 0, ctx.currentTime, 0.6);
        continue;
      }
      if (want <= 0.001 || this.starting.has(bed)) continue;
      this.starting.add(bed);
      const pan = ctx.createStereoPanner();
      pan.pan.value = pans[bed] ?? 0;
      pan.connect(this.buses.ambience!);
      void this.start(bed, 0, pan, 0, true).then((n) => {
        this.starting.delete(bed);
        if (!n) return pan.disconnect();
        this.beds.set(bed, { ...n, pan });
        n.gain.gain.setTargetAtTime(want, ctx.currentTime, 1.2);
      });
    }
  }

  /** How close to the roofs you are, 0 (high above) to 1 (down among them): the city gets clearer as you come down. */
  setAltitude(close: number) {
    if (!this.ctx || !this.distance) return;
    const hz = 650 * Math.pow(16000 / 650, Math.max(0, Math.min(1, close)));
    this.distance.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.35);
  }

  /** A small sound of the city, somewhere to the left or right. Goes through the same distance as the rest. */
  cue(name: CityCue, pan = 0, volume = 0.25) {
    if (!this.enabled || this.quiet) return;
    this.ensure();
    const ctx = this.ctx!;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.buses.ambience!);
    void this.start(name, volume, p).then((n) => n?.src.addEventListener('ended', () => p.disconnect()));
  }

  /** The call to prayer heard up close at the mosque: follows how near you are, and fades away as you leave.
   * (The timed calls across the city are separate one-offs, and don't fade.) */
  private visit: { src: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode } | null = null;
  private visitStarting = false;
  private visitLevel = 0;
  async nearCall(level: number, pan: number, begin = false) {
    this.visitLevel = level;
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const v = this.visit;
    if (v) {
      v.gain.gain.setTargetAtTime(level, ctx.currentTime, level > 0 ? 0.3 : 0.5);
      v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), ctx.currentTime, 0.3);
      if (level <= 0.001) {
        this.visit = null;
        window.setTimeout(() => {
          try {
            v.src.stop();
          } catch {
            /* fine */
          }
          v.pan.disconnect();
        }, 2500);
      }
      return;
    }
    if (!begin || level <= 0.001 || this.visitStarting || this.quiet) return;
    this.visitStarting = true;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.buses.ambience!);
    const r = await this.start('amb-call-to-prayer', 0.0001, p);
    this.visitStarting = false;
    if (!r) return p.disconnect();
    r.gain.gain.setTargetAtTime(this.visitLevel, ctx.currentTime, 0.4);
    this.visit = { src: r.src, gain: r.gain, pan: p };
    r.src.addEventListener('ended', () => {
      if (this.visit?.src === r.src) this.visit = null;
      p.disconnect();
    });
    if (this.visitLevel <= 0.001) void this.nearCall(0, pan);
  }

  /** A soft rush of air when you zoom a long way quickly. Made here, not from a file. */
  whoosh(up: boolean) {
    if (!this.enabled || !this.ctx || this.quiet) return;
    const now = performance.now();
    if (now - this.lastWhoosh < 900) return;
    this.lastWhoosh = now;
    const ctx = this.ctx;
    const len = 0.55;
    const buf = ctx.createBuffer(1, Math.round(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    const t = ctx.currentTime;
    bp.frequency.setValueAtTime(up ? 500 : 1400, t);
    bp.frequency.exponentialRampToValueAtTime(up ? 1400 : 450, t + len);
    const g = ctx.createGain();
    g.gain.value = 0.05;
    src.connect(bp).connect(g).connect(this.buses.effects!);
    src.start(t);
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
