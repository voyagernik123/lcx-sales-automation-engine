import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SendQueue } from '../SendQueue';
import * as bdApi from '@/lib/api/bd';

/**
 * THE RATCHET AGAINST AUTHORITY FLATTENING on the send queue.
 *
 * The defect it was written for, measured on this file before the change: five controls on
 * every queue card, two of them saturated filled buttons of identical weight —
 * `Open LinkedIn` in `bg-blue-700` and `Mark sent` in `bg-emerald-600` — both hand-rolled
 * outside the `Button` component, so neither inherited a tier from the design system. Two
 * equally loud controls means no primary action: the loudest thing on the bar was as
 * likely to be the one that opens a browser tab as the one that writes to the outreach log.
 * The same shape on `LeadDetail` once gave a cache warm the same weight as the approval
 * gating all outreach.
 *
 * IT ASSERTS A LADDER, NOT A COLOUR. Naming `bg-navy` would just restate the current
 * implementation and would go green on a second, equally loud button in a different hue —
 * which is the exact defect. So the test classifies each control's weight from its own
 * classes and asserts the ORDER: one solid at the top, the enabling steps below it, the
 * deferrals below those. Repaint the primary and it still passes; add a second loud
 * control anywhere on the card and it fails.
 *
 * What it cannot see, plainly: jsdom has no layout and no paint, so this says nothing
 * about contrast, real size, or whether the tier ladder is legible to a human. It is a
 * guard against a class of regression, not a substitute for looking at the screen.
 */

vi.mock('@/lib/api/bd', () => ({
  fetchSendQueue: vi.fn(),
  markQueueItemSent: vi.fn().mockResolvedValue(undefined),
  skipQueueItem: vi.fn().mockResolvedValue(undefined),
  snoozeQueueItem: vi.fn().mockResolvedValue(undefined),
}));

const item = (i: number) => ({
  id: `q-${i}`,
  projectId: `p-${i}`,
  projectName: `Probe Chain ${i}`,
  projectTicker: `PC${i}`,
  personId: `pe-${i}`,
  personName: `Probe Person ${i}`,
  personTitle: 'Head of Nothing',
  personLinkedin: 'https://linkedin.com/in/probe',
  personTelegram: null,
  channel: 'linkedin',
  action: 'message',
  band: 'high',
  body: 'A probe body.',
  touchIndex: 2,
  stepIndex: 1,
  priorityScore: 71,
});

const caps = {
  connectionsToday: 1, connectionsWeek: 4, messagesToday: 2,
  limits: { dailyConnections: 20, weeklyConnections: 100, dailyMessages: 50 },
};

/**
 * How loud is this control, judged only from its own classes?
 *
 * 3 — a saturated solid fill. The design system's `primary`, or any hand-rolled
 *     equivalent in any hue, which is the point: the check is hue-blind.
 * 2 — an outlined / soft-surface control (`secondary`).
 * 1 — a ghost: no fill, no border.
 *
 * Variant-prefixed classes (`hover:`, `dark:`, `focus-visible:`) are dropped first. A
 * `hover:bg-navy-deep` describes a hover state, not resting weight, and counting it would
 * have scored every secondary button as a primary.
 */
function weight(el: Element): number {
  const base = (el.getAttribute('class') ?? '').split(/\s+/).filter(c => c && !c.includes(':'));
  // `bg-ice-soft/50` is the same surface as `bg-ice-soft`; opacity is not weight.
  const fills = base.filter(c => /^bg-/.test(c)).map(c => c.split('/')[0]!);

  /*
   * FAIL CLOSED ON AN UNKNOWN FILL, and that direction is the whole point.
   *
   * This was first written as an ALLOWLIST of `bg-<hue>-<shade>` tokens, and adversarial
   * verification proved it failed OPEN: the exact original defect — `Open LinkedIn` as a
   * saturated filled button at the primary's own padding and text size — was restored using
   * `bg-[#059669]`, and all four tests stayed green, because an arbitrary value matches no
   * hue in a list of hues. `bg-pink-600` (hue not enumerated) and `bg-emerald-400` (shade
   * below the 500 floor) walked through the same gap. A guard against loudness that only
   * recognises the eleven colours someone thought of is a decoration.
   *
   * So the question is inverted: a background token that is NOT a known soft surface IS a
   * solid fill. New hues, arbitrary values, gradients and CSS variables all read as loud,
   * and the only way to sit in Tier 2 is to use the design system's own surface token.
   */
  // Deliberately NOT `bg-navy-deep`: that is the primary's own fill one step darker, so a
  // control resting on it is loud, not soft. It appears here only as `hover:`/`dark:`, which
  // the variant filter above has already dropped.
  const SOFT_SURFACE = /^bg-(?:transparent|none|inherit|current|ice|ice-soft|card)$/;
  if (fills.some(c => !SOFT_SURFACE.test(c))) return 3;
  if (base.some(c => /^border(-|$)/.test(c)) || fills.some(c => /^bg-ice(-soft)?$/.test(c))) return 2;
  return 1;
}

