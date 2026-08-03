import { useId, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { AlertTriangle, Ban, ChevronRight, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { CATALOGUE_TODOS, type CatalogueTodo } from '@lcx/shared';
import { InspectorDrawer } from '@/components/ui/InspectorDrawer';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE GPS INSPECTOR — the whole object, and what it is not
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Seven GPS desks render rows and none of them opens one. An engagement, a conflict
 * check, a delivery gap and a perimeter position are each a dozen fields wide and the
 * surfaces show three of them, so the operator's only way to see the rest was to read
 * the engine. This is the drill-down, and it is ONE component over all of those shapes
 * rather than six near-copies — the pattern that produced `PAGE_COMMANDS`, a hand-listed
 * table nobody keeps current.
 *
 * ── WHY IT IS A LENS AND NOT A UNION OF ROW TYPES ─────────────────────────────
 *
 * A `switch` on `row.kind` inside here would put every GPS payload type in this file's
 * import graph and make it the place that has to change whenever a desk gains a field —
 * which is the shape of the failure this phase exists to correct. So the row shapes stay
 * with their desks: a desk supplies a `GpsLens<T>`, a pure function from ITS row to the
 * view below, and this file knows nothing about engagements. `T` is never inspected here.
 *
 * ── THE HONESTY CEILING IS A TYPE, NOT A CONVENTION ───────────────────────────
 *
 * GPS is full of compiled placeholders BY DESIGN — prices, effort triples, vendor costs,
 * the four perimeter exclusion lines — and the founder sold ~$250k by hand, so a screen
 * that shows a placeholder price with the same weight as a measured one is worse than the
 * Google Doc it replaces. `GpsFieldStanding` is the same device
 * `marketingGrammar.ts` uses for `MarketingNounReach`: every field must declare how its
 * value was arrived at, the variants are ordered by how much is really known, and the
 * REASON travels on the row rather than in a comment.
 *
 * ── THE RATCHET, WHICH IS THE POINT ──────────────────────────────────────────
 *
 * A `placeholder` or `unreviewed` standing does NOT carry its own explanation. It names a
 * row in `CATALOGUE_TODOS` — the shared ledger of what the catalogue is still missing —
 * and the sentence an operator reads is that ledger's `consequence` and `owner`, rendered
 * verbatim. Two consequences, both wanted:
 *
 *  1. There is one wording for "the price bands are placeholders", not one per surface.
 *  2. When the founder supplies real bands and the item LEAVES `CATALOGUE_TODOS`, this
 *     inspector goes loud (`UNKNOWN_TODO_NOTICE`) instead of quietly continuing to call a
 *     decided price a placeholder. A stale placeholder warning is not a safe failure: it
 *     teaches the operator to ignore the warnings that are still true.
 *
 * Matched on the ledger's `what` text because `CatalogueTodo` has no id, and adding one
 * means editing `packages/shared/src/gps/catalogue.ts`, which this lane does not own.
 *
 * ── WHAT THIS COMPONENT DELIBERATELY DOES NOT DO ─────────────────────────────
 *
 * It computes NO domain figure. No share, no grade, no verdict, no price. The only thing
 * derived here is `gpsProvenanceGrade`, and it is derived strictly from the standings of
 * the fields shown on the same screen — so the grade is reconstructable by eye from the
 * rows under it, and cannot become a second opinion about a payload it did not read.
 *
 * It also holds no state and installs no key listener. Escape, Tab and focus return come
 * from `InspectorDrawer` → `useDismissible` → `lib/dismiss.ts`, which is the app's single
 * owner of those keys; `GpsSplit` owns the split toggle. Two files, one key each.
 */

/* ── the honesty ceiling ──────────────────────────────────────────────────────── */

/**
 * How this field's value was arrived at. Ordered by how much is really known.
 *
 *  measured     It was read off a row that exists. `source` names the table.column or the
 *               engine field it arrived on, so the operator can go and look.
 *  derived      An engine computed it from measured inputs. `from` names the function.
 *               Kept separate from `measured` because a derived figure inherits every
 *               assumption of its inputs, and "where did this come from" has a different
 *               answer for the two.
 *  placeholder  A CONSTANT COMPILED INTO THE APP, standing in for a decision nobody has
 *               made. `awaitingTodo` must name a `CATALOGUE_TODOS.what`; see the ratchet.
 *  unreviewed   The text or number exists and is used, and the authority who must pass on
 *               it has not. Distinct from `placeholder`: the perimeter exclusion lines are
 *               not stand-ins for missing values, they are real sentences that no lawyer
 *               has read. Also names a `CATALOGUE_TODOS.what`.
 *  absent       There is NO column and no constant — the field is on this object
 *               conceptually and has no value to show. `whyNoColumn` says so. It exists
 *               because the alternative is omitting the row, and a field that is silently
 *               missing reads as a field that does not matter.
 */
export type GpsFieldStanding =
  | { readonly kind: 'measured'; readonly source: string }
  | { readonly kind: 'derived'; readonly from: string }
  | { readonly kind: 'placeholder'; readonly awaitingTodo: string }
  | { readonly kind: 'unreviewed'; readonly awaitingTodo: string }
  | { readonly kind: 'absent'; readonly whyNoColumn: string };

/** One field of the object. `value` is a node so a desk can render its own money/date. */
export interface GpsField {
  readonly label: string;
  /**
   * What to show. `null` renders an explicit em-dash rather than an empty cell: a blank
   * next to "measured" is indistinguishable from a render bug.
   */
  readonly value: ReactNode;
  readonly standing: GpsFieldStanding;
}

/**
 * A refusal standing against this object.
 *
 * `sentence` is what the operator can act on; `rule` is what refused. Both are required,
 * because a refusal with no cited rule cannot be argued with and a rule with no sentence
 * is a code. GPS already has the raw codes (`RefusalCode` in `gps/partners.ts:610`) and
 * they belong in `rule`, next to the gate's own `detail` in `sentence` — never the other
 * way round. `BARE_CODE_NOTICE` is what happens when a caller gets that backwards.
 */
export interface GpsRefusal {
  readonly id: string;
  readonly sentence: string;
  readonly rule: string;
}

/** Something this object is linked to. `onOpen` absent = named but not reachable yet. */
export interface GpsLink {
  readonly label: string;
  readonly detail?: string;
  readonly onOpen?: () => void;
}

/** The whole object, as the inspector shows it. What a `GpsLens` returns. */
export interface GpsObjectView {
  /** The noun, as the desk says it: "engagement", "conflict check", "delivery gap". */
  readonly kind: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly fields: readonly GpsField[];
  readonly refusals: readonly GpsRefusal[];
  readonly links: readonly GpsLink[];
}

/** A desk's row, read as an object. Pure — it is called during render. */
export type GpsLens<T> = (row: T) => GpsObjectView;

/* ── the derived grade ────────────────────────────────────────────────────────── */

export type GpsProvenanceGrade = 'measured' | 'compiled' | 'unbacked';

export const GPS_GRADE_LABEL: Record<GpsProvenanceGrade, string> = {
  measured: 'MEASURED',
  compiled: 'PART COMPILED',
  unbacked: 'PART UNBACKED',
};

/**
 * The object's grade, derived from the standings of its own fields and nothing else.
 *
 * Worst standing wins, and the order is not a scoring choice: `absent` outranks
 * `placeholder` because a missing column cannot be fixed by a decision, only by a
 * migration. Refusals deliberately do NOT feed this — a refusal is a statement about
 * whether we may act, not about whether the numbers are real, and folding the two
 * together would let a clean refusal-free object look measured while its price is a
 * constant.
 */
export function gpsProvenanceGrade(fields: readonly GpsField[]): GpsProvenanceGrade {
  if (fields.some((f) => f.standing.kind === 'absent')) return 'unbacked';
  if (fields.some((f) => f.standing.kind === 'placeholder' || f.standing.kind === 'unreviewed')) {
    return 'compiled';
  }
  return 'measured';
}

/** The ledger row a placeholder standing names, or undefined if it has left the ledger. */
export function catalogueTodoFor(what: string): CatalogueTodo | undefined {
  return CATALOGUE_TODOS.find((t) => t.what === what);
}

/** Rendered when a standing names a ledger row that is not there. See the ratchet. */
export const UNKNOWN_TODO_NOTICE =
  'This field claims to be a placeholder awaiting a decision that is no longer in the catalogue ledger. '
  + 'Either the decision was made and this label is now false, or the wording moved. Do not rely on the '
  + 'warning or on its absence: check CATALOGUE_TODOS in packages/shared/src/gps/catalogue.ts.';

/** Rendered when a refusal arrives as a code rather than a sentence. */
export const BARE_CODE_NOTICE =
  'This refusal reached the inspector as a code rather than a sentence, so nobody can act on it. '
  + 'The code is shown so it can be traced, and the desk that supplied it owes the sentence.';

/** Does this refusal text look like an identifier somebody forgot to write out? */
export function looksLikeBareCode(sentence: string): boolean {
  // No whitespace and made only of identifier characters — `bench_at_capacity`,
  // `NO_USABLE_RATE_CARD`, `GPS-412`. A real sentence has a space in it.
  return /^[A-Za-z0-9_.:-]+$/.test(sentence.trim());
}

/* ── the body ─────────────────────────────────────────────────────────────────── */

/** Marks either container's root, so `GpsSplit` can ask where focus is. */
export const GPS_INSPECTOR_ATTR = 'data-gps-inspector';

/** Marks the split toggle, so `GpsSplit` can hand focus to it across a mode change. */
export const GPS_SPLIT_TOGGLE_ATTR = 'data-gps-split-toggle';

export interface GpsInspectorBodyProps<T> {
  subject: T;
  lens: GpsLens<T>;
  /**
   * The split toggle, supplied by `GpsSplit` and absent when there is no split to offer
   * — a narrow viewport, or the universal evidence pane already holding that half of the
   * screen. Absent rather than disabled: a control that does nothing teaches the operator
   * that the key is broken, which is the argument `lib/split.ts` makes for its own
   * breakpoint.
   */
  splitToggle?: { readonly to: 'split' | 'drawer'; readonly key: string; readonly onToggle: () => void };
}

/**
 * The object, without a container.
 *
 * Extracted for the reason `InspectorBody` was: the drawer and the docked pane must show
 * the SAME thing, and two renderers is how they stop doing that.
 */
export function GpsInspectorBody<T>({ subject, lens, splitToggle }: GpsInspectorBodyProps<T>) {
  const view = lens(subject);
  const grade = gpsProvenanceGrade(view.fields);
  const gradeId = useId();

  return (
    <div {...{ [GPS_INSPECTOR_ATTR]: '' }} className="space-y-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wide text-grey">{view.kind}</p>
          <p className="truncate text-sm font-bold text-navy" title={view.title}>{view.title}</p>
          {view.subtitle && <p className="mt-0.5 text-micro leading-snug text-grey">{view.subtitle}</p>}
        </div>
        {splitToggle && (
          <button
            {...{ [GPS_SPLIT_TOGGLE_ATTR]: '' }}
            type="button"
            onClick={splitToggle.onToggle}
            aria-label={
              splitToggle.to === 'split'
                ? 'Show this beside the list instead of over it'
                : 'Show this over the list instead of beside it'
            }
            title={
              (splitToggle.to === 'split'
                ? 'Beside the list — the desk keys keep working while you read it'
                : 'Back over the list')
              + ` (${splitToggle.key})`
            }
            className="flex shrink-0 items-center gap-1 rounded p-1 font-mono text-[10px] text-grey hover:bg-ice-soft hover:text-navy dark:hover:bg-ice-soft/20"
          >
            {splitToggle.to === 'split' ? <PanelRightOpen size={14} /> : <PanelRightClose size={14} />}
            <span aria-hidden="true">{splitToggle.key}</span>
          </button>
        )}
      </div>

      {/* The grade, and immediately what set it — D1: every figure opens onto its rows. */}
      <div className="border-l-2 border-line bg-ice-soft px-2 py-1.5 dark:bg-ice-soft/10">
        <p id={gradeId} className="font-mono text-[10px] font-bold uppercase tracking-wide text-navy">
          Provenance · {GPS_GRADE_LABEL[grade]}
        </p>
        <p className="mt-1 text-micro leading-snug text-grey">{gradeReason(view.fields, grade)}</p>
      </div>

      <Section title={`Refusals standing · ${view.refusals.length}`}>
        {view.refusals.length === 0 ? (
          <p className="text-micro leading-snug text-grey">
            Nothing is refusing this object right now. That is a statement about the checks that have
            run, not a clearance.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {view.refusals.map((r) => <RefusalRow key={r.id} refusal={r} />)}
          </ul>
        )}
      </Section>

      <Section title={`Fields · ${view.fields.length}`}>
        <dl className="space-y-1.5">
          {view.fields.map((f) => <FieldRow key={f.label} field={f} />)}
        </dl>
      </Section>

      <Section title={`Linked to · ${view.links.length}`}>
        {view.links.length === 0 ? (
          <p className="text-micro leading-snug text-grey">
            This object has no links this desk can follow.
          </p>
        ) : (
          <ul className="space-y-1">
            {view.links.map((l) => <LinkRow key={l.label} link={l} />)}
          </ul>
        )}
      </Section>
    </div>
  );
}

/** Why the object graded the way it did, in the operator's words and with a count. */
function gradeReason(fields: readonly GpsField[], grade: GpsProvenanceGrade): string {
  const total = fields.length;
  const count = (kinds: readonly GpsFieldStanding['kind'][]) =>
    fields.filter((f) => kinds.includes(f.standing.kind)).length;
  // Agreement is worked out once rather than at each site, because the sentence is read
  // by an operator deciding whether to send a number to a client and "1 of 3 field below
  // has" reads as generated — which is the whole complaint this phase answers.
  const subject = (n: number) => (total === 1 ? 'The one field below' : `${n} of the ${total} fields below`);
  const one = (n: number) => total === 1 || n === 1;

  if (grade === 'unbacked') {
    const n = count(['absent']);
    return `${subject(n)} ${one(n) ? 'has' : 'have'} no column behind ${one(n) ? 'it' : 'them'}, so there is `
      + 'nothing to show and nothing to trust. A decision will not fix that — a migration will.';
  }
  if (grade === 'compiled') {
    const n = count(['placeholder', 'unreviewed']);
    return `${subject(n)} ${one(n) ? 'is' : 'are'} a constant compiled into the app or awaiting review, `
      + 'not a measurement. Each one names who owes the decision. Nothing marked that way may be sent '
      + 'to a client as a fact.';
  }
  return `${total === 1 ? 'The one field below was' : `All ${total} fields below were`} read off a row that `
    + 'exists or computed from ones that were. Each names its source, so any figure here can be checked '
    + 'at its origin.';
}

/* ── the rows ─────────────────────────────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-2">
      <h3 className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wide text-grey">{title}</h3>
      {children}
    </section>
  );
}

function RefusalRow({ refusal }: { refusal: GpsRefusal }) {
  const bare = looksLikeBareCode(refusal.sentence);
  return (
    <li
      data-refusal={refusal.id}
      className="border-l-2 border-status-blocked/50 bg-status-blocked-bg px-2 py-1.5 text-status-blocked"
    >
      <p className="flex items-start gap-1.5 text-micro font-semibold leading-snug">
        <Ban size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>{bare ? BARE_CODE_NOTICE : refusal.sentence}</span>
      </p>
      <p className="mt-1 pl-4 font-mono text-[10px] leading-snug text-grey">
        <span className="font-bold uppercase">Rule · </span>
        {refusal.rule}
        {bare && <> · code as supplied: {refusal.sentence}</>}
      </p>
    </li>
  );
}

function FieldRow({ field }: { field: GpsField }) {
  const soft = field.standing.kind === 'placeholder' || field.standing.kind === 'unreviewed'
    || field.standing.kind === 'absent';
  return (
    <div data-field={field.label} className="grid grid-cols-[9rem_1fr] gap-2">
      <dt className="pt-px font-mono text-[10px] uppercase leading-snug tracking-wide text-grey">
        {field.label}
      </dt>
      <dd className="min-w-0">
        {/* D3: the uncertainty sits BESIDE the value, never inside it. A placeholder is
            printed at full weight and argued with underneath — a quietly greyed figure is
            a figure nobody notices is wrong. */}
        <div className="text-micro font-semibold leading-snug text-navy">
          {field.standing.kind === 'absent' ? <span className="text-grey">—</span> : (field.value ?? <span className="text-grey">—</span>)}
        </div>
        <StandingLine standing={field.standing} soft={soft} />
      </dd>
    </div>
  );
}

