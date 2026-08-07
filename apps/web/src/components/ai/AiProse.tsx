import { Fragment, type ReactNode } from 'react';

/**
 * Rendering an AI answer so it reads like prose instead of like a payload.
 *
 * THE DEFECT THIS REPLACES. Eight surfaces rendered model output with
 * `whitespace-pre-wrap` and nothing else, so the operator saw the markdown itself:
 *
 *     **Instant viral = agent-native referral loop...**
 *     1. **Agent-viral referral (G2, G3):** Ship **AgentHire escrow**…
 *     one link works on every rail [[s_payagent]][[s_x402]][[s_acp]]
 *
 * Asterisks, backticks and `[[s_*]]` citation markers, all as literal characters. The
 * answers were good and looked like debug output.
 *
 * WHY NOT A MARKDOWN LIBRARY. `react-markdown` + `remark` is ~40KB gzipped and the
 * initial bundle has ~3KB of headroom against the 850KB budget
 * (`scripts/check-bundle.mjs`). This renders the subset the models actually emit —
 * bold, inline code, ordered and bulleted lists, headings, blank-line paragraphs —
 * in well under 1KB. Anything it does not recognise falls through as plain text,
 * which is strictly better than the old behaviour and never worse.
 *
 * SECURITY, and it is the reason this file looks the way it does. This is UNTRUSTED
 * TEXT: it comes from a model, over the network, and in this product the model is
 * summarising third-party pages. So there is **no `dangerouslySetInnerHTML`
 * anywhere in here** — the parser emits React elements, never an HTML string, so
 * markup in the answer cannot become markup on the page. A `<script>` or an
 * `<img onerror=…>` in a model response renders as the characters it is.
 * `aiProse.test.tsx` asserts that property directly.
 *
 * CITATIONS. The models emit `[[s_payagent]]` inline while the surface already
 * renders the same sources as chips underneath. Inline, they became noise mid
 * sentence. They now collapse into a small superscript marker that keeps the
 * attribution visible without breaking the line.
 *
 * AND A MARKER IS ONLY A SOURCE IF SOMETHING BACKS IT. `[[…]]` used to become a
 * `<sup title="source: …">` unconditionally — ANY marker, including an id the model
 * was never given. The surrounding panel filtered its chips to ids that exist, but the
 * prose did not, so a hallucinated id rendered to the operator as a cited source. That
 * needs no attacker; one wrong hex digit does it.
 *
 * `validIds` closes it: pass the ids the surface can actually resolve and an
 * unresolvable marker renders as a visible "unverified citation" instead of as
 * attribution. It is OPTIONAL because the eight other surfaces cite `s_*` ids they
 * resolve elsewhere — omitting it keeps their behaviour exactly as it was, and this
 * component is the second of two guards, not the only one (the API rewrites unbacked
 * markers out of `[[…]]` syntax before they ever arrive).
 */

