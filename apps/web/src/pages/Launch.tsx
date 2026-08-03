import { Link } from 'react-router-dom';
import { ArrowRight, Download } from 'lucide-react';
import { LcxMark } from '@/components/brand/LcxMark';

/**
 * The public face of LCXOS — the page the shared link opens.
 *
 * WHY IT EXISTS. The URL we hand to a colleague used to land on the sign-in form,
 * which asks for a passcode and explains nothing, and the Mac app was only
 * reachable by sending someone a GitHub link. Both are now wrong: this page is
 * what the link opens, it explains the product, and the download is on it.
 *
 * THREE RULES THIS PAGE OBEYS, each for a measured reason.
 *
 * 1. **IT MAKES NO API CALL. NOT ONE.** The API sleeps on Render's free tier and
 *    takes 13.5 seconds to wake (measured, Phase B). A first-time visitor arrives
 *    while it is asleep more often than not. A version badge or a health check
 *    here would turn the front page into a spinner for the exact person we are
 *    trying not to lose. Everything on this page is static, so it paints as fast
 *    as the CDN can serve it whatever the API is doing. There is a test that
 *    fails if an import pulls in the API client.
 * 2. **NOTHING HERE IS AN ACTION.** No governed write is reachable, by
 *    construction rather than by discipline: the page is a sibling of `AppLayout`,
 *    so it renders outside the signed-in shell entirely and has no access to the
 *    action registry, the command line or the inspector.
 * 3. **EVERY CLAIM IS TRUE OF THE SHIPPED BUILD.** This programme has withdrawn
 *    twelve false claims about its own software in a week; a marketing page is the
 *    obvious place for the thirteenth. So the four app-only advantages below are
 *    the four that are actually real, each traceable:
 *      · ⌥Space global summon — `apps/desktop/src-tauri/src/lib.rs` registers it
 *      · ⌘0-6 workspaces — a browser keeps those chords for its own tabs, which is
 *        why `g`+digit exists and works in both (`lib/manual.ts`, quickstart §3)
 *      · Keychain-backed credential — `lib.rs` KEYRING_SERVICE + `lib/terminal.ts`
 *      · cached reads, so the desk opens without the network (Phase 2 read cache)
 *    Nothing else is claimed. In particular this page does NOT claim the app is
 *    faster: production sits behind ~165-195ms of fixed network latency that no
 *    client can remove, and saying otherwise would be the kind of sentence this
 *    programme spends its time deleting.
 *
 * ON THE GATEKEEPER NOTE, which is the highest-stakes copy here. The app is
 * ad-hoc signed, not Developer-ID signed, so on first launch macOS refuses a
 * double-click. A colleague who hits that, concludes the file is broken and gives
 * up is the single most likely way this whole plan fails — so the instruction sits
 * directly under the download button rather than in a FAQ, it is phrased as an
 * expected step rather than an error, and it says "once per Mac" because the fear
 * is that it will happen every time.
 */

/**
 * The published version. Deliberately a literal and NOT read from the API or from
 * package.json at runtime: see rule 1. `launch.test.tsx` asserts it equals
 * `apps/desktop/src-tauri/tauri.conf.json`, so a release that forgets this line
 * turns the suite red instead of leaving a stale number on the front page.
 */
export const LCXOS_VERSION = '0.2.6';
/**
 * The download's size in MB, one decimal place.
 *
 * It said 6.4 for a while, which was the size of the predecessor build this
 * replaced — the real 0.2.0 DMG is 3.8MB. Caught by curl'ing the live download and
 * reading `content-length: 3790578`, i.e. by looking at the artefact rather than at
 * the page. `publish-release.mjs` now REFUSES TO PUBLISH if this number disagrees
 * with the DMG it is about to upload, so the next release cannot ship a stale figure
 * the way this one nearly did.
 */
export const LCXOS_DMG_MB = 4.0;

/**
 * The permanent download URL. `/releases/latest/download/<name>` is a GitHub
 * redirect to the newest release's asset, so this link never needs editing again —
 * which is the whole point, because a hardcoded version in a URL is a broken
 * download three releases later. `publish-release.mjs` uploads this exact,
 * version-less asset name on every release for that reason, and asserts it
 * resolves afterwards.
 */
export const LCXOS_DOWNLOAD_URL =
  'https://github.com/voyagernik123/lcx-terminal-releases/releases/latest/download/LCXOS-macOS-arm64.dmg';

const WHAT_IT_DOES = [
  {
    k: 'Pipeline',
    d: 'Every exchange-listing target, contact and deal in one ranked queue, worked from the keyboard.',
  },
  {
    k: 'Programme',
    d: 'The US launch as a live object — readiness, partners, decisions and the open questions behind each one.',
  },
  {
    k: 'Governance',
    d: 'Twenty-two actions, each gated on your role and workspace, each attributed and written to the audit log.',
  },
];

