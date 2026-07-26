import { isTerminal } from './container';
import {
  announce,
  commit as juiceCommit,
  flash as juiceFlash,
  playJuice,
  refuse as juiceRefuse,
} from './juice';
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

/**
 * DEFAULTS, REVISITED (ALIVE Phase 0).
 *
 * The docstring above says both default off "until you approve the taste". The
 * taste is approved, and the two halves turn out to deserve different answers:
 *
 *   haptics → ON. A trackpad detent is felt only by the person who caused it. It
 *     cannot embarrass anyone in an open-plan office, it has no volume, and it is
 *     the single clearest answer to "why is this an app and not a browser tab".
 *     Off-by-default was protecting against a cost this one does not have.
 *
 *   sound → still OFF. Every argument in the docstring above holds: an instrument
 *     that makes noise the first time you open it, in an office, without asking,
 *     is one you disable permanently within a minute — and disabling it takes the
 *     refusal cue with it. Opt-in.
 *
 * Terminal-only either way: `tap()` returns immediately in a browser.
 */
const HAPTICS_DEFAULT = true;
const SOUND_DEFAULT = false;

export function feelPrefs(): FeelPrefs {
  return {
    sound: storage.get(SOUND_KEY, SOUND_DEFAULT),
    haptics: storage.get(HAPTICS_KEY, HAPTICS_DEFAULT),
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

/* ── One event, one reaction ──────────────────────────────────────────────────
 *
 * ALIVE Phase 0 makes `apiClient` fire these centrally for every governed write,
 * which means a surface that ALSO fires them by hand — `VerbPanel` does, and it
 * is right to, because it holds the classified remedy prose — would produce two
 * reactions for one action. A double shake reads as a bug, and a double haptic
 * reads as a broken trackpad.
 *
 * Rather than coordinate (a flag threaded between the choke point and every
 * caller, which is the class of thing that rots), collapse it here: the same
 * event on the same element inside one window is one event. This makes the
 * invariant true by construction and it protects every future wiring too, not
 * just today's two.
 *
 * FIRST CALLER WINS, deliberately. The choke point fires from inside `request()`,
 * so it lands before any `await` in the caller resumes — and for commits it is
 * strictly the better reporter (it fires for all 22 actions, not just the ones a
 * surface remembered). For refusals the caller usually knows more, which is why
 * the choke point uses `refuseQuiet` and leaves the ANNOUNCEMENT to whoever holds
 * the remedy: the dedupe suppresses a second shake without suppressing the words.
 */
const DEDUPE_MS = 180;
let lastEvent: { kind: string; el: Element | null; at: number } | null = null;

function isEcho(kind: string, el: Element | null | undefined): boolean {
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  const target = el ?? null;
  if (lastEvent && lastEvent.kind === kind && lastEvent.el === target && now - lastEvent.at < DEDUPE_MS) {
    return true;
  }
  lastEvent = { kind, el: target, at: now };
  return false;
}

/** Test-only: forget the dedupe window. */
export function _resetDedupe(): void {
  lastEvent = null;
}

export const feedback = {
  /**
   * A governed write landed. Snap the row, rising cue, one crisp detent.
   * `alignment` is AppKit's snapping pattern — a single sharp tick, which is what
   * a commit should feel like; `generic` is duller and `level` is a double tap
   * that reads as a value stepping rather than a thing being done.
   */
  commit(el?: Element | null): void {
    if (isEcho('commit', el)) return;
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
    if (isEcho('refuse', el)) {
      // The shake already happened — but if the choke point fired it, the reason
      // did NOT, because it had only the server's message. Say the good prose.
      announce(reason, 'assertive');
      return;
    }
    juiceRefuse(el, reason);
    playCue('refused');
  },

  /**
   * A gate refused, and the caller does not know why in operator language.
   *
   * The choke point in `apiClient` is in this position: it has an `ApiError` code
   * and the server's message, but the remedy map that turns `SAT_REQUIRED` into
   * "this decision needs a premortem on file first" lives in
   * `components/command/invoke.ts` — which imports apiClient, so apiClient cannot
   * import it back.
   *
   * Rather than announce worse prose, announce nothing and let the surface that
   * holds the remedy speak. The operator still gets the shake and the falling cue
   * immediately, everywhere, for all 22 actions. Moving the remedy map into a
   * dependency-free module so this can announce properly is Phase 3 work.
   */
  refuseQuiet(el: Element | null | undefined): void {
    if (isEcho('refuse', el)) return;
    playJuice(el, 'shake');
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
