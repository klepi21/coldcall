'use client';
import { play } from './sound';
/**
 * Tiny haptic helper. A short 8ms tick on phones that support navigator.vibrate (Android Chrome).
 * iOS Safari has no vibrate API, so this is a silent no op there. Never throws.
 */
let last = 0;
export function haptic(pattern: number | number[] = 8) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  const now = Date.now();
  if (now - last < 40) return; // avoid buzzing on double events
  last = now;
  try {
    navigator.vibrate(pattern);
  } catch {}
}

/** Light tick plus a soft sound, for primary presses. Sound follows the player's sound setting. */
export function feedback(sound: 'press' | 'select' | 'tap' = 'press') {
  haptic(8);
  try {
    play(sound);
  } catch {}
}
