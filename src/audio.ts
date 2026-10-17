// Tiny Web Audio chiptune engine: square/triangle tones, filtered noise, arpeggios, a little drum kit,
// and a music player that schedules looping tunes a few milliseconds ahead. Each game brings its own
// sound effects and tunes.

let ctx: AudioContext | null = null;
let master: GainNode;
let noiseBuf: AudioBuffer;
let volume = 0.22;

/** Starts sound; call it from a key press, tap or click, as browsers only allow audio after one. */
/**
 * Inside another page (an iframe, such as the showcase's live previews) the games stay silent:
 * without an audio context every tone, noise and tune is a no-op.
 */
const embedded = typeof window !== 'undefined' && window.self !== window.top;

export function unlockAudio() {
  if (embedded) return;
  // iOS: play through the silent switch like a media app (Safari 16.4+).
  const session = (navigator as { audioSession?: { type: string } }).audioSession;
  if (session && session.type !== 'playback') session.type = 'playback';
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

/** Master volume, 0.22 unless a game sets its own. */
export function setVolume(v: number) {
  volume = v;
  if (ctx) master.gain.value = v;
}

/** The audio clock in seconds, or null until sound is unlocked. */
export const audioNow = () => ctx?.currentTime ?? null;

/** The context and master gain, for games that route sounds through nodes of their own; null until unlocked. */
export const audioOut = () => (ctx ? { ctx, master } : null);

export const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** One note: held for 70% of `dur`, then faded out. `at` 0 means now; `slideTo` glides the pitch. */
export function tone(freq: number, dur: number, type: OscillatorType, vol: number, at = 0, slideTo?: number, out?: AudioNode) {
  if (!ctx) return;
  const t = at || ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.setValueAtTime(vol, t + dur * 0.7);
  g.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(g).connect(out ?? master);
  osc.start(t);
  osc.stop(t + dur + 0.01);
}

/** A burst of filtered noise that decays over `dur`; `sweepTo` moves the filter. */
export function noise(
  dur: number,
  vol: number,
  cutoff: number,
  at = 0,
  type: BiquadFilterType = 'lowpass',
  sweepTo?: number,
  out?: AudioNode,
) {
  if (!ctx) return;
  const t = at || ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(cutoff, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(out ?? master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur);
}

/** Midi notes one after another, `step` seconds each; 0 is a rest. */
export function arp(notes: number[], step: number, vol = 0.25, type: OscillatorType = 'square') {
  if (!ctx) return;
  const t = ctx.currentTime;
  notes.forEach((n, i) => n && tone(midiHz(n), step, type, vol, t + i * step));
}

export const perc = {
  snare: (t: number, vol: number) => noise(0.05, vol, 7000, t, 'highpass'),
  hat: (t: number, vol: number) => noise(0.03, vol, 9000, t, 'highpass'),
  kick: (t: number, vol: number) => {
    tone(120, 0.12, 'sine', vol, t, 40);
    noise(0.04, vol * 0.4, 300, t);
  },
};

// ---------- music ----------
// A tune is a loop of time units. The player calls it for every unit a little ahead of time, with
// the game's intensity (0-5, instruments join as it rises) and transposition.

export interface Tune {
  name: string;
  /** Seconds per unit at tempo 1. */
  unit: number;
  length: number;
  /** Schedule whatever sounds at unit i (already wrapped into the loop). */
  play(i: number, t: number, lv: number, tr: number, unitSec: number): void;
}

/** Indexes flat [onset, midi, length] triples by onset. */
export function onsets(flat: number[], offset = 0, map = new Map<number, [number, number][]>()) {
  for (let k = 0; k < flat.length; k += 3) {
    const at = flat[k] + offset;
    if (!map.has(at)) map.set(at, []);
    map.get(at)!.push([flat[k + 1], flat[k + 2]]);
  }
  return map;
}

/** A player for the game's tunes. Music is on until toggled off; sounds don't wait for it. */
export function createMusic(tunes: Tune[]) {
  let musicOn = true;
  let playing = false;
  let tune = 0;
  let unit = 0;
  let nextTime = 0;
  let timer: number | undefined;
  let transpose = 0;
  let intensity = 0;
  let tempo = 1;

  function schedule() {
    if (!ctx) return;
    const tn = tunes[tune];
    while (nextTime < ctx.currentTime + 0.12) {
      const u = tn.unit / tempo;
      tn.play(unit % tn.length, nextTime, intensity, transpose, u);
      unit++;
      nextTime += u;
    }
  }

  return {
    /** Start (or keep playing) a tune; switching tunes starts it from the top. */
    play(which = tune, restart = false) {
      if (which !== tune || restart) {
        this.halt();
        tune = which;
        unit = 0;
      }
      playing = true;
      if (!ctx || !musicOn || timer !== undefined) return;
      nextTime = ctx.currentTime + 0.05;
      timer = window.setInterval(schedule, 25);
    },
    resume() {
      if (playing) this.play();
    },
    stop() {
      playing = false;
      this.halt();
    },
    halt() {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    },
    /** Semitones the tunes are shifted by. */
    setTranspose(semis: number) {
      transpose = semis;
    },
    setIntensity(lv: number) {
      intensity = lv;
    },
    /** Tempo multiplier. */
    setTempo(mult: number) {
      tempo = mult;
    },
    toggle() {
      musicOn = !musicOn;
      if (!musicOn) this.halt();
      else if (playing) this.play();
      return musicOn;
    },
    set enabled(on: boolean) {
      if (on !== musicOn) this.toggle();
    },
    get enabled() {
      return musicOn;
    },
    get running() {
      return timer !== undefined;
    },
    get tune() {
      return tune;
    },
  };
}