/** The controls belonging to one queue card (the card is the textarea's own panel). */
function cardControls(): Element[][] {
  return [...document.querySelectorAll('textarea')].map(t => {
    const card = t.closest('.shadow-card')!;
    return [...card.querySelectorAll('button, a[href]')];
  });
}

const named = (controls: Element[], text: string) =>
  controls.find(c => (c.textContent ?? '').trim().startsWith(text))!;

describe('SendQueue — one primary action per card, in tiers', () => {
  beforeEach(() => {
    vi.mocked(bdApi.fetchSendQueue).mockResolvedValue({ items: [item(0), item(1)], caps } as never);
  });

  const renderQueue = async () => {
    render(<MemoryRouter><SendQueue /></MemoryRouter>);
    await waitFor(() => expect(document.querySelectorAll('textarea').length).toBe(2));
  };

  it('exactly one control per card carries primary weight, and it is the write', async () => {
    await renderQueue();
    const cards = cardControls();
    expect(cards, 'the fixture rendered no cards, so this proves nothing').toHaveLength(2);

    for (const controls of cards) {
      expect(controls.length, 'this card has almost no controls — the fixture is wrong').toBeGreaterThan(4);
      const loud = controls.filter(c => weight(c) === 3);
      expect(
        loud.map(c => (c.textContent ?? '').trim()),
        'a queue card must have exactly ONE control at primary weight',
      ).toHaveLength(1);
      // And it is the one that writes. A card whose loudest control opens a browser tab
      // has a primary action, just not the right one.
      expect((loud[0].textContent ?? '').trim()).toContain('Mark sent');
    }
  });

  it('the ladder runs write > enabling steps > deferrals', async () => {
    await renderQueue();
    const controls = cardControls()[0];

    const send = named(controls, 'Mark sent');
    const open = named(controls, 'Open LinkedIn');
    const copy = named(controls, 'Copy');
    const skip = named(controls, 'Skip');
    const snooze = named(controls, 'Snooze');

    expect(weight(send), 'the write is not the loudest control on the card').toBeGreaterThan(weight(open));
    expect(weight(send)).toBeGreaterThan(weight(copy));
    // Open and Copy are the same step of the same job and must not disagree.
    expect(weight(open), 'Open and Copy sit at different tiers').toBe(weight(copy));
    // "Not now" must not read as loudly as "done".
    expect(weight(skip), 'a deferral is as loud as an enabling step').toBeLessThan(weight(copy));
    expect(weight(snooze)).toBe(weight(skip));
  });

  it('the page header does not compete with the cards for primary', async () => {
    await renderQueue();
    // Refresh is a page-level convenience. If it ever renders solid it becomes the loudest
    // thing on a screen whose job is sending one message at a time.
    const refresh = screen.getByRole('button', { name: /Refresh/ });
    expect(weight(refresh), 'Refresh is competing with the per-card primary').toBeLessThan(3);
  });

  it('NO page-level control competes with the per-card primary, not just Refresh', async () => {
    /*
     * The test above names `Refresh`, and naming it is what made it a blind spot: adding a
     * second, brand-new solid button beside it — `<Button variant="primary" size="sm">Send
     * all</Button>` — left all four original assertions green, because a lookup by
     * accessible name cannot see a control nobody thought to look up. Measured.
     *
     * So the claim is stated over the SET instead: everything outside the cards is
     * page-level chrome, and none of it may reach the weight the per-card write holds.
     */
    await renderQueue();
    const inCards = new Set(cardControls().flat());
    const outside = [...document.querySelectorAll('button, a[href]')].filter(c => !inCards.has(c));

    expect(outside.length, 'no page-level controls were scanned, so this proves nothing').toBeGreaterThan(0);
    expect(
      outside.filter(c => weight(c) === 3).map(c => (c.textContent ?? '').trim()),
      'a page-level control is as loud as the per-card primary, so the screen has two',
    ).toEqual([]);
  });

  it('the weight classifier is not blind — it can see all three tiers', async () => {
    // POSITIVE CONTROL. A classifier that returned the same number for everything would
    // satisfy "Open and Copy agree" and "exactly one loud control" would fail loudly
    // instead — but a classifier stuck at 1 for everything makes the ladder test pass by
    // accident in one direction. So assert all three tiers are actually distinguished on
    // this card.
    await renderQueue();
    const tiers = new Set(cardControls()[0].map(weight));
    expect([...tiers].sort(), 'the classifier collapsed the card to fewer than three tiers').toEqual([1, 2, 3]);
  });
});
