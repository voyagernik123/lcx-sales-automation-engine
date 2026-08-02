import { Radio } from 'lucide-react';
/* Through `vocabulary.ts`, which is this compartment's one import boundary — the contract
 * types are re-exported there with the barrel dependency recorded once instead of in
 * every panel. */
import type {
  ClaimExpiryBucket, ClaimExpiryLedger, WatchDigest, WatchSourceObservation,
} from './vocabulary';
import { CardSkeleton } from '@/components/shared';
import { fetchClaimExpiry, fetchMarketingWatch } from '@/lib/api/marketing';
import {
  Absent, NotPermitted, Nothing, ObservationFrameNote, Refused, Th, Td, WireRefusals, apiReadRefusal,
} from './DeskAtoms';
import { useDeskRead } from './useDeskRead';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE WATCH — the outside view, and every place it went blind
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `apps/api/src/marketing/watch.ts` had no importer anywhere in `apps/api/src` and no route
 * in front of it, so the whole of M6 was a module with tests. This panel is its first
 * caller.
 *
 * TYPED END TO END. `WatchDigest` and `ClaimExpiryLedger` are declared once, in
 * `packages/shared/src/marketing/contracts/record.ts`, and imported by the route handler and
 * by this file from the same symbol — so there is no `rec()` walking, no narrowing, and a
 * server-side rename breaks this file at compile time instead of breaking a screen. The
 * first draft of this panel was written against a GUESSED payload while the contract was
 * still being authored, and every field in that guess was wrong: `feeds[]`, `mentionsUs`,
 * `standing`. That draft would have compiled and rendered an empty watch forever.
 *
 * ── THE ONE DISTINCTION EVERY ROW HERE KEEPS ──────────────────────────────────
 * `WatchSourceObservation.state` has exactly three members and no fourth:
 *
 *   `data`               the source answered and had entries.
 *   `no_data_confirmed`  the source answered and its list is empty. A FACT ABOUT FMA.
 *   `unknown`            we could not look. A fact about our plumbing.
 *
 * `matchesObserved: null` is the same distinction in a number: `0` means FMA's published
 * list contains nothing matching our terms, `null` means nobody got to look. This panel
 * renders those three states in three visually different ways, and `digest.sourcesUnreadable`
 * is printed FIRST — before any count — because it is the one-line answer to "is this panel
 * telling me the world is quiet, or that it went blind?".
 *
 * ── AND THE TERM COVERAGE, WHICH IS THE SUBTLER TRAP ──────────────────────────
 * "No partner appears in an FMA warning" reads as reassurance. The truth on this
 * environment is that the partner and listed-asset registers do not exist, so no partner
 * was ever SEARCHED for. `terms` is rendered as prominently as the matches, because a scan
 * with an empty term list produces a clean result by construction.
 */

/* ════════ ONE SOURCE'S STANDING ════════ */

const STATE_WORD: Record<WatchSourceObservation['state'], string> = {
  data: 'read · had entries',
  no_data_confirmed: 'read · genuinely empty',
  unknown: 'could not look',
};

const STATE_CLASS: Record<WatchSourceObservation['state'], string> = {
  data: 'text-navy',
  no_data_confirmed: 'text-grey',
  unknown: 'text-status-blocked font-bold',
};

/**
 * The transport truth about one fetch, printed as a line an operator can check by hand.
 *
 * `locator` is shown because a watch nobody can verify is a watch nobody believes: the URL
 * or table name is the thing a person opens when the panel says something surprising. It is
 * printed as text and not as a link — an unvetted third-party URL is not a control this
 * screen offers to activate.
 *
 * `countsAreLowerBound` is rendered as a sentence rather than as a symbol. Every count in
 * this compartment is a floor, and the one place that must never be abbreviated is the
 * place where a number and its ceiling are next to each other.
 */
