'use client';
/**
 * Original procedural sounds made with the Web Audio API, so there are no licensing questions.
 * Warm wood, paper and soft chime tones, not arcade beeps. Off until the first user gesture.
 */
export type SoundName = 'move' | 'capture' | 'check' | 'dice' | 'card' | 'deal' | 'bomb' | 'win' | 'lose' | 'tick' | 'tap' | 'coin' | 'error' | 'press' | 'select' | 'open';

let ctx: AudioContext | null = null;
let enabled = true;
export const setSoundEnabled = (on: boolean) => {
  enabled = on;
};
export const isSoundEnabled = () => enabled;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext || (window as any).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function noise(c: AudioContext, dur: number) {
  const b = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  const s = c.createBufferSource();
  s.buffer = b;
  return s;
}

function knock(c: AudioContext, t: number, freq: number, gain: number, decay = 0.08) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + decay);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + decay + 0.02);
  const n = noise(c, 0.03);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq * 6;
  const ng = c.createGain();
  ng.gain.value = gain * 0.6;
  n.connect(f).connect(ng).connect(c.destination);
  n.start(t);
}

function chime(c: AudioContext, t: number, freqs: number[], gain = 0.12, step = 0.09) {
  freqs.forEach((f, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    const s = t + i * step;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(gain, s + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.6);
    o.connect(g).connect(c.destination);
    o.start(s);
    o.stop(s + 0.65);
  });
}

function swish(c: AudioContext, t: number, gain = 0.15, dur = 0.09, freq = 2500) {
  const n = noise(c, dur);
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = gain;
  n.connect(f).connect(g).connect(c.destination);
  n.start(t);
}

export function play(name: SoundName) {
  if (!enabled) return;
  const c = ac();
  if (!c) return;
  const t = c.currentTime + 0.005;
  switch (name) {
    case 'move':
      return knock(c, t, 420, 0.35);
    case 'capture':
      knock(c, t, 300, 0.45, 0.1);
      return knock(c, t + 0.05, 520, 0.25);
    case 'check':
      knock(c, t, 380, 0.35);
      return chime(c, t + 0.05, [880], 0.06);
    case 'dice':
      for (let i = 0; i < 6; i++) knock(c, t + i * 0.055 + Math.random() * 0.02, 700 + Math.random() * 500, 0.18, 0.04);
      return;
    case 'card':
      return swish(c, t, 0.18, 0.07);
    case 'deal':
      for (let i = 0; i < 4; i++) swish(c, t + i * 0.04, 0.1, 0.05);
      return;
    case 'bomb':
      knock(c, t, 110, 0.6, 0.3);
      return swish(c, t, 0.25, 0.25, 400);
    case 'win':
      return chime(c, t, [523.25, 659.25, 783.99, 1046.5], 0.12);
    case 'lose':
      return chime(c, t, [392, 329.63], 0.07, 0.16);
    case 'tick':
      return knock(c, t, 1200, 0.08, 0.03);
    case 'tap':
      return knock(c, t, 900, 0.1, 0.03);
    case 'coin':
      return chime(c, t, [1318.5, 1760], 0.07, 0.05);
    case 'error':
      return knock(c, t, 180, 0.25, 0.12);
    case 'press':
      // Soft felt tap for primary buttons: low, short, quiet.
      return knock(c, t, 520, 0.07, 0.045);
    case 'select':
      // A lighter click for chips, tabs and toggles.
      return knock(c, t, 1100, 0.045, 0.025);
    case 'open':
      // A gentle air swish when a sheet opens.
      return swish(c, t, 0.05, 0.12, 1800);
  }
}

export function haptic(kind: 'light' | 'strong' = 'light') {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(kind === 'light' ? 8 : [12, 30, 18]);
}