/** `**bold**`, `` `code` ``, `[[s_id]]` → React nodes. Never HTML. */
function renderInline(
  text: string,
  keyPrefix: string,
  validIds: ReadonlySet<string> | null,
): ReactNode[] {
  const out: ReactNode[] = [];
  // One pass, one regex, three alternatives. Ordered so that ** wins over *.
  const pattern = /(\*\*[^*]+\*\*)|(`[^`]+`)|(\[\[[^\]]+\]\])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    const key = `${keyPrefix}-i${i++}`;

    if (token.startsWith('**')) {
      out.push(
        <strong key={key} className="font-semibold text-navy">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('`')) {
      out.push(
        <code
          key={key}
          className="rounded border border-line bg-page px-1 py-px font-mono text-[0.92em]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      // `[[s_payagent]]` → a quiet superscript. The full source list is rendered
      // as chips by the surrounding panel, so this only has to mark the claim.
      const raw = token.slice(2, -2).trim();
      const id = raw.replace(/^s_/, '');
      const backed =
        validIds === null || validIds.has(raw.toLowerCase()) || validIds.has(id.toLowerCase());
      out.push(
        backed ? (
          <sup
            key={key}
            className="ml-0.5 font-mono text-[9px] text-cyan-700 dark:text-cyan-400"
            title={`source: ${id}`}
          >
            {id}
          </sup>
        ) : (
          // NOT a <sup>, and the word "source" appears nowhere near it. An operator
          // scanning for attribution must not be able to read this as one.
          <span
            key={key}
            className="ml-0.5 rounded border border-amber-500/40 bg-amber-500/10 px-1 font-mono text-[9px] text-amber-700 dark:text-amber-300"
            title="unverified: the model cited an id that resolves to no source here"
          >
            unverified citation: {id}
          </span>
        ),
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

interface Block {
  kind: 'p' | 'h' | 'ol' | 'ul';
  lines: string[];
}

/**
 * Group lines into blocks. Deliberately line-based rather than a real parser: model
 * output is flat prose with lists, not nested documents, and a line-based pass
 * cannot get stuck or recurse.
 */
function toBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of src.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    const ordered = /^\s*\d+\.\s+/.test(line);
    const bulleted = /^\s*[-*•]\s+/.test(line);
    const heading = /^#{1,4}\s+/.test(line);
    const kind: Block['kind'] = heading ? 'h' : ordered ? 'ol' : bulleted ? 'ul' : 'p';
    const text = heading
      ? line.replace(/^#{1,4}\s+/, '')
      : ordered
        ? line.replace(/^\s*\d+\.\s+/, '')
        : bulleted
          ? line.replace(/^\s*[-*•]\s+/, '')
          : line;

    const prev = blocks[blocks.length - 1];
    // Consecutive list items of the same kind join one list; paragraphs stay
    // separate so the answer keeps the model's own pacing.
    if (prev && prev.kind === kind && (kind === 'ol' || kind === 'ul')) {
      prev.lines.push(text);
    } else {
      blocks.push({ kind, lines: [text] });
    }
  }
  return blocks;
}

/**
 * The one component every AI surface uses to show an answer.
 *
 * `text` is whatever the model returned. There is no "trusted" variant on purpose:
 * a second, HTML-rendering path is exactly how the safe one gets bypassed later.
 */
export function AiProse({
  text,
  className,
  validIds,
}: {
  text: string;
  className?: string;
  /**
   * The ids this surface can resolve to a real source. Omit and every marker renders
   * as before (the eight surfaces that resolve `s_*` ids elsewhere). Supply it and a
   * marker outside the set renders as visibly unbacked rather than as attribution.
   */
  validIds?: readonly string[];
}) {
  const blocks = toBlocks(text);
  const valid = validIds ? new Set(validIds.map((v) => v.trim().toLowerCase())) : null;

  // An empty or whitespace-only answer is a real state (a refusal, a timeout that
  // returned 200), and rendering nothing would look like a broken panel.
  if (blocks.length === 0) {
    return (
      <p className={`text-label italic text-grey ${className ?? ''}`}>
        The model returned an empty answer.
      </p>
    );
  }

  return (
    <div className={`space-y-2.5 text-label leading-relaxed text-navy ${className ?? ''}`}>
      {blocks.map((b, bi) => {
        const key = `b${bi}`;
        if (b.kind === 'h') {
          return (
            <h4 key={key} className="pt-1 text-label font-semibold text-navy">
              {renderInline(b.lines[0], key, valid)}
            </h4>
          );
        }
        if (b.kind === 'ol' || b.kind === 'ul') {
          const List = b.kind === 'ol' ? 'ol' : 'ul';
          return (
            <List
              key={key}
              className={`ml-4 space-y-1.5 ${b.kind === 'ol' ? 'list-decimal' : 'list-disc'}`}
            >
              {b.lines.map((l, li) => (
                <li key={`${key}-${li}`} className="pl-0.5">
                  {renderInline(l, `${key}-${li}`, valid)}
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={key}>
            {b.lines.map((l, li) => (
              <Fragment key={`${key}-${li}`}>{renderInline(l, `${key}-${li}`, valid)}</Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