function SourceLine({ o }: { o: WatchSourceObservation }) {
  return (
    <div className="space-y-1 border-l-2 border-line px-2 py-1.5">
      <p className="flex flex-wrap items-baseline gap-1.5 text-micro">
        <span className="font-semibold text-navy">{o.label}</span>
        <span className={`font-mono text-[10px] uppercase tracking-wider ${STATE_CLASS[o.state]}`}>
          {STATE_WORD[o.state]}
        </span>
        <span className="font-mono text-[10px] text-grey">
          grade {o.grade} · confidence {o.confidence}
        </span>
      </p>
      <p className="break-all font-mono text-[10px] leading-snug text-grey">{o.locator}</p>
      <p className="font-mono text-[10px] leading-snug text-grey">
        fetched {o.fetchedAt.slice(0, 16)}
        {o.httpStatus !== null && ` · http ${o.httpStatus}`}
        {/* ZERO BYTES ON A 200 IS THE FAILURE MODE THIS FIELD EXISTS FOR. Both X
            syndication endpoints answered 200 with an empty body during research, and a
            fetcher that checks `res.ok` records "nothing published". Printed, always. */}
        {o.bytes !== null && ` · ${o.bytes} bytes`}
        {o.windowFrom !== null && o.windowTo !== null && ` · window ${o.windowFrom.slice(0, 10)} to ${o.windowTo.slice(0, 10)}`}
      </p>
      {o.countsAreLowerBound && (
        <p className="text-[10px] leading-snug text-status-conditional">
          Every count from this source is a floor. The true figure is unknown and higher.
        </p>
      )}
      {o.couldNotSee.length > 0 && (
        <p className="text-[10px] leading-snug text-grey">
          <span className="font-semibold">Did not see.</span> {o.couldNotSee.join('; ')}.
        </p>
      )}
      <WireRefusals list={o.refusals} />
      <ObservationFrameNote frame={o.frame} />
    </div>
  );
}

/** A count that may be `null`, where `null` and `0` are opposite facts. */
function Observed({ n, zeroMeans, nullMeans }: { n: number | null; zeroMeans: string; nullMeans: string }) {
  if (n === null) {
    return <span className="text-micro font-semibold text-status-blocked">not observed — {nullMeans}</span>;
  }
  if (n === 0) return <span className="text-micro text-grey">0 — {zeroMeans}</span>;
  return <span className="font-mono text-micro font-bold tabular-nums text-navy">≥ {n}</span>;
}

/* ════════ THE CLAIM LEDGER ════════ */

const BUCKET_LABEL: Record<ClaimExpiryBucket, string> = {
  unreviewed: 'never reviewed',
  version_drift: 'text changed since review',
  past_due: 'review overdue',
  due_soon: 'review due soon',
  current: 'current',
};

const BUCKET_CLASS: Record<ClaimExpiryBucket, string> = {
  unreviewed: 'text-status-blocked font-bold',
  version_drift: 'text-status-blocked font-bold',
  past_due: 'text-status-blocked font-bold',
  due_soon: 'text-status-conditional font-semibold',
  current: 'text-grey',
};