/** The provenance sentence for one field. Placeholder text comes from the shared ledger. */
function StandingLine({ standing, soft }: { standing: GpsFieldStanding; soft: boolean }) {
  const cls = clsx(
    'mt-0.5 font-mono text-[10px] leading-snug',
    soft ? 'text-status-conditional' : 'text-grey',
  );

  if (standing.kind === 'measured') {
    return <p className={cls}>Measured · {standing.source}</p>;
  }
  if (standing.kind === 'derived') {
    return <p className={cls}>Derived · {standing.from}</p>;
  }
  if (standing.kind === 'absent') {
    return (
      <p className={cls}>
        <AlertTriangle size={10} className="mr-1 inline-block align-[-1px]" aria-hidden="true" />
        No column · {standing.whyNoColumn}
      </p>
    );
  }

  const todo = catalogueTodoFor(standing.awaitingTodo);
  const head = standing.kind === 'placeholder'
    ? 'Placeholder, not measured'
    : 'Not reviewed by the authority that must';
  return (
    <p className={cls}>
      <AlertTriangle size={10} className="mr-1 inline-block align-[-1px]" aria-hidden="true" />
      {head} · {todo
        ? <>owed by {todo.owner}{todo.decision ? ` (${todo.decision})` : ''} · {todo.what} {todo.consequence}</>
        : <>{UNKNOWN_TODO_NOTICE} Claimed item: {standing.awaitingTodo}</>}
    </p>
  );
}