const WHY_THE_APP = [
  { k: '⌥Space', d: 'Brings the desk up from anywhere on the Mac, over whatever you were doing.' },
  { k: '⌘0–6', d: 'Jump straight to a workspace. A browser keeps those chords for its own tabs.' },
  { k: 'Keychain', d: 'Your desk passcode is held by macOS, not typed again every session.' },
  { k: 'Offline reads', d: 'Yesterday’s figures still open when the network does not.' },
];

export function Launch() {
  return (
    <div className="min-h-screen bg-page text-navy antialiased">
      <div className="mx-auto max-w-3xl px-6 py-14 sm:py-20">
        {/* ── signature ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-lcx-black text-lcx-white">
            <LcxMark size={36} withClearSpace />
          </span>
          <span className="text-[15px] font-bold tracking-tight">LCXOS</span>
        </div>

        {/* ── the one sentence, then the two doors ──────────────────────────── */}
        <h1 className="mt-10 text-[40px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[52px]">
          The desk for LCX’s
          <br />
          US launch.
        </h1>
        <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-grey">
          One place to work the pipeline, the partners and the regulatory path — where every
          action is gated on who you are, attributed to you, and written down.
        </p>

        {/* THE DOWNLOAD MOMENT.
          * It sits immediately under the positioning sentence, above everything
          * explanatory, because a colleague who has to scroll to find the app has
          * already decided the browser is the product. The browser door is a plain
          * link beside it, not a second button: two equally loud buttons mean no
          * primary action, which is the exact defect the send-queue ratchet in this
          * repo exists to prevent. */}
        <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
          <a
            href={LCXOS_DOWNLOAD_URL}
            className="inline-flex items-center gap-2.5 rounded-lg bg-navy px-5 py-3 text-[15px] font-semibold text-card transition-opacity hover:opacity-90"
          >
            <Download size={17} />
            Download for Mac
          </a>
          <Link
            to="/select"
            className="inline-flex items-center gap-1.5 text-[15px] font-medium text-grey transition-colors hover:text-navy"
          >
            Or open it in the browser
            <ArrowRight size={15} />
          </Link>
        </div>

        <p className="mt-3.5 font-mono text-[11px] uppercase tracking-[0.14em] text-grey">
          {LCXOS_VERSION} · {LCXOS_DMG_MB} MB · Apple Silicon
        </p>

        {/* The Gatekeeper step. Attached to the download, phrased as a step rather
          * than an error, and explicit that it happens once. */}
        <div className="mt-5 max-w-xl rounded-lg border border-line bg-card px-4 py-3.5">
          <p className="text-[13px] leading-relaxed text-grey">
            <span className="font-semibold text-navy">First launch: right-click the app → Open.</span>{' '}
            macOS asks once per Mac, because this app is signed by us rather than by Apple.
            Double-clicking the first time will refuse — that is expected, and it is not a
            broken download.
          </p>
        </div>

        {/* ── what it is. No actions, just orientation. ─────────────────────── */}
        <div className="mt-16 border-t border-line pt-10">
          <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-grey">
            What it is
          </h2>
          <dl className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-3">
            {WHAT_IT_DOES.map((r) => (
              <div key={r.k}>
                <dt className="text-[14px] font-semibold text-navy">{r.k}</dt>
                <dd className="mt-1.5 text-[13px] leading-relaxed text-grey">{r.d}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ── the grammar, which IS the product ────────────────────────────── */}
        <div className="mt-14 border-t border-line pt-10">
          <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-grey">
            How you use it
          </h2>
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-navy">
            Press <Kbd>⌘K</Kbd>, type enough of a name to find the thing, press{' '}
            <Kbd>↵</Kbd>, pick the verb, fill the fields.
          </p>
          <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-grey">
            That is the whole grammar — object, verb, parameters, enter — and there is no
            separate place to go for each kind of work. <Kbd>?</Kbd> shows what you can do on
            the screen you are on, generated from the build you are running. When something is
            refused, it tells you what to do next rather than that it failed.
          </p>
        </div>

        {/* ── the honest case for the app ──────────────────────────────────── */}
        <div className="mt-14 border-t border-line pt-10">
          <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-grey">
            What the Mac app adds
          </h2>
          <p className="mt-5 max-w-xl text-[13px] leading-relaxed text-grey">
            The browser version is the same desk and nothing is missing from it. These four
            things are the difference, and they are the reason the app is worth the two
            minutes:
          </p>
          <dl className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {WHY_THE_APP.map((r) => (
              <div key={r.k} className="flex gap-3">
                <dt className="shrink-0 font-mono text-[12px] font-semibold text-navy">{r.k}</dt>
                <dd className="text-[13px] leading-relaxed text-grey">{r.d}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ── footer ───────────────────────────────────────────────────────── */}
        <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-grey">
            LCXOS · internal · not legal advice
          </p>
          <Link
            to="/select"
            className="text-[13px] font-semibold text-navy transition-opacity hover:opacity-70"
          >
            Log in →
          </Link>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-card px-1.5 py-0.5 font-mono text-[12px] font-semibold text-navy">
      {children}
    </kbd>
  );
}