function ClaimLedger({ l }: { l: ClaimExpiryLedger }) {
  return (
    <div className="space-y-1.5">
      {/* `usable: false` FIRST AND LOUDEST. The honest state on this environment today is
          that the claim library carries no review dates, so the ledger refuses rather than
          reporting "0 past due" — which is the sentence that lets a stale claim sit
          forever. The rows may still be worth reading; the COUNTS are not. */}
      {!l.usable && (
        <Absent title="The claim-expiry ledger cannot answer whether anything is stale.">
          The claim library holds no review dates, and the register a desk would keep them in does not exist here.
          So there are no counts — deliberately. Read the absence of a “past due” figure as “nobody knows”, never as
          “nothing is overdue”. Every dated claim on this desk is unverified.
        </Absent>
      )}

      <WireRefusals list={l.refusals} />

      {l.counts !== null && (
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-micro">
          {(Object.keys(BUCKET_LABEL) as ClaimExpiryBucket[]).map((b) => (
            <span key={b} className={BUCKET_CLASS[b]}>
              {BUCKET_LABEL[b]} · <span className="font-mono tabular-nums">{l.counts?.[b] ?? 0}</span>
            </span>
          ))}
          <span className="font-mono text-[10px] text-grey">due-soon horizon {l.dueSoonDays} days</span>
        </p>
      )}

      {l.rows.length === 0 ? (
        <Nothing>
          The ledger holds no claims. Nothing is registered as expiring, which is a statement about the ledger
          being empty and not a statement that the desk&apos;s claims are current.
        </Nothing>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <caption className="sr-only">Claim expiry ledger</caption>
            <thead>
              <tr>
                <Th>Claim</Th><Th>Standing</Th><Th align="right">Days to due</Th><Th>Copy that depends on it</Th>
              </tr>
            </thead>
            <tbody>
              {l.rows.map((r) => (
                <tr key={r.claimId} className="border-b border-line/70 align-top">
                  <Td>
                    <span className="text-navy">{r.claimText}</span>
                    <span className="mt-0.5 block font-mono text-[10px] text-grey">
                      {r.category} · {r.riskLevel} · v{r.claimVersion}
                      {r.requiresHumanReview && ' · needs a human review'}
                    </span>
                  </Td>
                  <Td>
                    <span className={`font-mono text-[10px] uppercase ${BUCKET_CLASS[r.bucket]}`}>
                      {BUCKET_LABEL[r.bucket]}
                    </span>
                    {r.versionDrift && (
                      <span className="mt-0.5 block text-[10px] leading-snug text-status-blocked">
                        The text has changed since it was reviewed, so the review covers a different sentence.
                      </span>
                    )}
                    <WireRefusals list={r.refusals} />
                  </Td>
                  <Td align="right">
                    {/* `null` IS NOT `0`. No review record to count from is not "due today". */}
                    <span className={`font-mono tabular-nums ${r.pastDue ? 'font-bold text-status-blocked' : 'text-grey'}`}>
                      {r.daysUntilDue === null ? 'no review to count from' : r.daysUntilDue}
                    </span>
                  </Td>
                  <Td>
                    {r.dependentCopy === null ? (
                      <span className="text-status-conditional">
                        cannot be determined — not “nothing depends on it”
                      </span>
                    ) : r.dependentCopy.length === 0 ? (
                      <span className="text-grey">no dependent copy found</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {r.dependentCopy.map((d) => (
                          <li key={d.artefactId} className="font-mono text-[10px] leading-snug text-grey">
                            {d.surface} · {d.artefactId} ·{' '}
                            {d.basis === 'declared' ? 'the artefact says so' : 'matched on its text only'}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] leading-snug text-grey">{l.dependencyMethodNote}</p>
      <ObservationFrameNote frame={l.frame} />
    </div>
  );
}

/* ════════ THE PANEL ════════ */

export function WatchPanel() {
  const watch = useDeskRead<WatchDigest>('marketing:watch', () => fetchMarketingWatch());
  const expiry = useDeskRead<ClaimExpiryLedger>('marketing:claim-expiry', () => fetchClaimExpiry());

  return (
    <div className="space-y-4">
      <section className="space-y-1.5">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-navy">
          <Radio size={12} aria-hidden="true" /> Regulator and narrative watch
        </h3>
        <p className="text-[10px] leading-snug text-grey">
          Keyless sources only. This is the outside view: what a supervisor published, and whether anyone named us.
          It is not a sentiment measure, and there is no figure here to be pleased about.
        </p>

        {watch.result.state === 'loading' && <CardSkeleton />}

        {watch.result.state === 'absent' && (
          <Absent title="The watch route is not on this environment, so nothing looked.">
            <span className="font-mono">GET /v1/marketing/watch</span> answered 404. Do not read this as “no
            regulator warnings” — no source was fetched at all. The engine that would fetch them
            (<span className="font-mono">apps/api/src/marketing/watch.ts</span>) has no route in front of it here.
          </Absent>
        )}

        {watch.result.state === 'forbidden' && (
          <NotPermitted what="Reading the watch" sentence={watch.result.sentence} />
        )}

        {watch.result.state === 'failed' && (
          <Refused r={apiReadRefusal(new Error(watch.result.sentence),
            'A failed watch read is not a quiet week. Nothing here distinguishes “no warnings published” from “we could not reach the publisher”, so neither may be concluded.')} />
        )}

        {watch.result.state === 'ok' && (() => {
          const d = watch.result.value;
          return (
            <div className="space-y-3">
              {/* BEFORE ANY COUNT. The one-line answer to whether this panel can be read. */}
              {d.sourcesUnreadable.length > 0 ? (
                <Absent title={`${d.sourcesUnreadable.length} of this watch's sources could not be read.`}>
                  Unreadable: <span className="font-mono">{d.sourcesUnreadable.join(', ')}</span>. Every count below
                  excludes them, so a quiet panel may be a blind one. Treat the affected axes as unknown.
                </Absent>
              ) : (
                <p className="text-[10px] leading-snug text-grey">
                  Every source answered this window, as of {d.asOf.slice(0, 16)}. A quiet panel is a quiet week —
                  within the blind spots each source names below.
                </p>
              )}

              <WireRefusals list={d.refusals} />

              {/* ── WHAT WAS SEARCHED FOR. Above the matches, deliberately. ── */}
              <div className="space-y-1 border-l-2 border-status-conditional/60 bg-status-conditional-bg px-2 py-1.5">
                <p className="text-micro font-semibold text-status-conditional">What this scan was looking for</p>
                <p className="text-[10px] leading-snug text-grey">
                  Own brand: {d.terms.ownBrand.length === 0 ? 'NONE — the scan had no term for LCX itself, so it could not have matched us' : d.terms.ownBrand.join(', ')}.
                </p>
                <p className="text-[10px] leading-snug text-grey">
                  Partners: {d.terms.partners.length === 0 ? 'NONE — no partner register exists here, so “no partner was warned about” means no partner was searched for' : d.terms.partners.join(', ')}.
                </p>
                <p className="text-[10px] leading-snug text-grey">
                  Listed assets: {d.terms.listedAssets.length === 0 ? 'NONE — no asset register exists here, so the same applies to every listed asset' : d.terms.listedAssets.join(', ')}.
                </p>
                <WireRefusals list={d.terms.refusals} />
              </div>

              {/* ── FMA WARNINGS ── */}
              <section className="space-y-1.5">
                <h4 className="text-micro font-bold uppercase tracking-wider text-grey">FMA investor warnings</h4>
                <SourceLine o={d.warnings.observation} />
                {!d.warnings.usable ? (
                  <Absent title="This scan could not mean anything.">
                    The warning scan ran with nothing usable to match on, so its result is not evidence in either
                    direction. A clean scan produced by an empty term list is the most convincing kind of wrong.
                  </Absent>
                ) : (
                  <>
                    <p className="flex flex-wrap items-baseline gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-grey">matches</span>
                      <Observed n={d.warnings.matchesObserved}
                        zeroMeans="FMA's published list contains no entry matching our terms"
                        nullMeans="the sitemap could not be read, so nobody looked" />
                      <span className="font-mono text-[10px] text-grey">
                        entries scanned {d.warnings.entriesScanned ?? 'not stated'} · locs read {d.warnings.locsRead ?? 'not stated'}
                      </span>
                    </p>
                    {d.warnings.locsUnparsed.length > 0 && (
                      <p className="text-[10px] leading-snug text-status-conditional">
                        {d.warnings.locsUnparsed.length} sitemap entries did not parse as warning entries and were
                        reported rather than dropped: <span className="break-all font-mono">{d.warnings.locsUnparsed.slice(0, 3).join(', ')}</span>.
                      </p>
                    )}
                    {d.warnings.matches.length === 0 ? (
                      <Nothing>
                        No entry in FMA&apos;s published warning list matched a term above. That is a statement about
                        FMA&apos;s list and about our term list, and about nothing else.
                      </Nothing>
                    ) : (
                      <ul className="space-y-1.5">
                        {d.warnings.matches.map((m) => (
                          <li key={m.entryId}
                            className={m.severity === 'act_now'
                              ? 'border-l-2 border-status-blocked/50 bg-status-blocked-bg px-2 py-1.5'
                              : 'border-l-2 border-line px-2 py-1.5'}
                          >
                            <p className={m.severity === 'act_now'
                              ? 'text-micro font-bold text-status-blocked'
                              : 'text-micro text-navy'}
                            >
                              {m.sentence}
                            </p>
                            <p className="mt-0.5 text-[10px] leading-snug text-grey">
                              matched <span className="font-mono">{m.matchedToken}</span> against{' '}
                              {m.matchedTermLabel} ({m.matchedTermKind.replace(/_/g, ' ')}) by {m.reason.replace(/_/g, ' ')}.
                              {m.severity === 'act_now'
                                ? ' The warning body has NOT been read by this system — read it before acting on it.'
                                : ' Assess; this is not an instruction.'}
                            </p>
                            <p className="mt-0.5 break-all font-mono text-[10px] text-grey">
                              {m.url}
                              {/* A CHANGE TIMESTAMP, NOT A PUBLICATION DATE. Labelled as what
                                  it is: sitemaps report when a URL last changed, and calling
                                  that "published" would date a warning wrongly. */}
                              {m.sitemapLastmod !== null && ` · sitemap last changed ${m.sitemapLastmod.slice(0, 10)}`}
                            </p>
                            <WireRefusals list={m.refusals} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </section>

              {/* ── REGULATOR FEEDS ── */}
              <section className="space-y-1.5">
                <h4 className="text-micro font-bold uppercase tracking-wider text-grey">Regulator feeds on the news spine</h4>
                <SourceLine o={d.regulator.observation} />
                <p className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-grey">items in window</span>
                  <Observed n={d.regulator.itemsObservedInWindow}
                    zeroMeans="the spine holds nothing from these feeds in this window"
                    nullMeans="the spine could not be read" />
                  <span className="text-[10px] text-grey">A floor: at most 20 items per feed per poll reach the spine.</span>
                </p>
                {d.regulator.items.length === 0 ? (
                  <Nothing>No item from a regulator feed in this window.</Nothing>
                ) : (
                  <ul className="space-y-0.5">
                    {d.regulator.items.slice(0, 8).map((it) => (
                      <li key={`${it.source}-${it.title}`} className="text-[10px] leading-snug">
                        <span className="text-navy">{it.title}</span>
                        <span className="ml-1 font-mono text-grey">
                          {/* `at`, and NOT relabelled as a publication time. The spine records
                              when the item reached it, which for a poll-driven feed is not when
                              the publisher published — and dating a regulator notice wrongly is
                              the kind of error that gets quoted back. */}
                          {it.source}{it.at !== null && ` · seen ${it.at.slice(0, 10)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {/* THE REGULATORS THIS WATCH CANNOT SEE, ON SCREEN RATHER THAN IN A COMMENT. */}
                {d.regulator.notWired.length > 0 && (
                  <div className="border-l-2 border-status-blocked/50 bg-status-blocked-bg px-2 py-1.5">
                    <p className="text-micro font-semibold text-status-blocked">
                      {d.regulator.notWired.length} authorities are not watched at all.
                    </p>
                    <ul className="mt-1 space-y-0.5 text-[10px] leading-snug text-grey">
                      {d.regulator.notWired.map((n) => (
                        <li key={n.authority}>
                          <span className="font-semibold">{n.authority}</span> — {n.why} Mitigation: {n.mitigation}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              {/* ── PRESS ── */}
              <section className="space-y-1.5">
                <h4 className="text-micro font-bold uppercase tracking-wider text-grey">Named in the press</h4>
                <SourceLine o={d.press.observation} />
                <WireRefusals list={d.press.refusals} />
                {!d.press.usable ? (
                  <Absent title="The press scan could not mean anything on this environment.">
                    It ran without a usable set of names, so neither a hit nor a miss is evidence.
                  </Absent>
                ) : d.press.rows.length === 0 ? (
                  <Nothing>No name was mentioned in a headline the spine holds for this window.</Nothing>
                ) : (
                  <table className="w-full border-collapse">
                    <caption className="sr-only">Press mentions by name</caption>
                    <thead><tr><Th>Name</Th><Th align="right">Headlines</Th><Th>Sources</Th></tr></thead>
                    <tbody>
                      {d.press.rows.map((r) => (
                        <tr key={r.name} className="border-b border-line/70 align-top">
                          <Td><span className="text-navy">{r.name}</span></Td>
                          <Td align="right">
                            {/* A LOWER BOUND ON HEADLINES. Never a share of voice: there is no
                                denominator without a credential, and there is no credential. */}
                            <span className="font-mono tabular-nums text-navy">≥ {r.mentionsObservedInWindow}</span>
                          </Td>
                          <Td>
                            <span className="font-mono text-[10px] text-grey">
                              {r.sourcesObserved.length === 0 ? 'none named' : r.sourcesObserved.join(', ')}
                            </span>
                            <WireRefusals list={r.refusals} />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </div>
          );
        })()}
      </section>

      <section className="space-y-1.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-navy">Claim freshness</h3>
        <p className="text-[10px] leading-snug text-grey">
          Every claim the desk may make, and when it stops being true. Liechtenstein&apos;s Art 143(3) transition
          ended on 1 July 2026 and TVTG registrations expired on 2 July — a line asserting one is stale now, not
          soon, and there is no grandfathering left to cover it.
        </p>
        {expiry.result.state === 'loading' && <CardSkeleton />}
        {expiry.result.state === 'absent' && (
          <Absent title="The claim-expiry route is not on this environment.">
            <span className="font-mono">GET /v1/marketing/watch/claim-expiry</span> answered 404, so no claim was
            checked for staleness. An operator drafting against this screen has NO expiry check at all — treat every
            dated claim as unverified rather than as current.
          </Absent>
        )}
        {expiry.result.state === 'forbidden' && (
          <NotPermitted what="Reading the claim ledger" sentence={expiry.result.sentence} />
        )}
        {expiry.result.state === 'failed' && (
          <Refused r={apiReadRefusal(new Error(expiry.result.sentence),
            'A failed expiry read is not a clean ledger. No claim on this desk has been checked for staleness by this screen.')} />
        )}
        {expiry.result.state === 'ok' && <ClaimLedger l={expiry.result.value} />}
      </section>
    </div>
  );
}
