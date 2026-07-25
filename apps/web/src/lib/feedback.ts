import { isTerminal } from './container';
import { commit as juiceCommit, flash as juiceFlash, refuse as juiceRefuse } from './juice';
import { storage } from './persistence';

/**
 * Sound and haptics (TERMINAL Phase 5).
 *
 * The plan asks for "a couple of near-subliminal cues (command accepted / gate
 * blocked) and trackpad haptics on commit", and — explicitly — "off by default
 * until you approve the taste". Both default to OFF here, and that is a decision
 * rather than a placeholder: an instrument that makes noise the first time you
 * open it, in an office, without asking, is one you turn off permanently within a
 * minute. Off-by-default costs one visit to Settings for anyone who wants it and
 * costs nothing to anyone who does not.
 *
 * ONE ENTRY POINT PER EVENT. Call sites use `feedback.commit(el)` and
 * `feedback.refuse(el, reason)`, not the three layers separately. If a call site
 * had to remember to play the juice AND the cue AND the tap, they would drift
 * apart immediately — some commits would be silent, and the inconsistency would
 * read as bugginess rather than as taste.
 *
 * NO AUDIO ASSETS. The two cues are synthesised with the Web Audio API. A pair of
 * .wav files would be a few KB against a bundle budget with 19KB of headroom, plus
 * two more network requests, plus a decode — for two tones. Synthesis also means
 * the cues can be tuned by editing numbers rather than by re-exporting audio.
 */

const SOUND_KEY = 'feel:sound';
const HAPTICS_KEY = 'feel:haptics';

export interface FeelPrefs {
  sound: boolean;
  haptics: boolean;
}

export function feelPrefs(): FeelPrefs {
  return {
    sound: storage.get(SOUND_KEY, false),
    haptics: storage.get(HAPTICS_KEY, false),
  };
}

export function setFeelPref(key: keyof FeelPrefs, on: boolean): void {
  storage.set(key === 'sound' ? SOUND_KEY : HAPTICS_KEY, on);
}

/* ── Sound ───────────────────────────────────────────────────────────────── */

type Cue = 'accepted' | 'refused';

/**
 * Cue shapes. Both are deliberately short and quiet enough to sit under
 * conversation — the brief word is "near-subliminal", and the failure mode of
 * getting this wrong is not "it sounds bad", it is "the operator disables sound
 * and never hears the refusal cue either".
 *
 * `accepted` rises, `refused` falls. That direction is the only part carrying
 * meaning, and it is the part that survives a cheap laptop speaker.
 */
const CUES: Record<Cue, { from: number; to: number; ms: number; gain: number }> = {
  accepted: { from: 880, to: 1_320, ms: 70, gain: 0.035 },
  refused: { from: 320, to: 180, ms: 110, gain: 0.045 },
};

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  // Created on first USE, never at module load: an AudioContext holds an audio
  // thread and, in some browsers, logs a warning when constructed outside a user
  // gesture. Since sound defaults off, most operators never construct one at all.
  if (!ctx) ctx = new Ctor();
  return ctx;
}

export function playCue(cue: Cue): void {
  if (!feelPrefs().sound) return;
  const ac = audioContext();
  if (!ac) return;
  // An AudioContext created before the first gesture starts suspended and stays
  // silent until resumed. Resuming is a promise we deliberately do not await:
  // the cue is worthless if it arrives late, and the next one will work.
  if (ac.state === 'suspended') void ac.resume();

  const { from, to, ms, gain } = CUES[cue];
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, now);
  osc.frequency.exponentialRampToValueAtTime(to, now + ms / 1000);

  // A ramped envelope, not a raw gate. Starting and stopping a tone at full
  // amplitude produces an audible click at both ends — the click is broadband and
  // louder than the tone, so the "subliminal" cue becomes the most conspicuous
  // sound in the app. exponentialRamp cannot reach zero, hence the small floor.
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(gain, now + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);

  osc.connect(amp).connect(ac.destination);
  osc.start(now);
  osc.stop(now + ms / 1000 + 0.02);
}

/* ── Haptics ─────────────────────────────────────────────────────────────── */

type Pattern = 'generic' | 'alignment' | 'level';

/**
 * A physical detent under the finger. Terminal-only — there is no web API for
 * this, which makes it the clearest single answer to "why is this an app rather
 * than a browser tab".
 *
 * Fire-and-forget, and silent about failure by design. It returns false on a Mac
 * with no Force Touch trackpad, which is a normal configuration, not an error;
 * surfacing that to the operator would be noise about a feature they did not ask
 * for. Honest limitation: this cannot be verified by any test — code can prove the
 * command returns without crashing, but only a fingertip can prove a tap happened.
 */
export function tap(pattern: Pattern = 'alignment'): void {
  if (!feelPrefs().haptics || !isTerminal()) return;
  void (async () => {
    try {
      const core = await import('@tauri-apps/api/core');
      await core.invoke('haptic_tap', { pattern });
    } catch {
      /* no performer, or the command is absent in an older shell */
    }
  })();
}

/* ── The combined events ─────────────────────────────────────────────────── */

export const feedback = {
  /**
   * A governed write landed. Snap the row, rising cue, one crisp detent.
   * `alignment` is AppKit's snapping pattern — a single sharp tick, which is what
   * a commit should feel like; `generic` is duller and `level` is a double tap
   * that reads as a value stepping rather than a thing being done.
   */
  commit(el?: Element | null): void {
    juiceCommit(el);
    playCue('accepted');
    tap('alignment');
  },

  /**
   * A gate refused. Shake, say why, falling cue. NO haptic: a refusal is not a
   * physical event the operator caused to succeed, and buzzing someone for being
   * stopped by policy is the app scolding them. The reason is what matters, and
   * `juiceRefuse` speaks it into a live region so it reaches an operator who
   * cannot see the shake.
   */
  refuse(el: Element | null | undefined, reason: string): void {
    juiceRefuse(el, reason);
    playCue('refused');
  },

  /** A status became something. Silent — ambient change, not an operator action. */
  became(el: Element | null | undefined, tint: 'live' | 'blocked' | 'warn' | 'info' = 'info'): void {
    juiceFlash(el, tint);
  },
};

/** Test-only. */
export function _resetFeedback(): void {
  void ctx?.close?.();
  ctx = null;
}
