import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AiProse } from '../AiProse';

/**
 * The AI answer renderer.
 *
 * The defect it replaced: eight surfaces rendered model output as plain
 * `whitespace-pre-wrap` text, so the operator read the markdown — `**bold**`,
 * backticks, and `[[s_payagent]]` citation markers — as literal characters. Reported
 * from the shipped Mac app with a screenshot of the distribution strategist answer.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../../../../..');

describe('AiProse renders markdown instead of showing it', () => {
  it('renders **bold** as an element, not as asterisks', () => {
    render(<AiProse text="**Instant viral** needs a referral loop" />);
    expect(screen.getByText('Instant viral').tagName).toBe('STRONG');
    // The literal markers must be gone — this is the actual complaint.
    expect(document.body.textContent).not.toContain('**');
  });

  it('renders `inline code` as code, not as backticks', () => {
    render(<AiProse text="call `navigator.modelContext.registerTool()` when ready" />);
    expect(screen.getByText('navigator.modelContext.registerTool()').tagName).toBe('CODE');
    expect(document.body.textContent).not.toContain('`');
  });

  it('turns a numbered list into a real <ol>, one <li> per item', () => {
    render(<AiProse text={'1. Ship escrow\n2. Deploy the agent\n3. Publish docs'} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0].closest('ol')).not.toBeNull();
    // The numbers come from the list, so they must not also be in the text.
    expect(items[0].textContent).toBe('Ship escrow');
  });

  it('turns bullets into a <ul>', () => {
    const { container } = render(<AiProse text={'- one\n- two'} />);
    expect(container.querySelector('ul')).not.toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('collapses [[s_id]] citation markers into a superscript marker', () => {
    const { container } = render(<AiProse text="one link works on every rail [[s_payagent]]" />);
    const sup = container.querySelector('sup');
    expect(sup?.textContent).toBe('payagent');
    // The raw form was appearing mid-sentence and reading as debug output.
    expect(document.body.textContent).not.toContain('[[');
  });

  it('keeps paragraphs separate rather than joining them into a wall', () => {
    const { container } = render(<AiProse text={'First point.\n\nSecond point.'} />);
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });

  it('says so when the model returns nothing, rather than rendering a blank panel', () => {
    render(<AiProse text={'   \n  \n'} />);
    expect(screen.getByText(/returned an empty answer/i)).toBeInTheDocument();
  });

  it('leaves unrecognised syntax as readable text rather than dropping it', () => {
    // Falling through is the design: worse formatting beats lost content.
    render(<AiProse text="a | table | row" />);
    expect(screen.getByText('a | table | row')).toBeInTheDocument();
  });
});

describe('model output is data, never markup — the security property', () => {
  it('renders HTML in an answer as text, not as elements', () => {
    // This is UNTRUSTED: a model summarising third-party pages could emit anything.
    const hostile = '<img src=x onerror="window.__pwned=1"> and <script>window.__pwned=2</script>';
    const { container } = render(<AiProse text={hostile} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    // It is visible as characters, which is what "rendered as text" means.
    expect(document.body.textContent).toContain('<script>');
  });

  it('does not turn a bold-wrapped tag into an element either', () => {
    const { container } = render(<AiProse text="**<b>not bold html</b>**" />);
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('<b>not bold html</b>').tagName).toBe('STRONG');
  });

  /**
   * THE RATCHET. Every assertion above tests this component; none of them would
   * notice a NEW surface rendering model output through `dangerouslySetInnerHTML`,
   * which is the way this class of bug actually arrives.
   */
  it('no component anywhere uses dangerouslySetInnerHTML', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== '__tests__') walk(full);
        } else if (/\.tsx?$/.test(e.name)) {
          // Comments stripped first: this component's own docstring explains that
          // it never uses the API, and a ratchet that trips on its own documentation
          // is one people delete instead of obey.
          const code = readFileSync(full, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');
          if (code.includes('dangerouslySetInnerHTML')) {
            hits.push(full.slice(REPO.length + 1));
          }
        }
      }
    };
    walk(resolve(REPO, 'apps/web/src'));
    expect(
      hits,
      `model and API text must be rendered as React nodes, never as HTML: ${hits.join(', ')}`,
    ).toEqual([]);
  });

  /**
   * THE BLIND SPOT THAT HID FIVE MORE SURFACES.
   *
   * The sweep below looks for `whitespace-pre-wrap` and an answer-shaped value
   * ON THE SAME LINE. Five surfaces evaded it for both possible reasons at once:
   * `components/ai/common.tsx` factored the class into a shared `resultBoxClass`
   * constant, so the pre-wrap and the interpolation were in different files; and
   * the interpolations read `{result.response}` / `{result.draft}` / `{result.body}`,
   * which its `{res\.` alternative does not match.
   *
   * Objection rebuttals, personalized drafts, reply subjects, reply bodies and the
   * WBR executive summary were therefore still showing raw `**bold**` — the WBR
   * one to whoever the board report was printed for.
   *
   * A name-based sweep could not see them, so this check is not name-based: the
   * pre-wrapping box class is GONE, and its absence is what is asserted. There is
   * no styling hook left that renders model text pre-wrapped.
   */
  it('the pre-wrapping answer box no longer exists anywhere', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== '__tests__') walk(full);
        } else if (/\.tsx?$/.test(e.name)) {
          const code = readFileSync(full, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');
          if (code.includes('resultBoxClass')) hits.push(full.slice(REPO.length + 1));
        }
      }
    };
    walk(resolve(REPO, 'apps/web/src'));
    expect(
      hits,
      `resultBoxClass pre-wrapped model markdown and hid it from the sweep below. ` +
        `Use aiBoxClass with an <AiProse> inside: ${hits.join(', ')}`,
    ).toEqual([]);
  });

  it('every surface that renders a model answer does it through AiProse', () => {
    // Field names the API actually returns for generated prose. Rendering one
    // directly into JSX is the defect; passing it to AiProse is the fix, so a
    // bare `{x.body}` outside an AiProse prop is what this looks for.
    const FIELDS = ['response', 'draft', 'body', 'narrative', 'packet', 'memo', 'answer'];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== '__tests__') walk(full);
        } else if (/\.tsx$/.test(e.name)) {
          const src = readFileSync(full, 'utf8');
          if (!/usedLlm|AiProse|aiBoxClass/.test(src)) continue; // not an AI surface
          for (const line of src.split('\n')) {
            if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
            for (const f of FIELDS) {
              // `<p ...>{result.body}</p>` — a model field as an element's only
              // child. `text={result.body}` (an AiProse prop) is fine.
              const bare = new RegExp(`<(p|span|div)[^>]*>\\s*\\{\\s*\\w+\\.${f}\\s*\\}`);
              if (bare.test(line)) offenders.push(`${full.slice(REPO.length + 1)}: ${line.trim().slice(0, 64)}`);
            }
          }
        }
      }
    };
    walk(resolve(REPO, 'apps/web/src'));
    expect(
      offenders,
      `render model prose with <AiProse text={…} /> so the operator reads prose, not markdown: ${offenders.join(' | ')}`,
    ).toEqual([]);
  });

  it('no AI surface still renders an answer as raw pre-wrapped text', () => {
    // The eight sites that were swapped. A ninth appearing is the regression.
    const suspicious: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== '__tests__') walk(full);
        } else if (/\.tsx$/.test(e.name)) {
          const text = readFileSync(full, 'utf8');
          for (const line of text.split('\n')) {
            // A pre-wrapped block interpolating something answer-shaped.
            if (
              /whitespace-pre-(wrap|line)/.test(line) &&
              /\{(res\.|ans\.|answer|draft|memo|packet|play\.draft)/.test(line)
            ) {
              suspicious.push(`${full.slice(REPO.length + 1)}: ${line.trim().slice(0, 70)}`);
            }
          }
        }
      }
    };
    walk(resolve(REPO, 'apps/web/src'));
    expect(
      suspicious,
      `use <AiProse text={…} /> so the operator reads prose instead of markdown: ${suspicious.join(' | ')}`,
    ).toEqual([]);
  });
});