function LinkRow({ link }: { link: GpsLink }) {
  const body = (
    <>
      <span className="font-semibold text-navy">{link.label}</span>
      {link.detail && <span className="ml-1 text-grey">{link.detail}</span>}
    </>
  );
  if (!link.onOpen) {
    return (
      <li data-link={link.label} className="text-micro leading-snug">
        {body}
        <span className="ml-1 font-mono text-[10px] text-grey">· named here, not openable from this desk</span>
      </li>
    );
  }
  return (
    <li data-link={link.label}>
      <button
        type="button"
        onClick={link.onOpen}
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-micro leading-snug hover:bg-ice-soft dark:hover:bg-ice-soft/20"
      >
        <ChevronRight size={11} className="shrink-0 text-grey" aria-hidden="true" />
        <span className="min-w-0 flex-1">{body}</span>
      </button>
    </li>
  );
}

/* ── the drawer container ─────────────────────────────────────────────────────── */

export interface GpsInspectorProps<T> extends GpsInspectorBodyProps<T> {
  onClose: () => void;
}

/**
 * The object over the list.
 *
 * `InspectorDrawer` is the house chrome and is used unmodified, which is what buys Escape
 * from the one owner (`lib/dismiss.ts`), Tab confined to the panel, and focus returned to
 * the row that opened it — the last of which is the whole difference between a drawer that
 * feels solid and one that feels broken.
 *
 * `onDock` is deliberately NOT passed. That button's label and tooltip hard-code `⌘\`
 * (`InspectorDrawer.tsx:104`) because it moves the UNIVERSAL inspector, and this is not
 * that inspector — GPS rows are not in `useInspectorStore` and the `EvidencePane` cannot
 * render them. Passing it would put a button on this drawer that announces a key which
 * does something else. The split toggle lives in the body instead, labelled from
 * `GPS_SPLIT_KEY`, so the button and the key cannot disagree.
 */
export function GpsInspector<T>({ subject, lens, splitToggle, onClose }: GpsInspectorProps<T>) {
  const view = lens(subject);
  return (
    <InspectorDrawer isOpen onClose={onClose} title={`${view.kind} · ${view.title}`}>
      <GpsInspectorBody subject={subject} lens={lens} splitToggle={splitToggle} />
    </InspectorDrawer>
  );
}
