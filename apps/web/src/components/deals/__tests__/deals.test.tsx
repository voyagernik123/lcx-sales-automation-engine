import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { BoardDeal } from '@/lib/api/bd';
import type { DealEvent } from '@/types/bd';
import { computeDealHealthSet } from '@/lib/salesIntel';
import { useSalesScenarioStore, BASELINE_SCENARIO } from '@/stores';
import { sanitizePlaybookKeys, readLocalPlaybook, writeLocalPlaybook, PLAYBOOK_LOCAL_KEY } from '@/lib/api/deals100x';
import { bucketEventsByDay, ActivityStrip, STRIP_DAYS } from '../ActivityStrip';
import { buildWarningStageMatrix, WarningStageMatrix } from '../WarningStageMatrix';
import { ApprovalChain } from '../ApprovalChain';
import { WinLossModal } from '../WinLossModal';
import { PlaybookChips } from '../PlaybookChips';
import { ScenarioValue, SimPill } from '../ScenarioControls';
import { fmtMoneyCents, ownerInitials, packageLabel } from '../dealFormat';

const DAY_MS = 86_400_000;
const NOW = Date.parse('2026-07-16T12:00:00Z');

function mkEvent(overrides: Partial<DealEvent>): DealEvent {
  return {
    id: Math.random().toString(36).slice(2),
    dealId: 'd1',
    eventType: 'note',
    actor: 'operator',
    oldStage: null,
    newStage: null,
    content: null,
    meta: {},
    createdAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

function mkDeal(overrides: Partial<BoardDeal>): BoardDeal {
  return {
    id: 'd1',
    projectId: 'p1',
    projectName: 'Test Project',
    projectTicker: 'TST',
    stage: 'proposal',
    packageType: 'listing',
    packageValue: 2_000_000,
    owner: 'operator',
    band: 'hot',
    priorityScore: 70,
    daysSinceUpdate: 1,
    updatedAt: new Date(NOW - DAY_MS).toISOString(),
    wonAt: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  useSalesScenarioStore.setState({ ...BASELINE_SCENARIO });
  localStorage.clear();
});

/* ── dealFormat ── */

describe('dealFormat', () => {
  it('formats cents compactly', () => {
    expect(fmtMoneyCents(null)).toBe('—');
    expect(fmtMoneyCents(2_000_000)).toBe('$20K');
    expect(fmtMoneyCents(550_000_000)).toBe('$5.5M');
    expect(fmtMoneyCents(12_345)).toBe('$123');
  });

  it('derives owner initials and package labels', () => {
    expect(ownerInitials('nikhil.sharma@lcx.com')).toBe('NS');
    expect(ownerInitials(null)).toBeNull();
    expect(packageLabel(null)).toBe('No package');
  });
});

/* ── ActivityStrip ── */

describe('bucketEventsByDay', () => {
  it('buckets events into the trailing window, oldest first', () => {
    const events = [
      mkEvent({ createdAt: new Date(NOW).toISOString() }), // today, ours
      mkEvent({ createdAt: new Date(NOW - 2 * DAY_MS).toISOString(), eventType: 'stage_change' }),
      mkEvent({ createdAt: new Date(NOW - (STRIP_DAYS + 3) * DAY_MS).toISOString() }), // outside window
      mkEvent({ createdAt: 'not-a-date' }), // dropped
      mkEvent({ createdAt: new Date(NOW + DAY_MS).toISOString() }), // future clamps to today
    ];
    const buckets = bucketEventsByDay(events, STRIP_DAYS, NOW);
    expect(buckets).toHaveLength(STRIP_DAYS);
    expect(buckets[STRIP_DAYS - 1]).toEqual({ ours: 2, stage: 0 }); // today + clamped future
    expect(buckets[STRIP_DAYS - 3]).toEqual({ ours: 0, stage: 1 });
    const total = buckets.reduce((s, b) => s + b.ours + b.stage, 0);
    expect(total).toBe(3);
  });

  it('renders one slot per day', () => {
    const { container } = render(<ActivityStrip events={[mkEvent({})]} now={NOW} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(container.querySelectorAll('rect').length).toBeGreaterThanOrEqual(STRIP_DAYS);
  });
});

/* ── WarningStageMatrix ── */

describe('buildWarningStageMatrix', () => {
  it('counts each deal once per warning code and links only non-empty cells', () => {
    const deals = [
      mkDeal({ id: 'a', stage: 'proposal', daysSinceUpdate: 20, updatedAt: new Date(NOW - 20 * DAY_MS).toISOString() }),
      mkDeal({ id: 'b', stage: 'discovery', daysSinceUpdate: 0, updatedAt: new Date(NOW).toISOString() }),
      mkDeal({ id: 'w', stage: 'won', daysSinceUpdate: 40, updatedAt: new Date(NOW - 40 * DAY_MS).toISOString() }),
    ];
    const health = computeDealHealthSet(deals, {}, NOW);
    const matrix = buildWarningStageMatrix(deals, health);

    // Deal "a" is silent for 20d → ghosted warning in proposal.
    expect(matrix.cells.ghosted.proposal).toBe(1);
    // Closed deals never enter the matrix.
    expect(matrix.stages).not.toContain('won');
    expect(matrix.maxCount).toBeGreaterThanOrEqual(1);
    // Only codes that occur somewhere survive.
    for (const code of matrix.codes) {
      expect(matrix.stages.some(s => matrix.cells[code][s] > 0)).toBe(true);
    }

    render(
      <MemoryRouter>
        <WarningStageMatrix deals={deals} health={health} />
      </MemoryRouter>,
    );
    const link = screen.getAllByRole('link')[0];
    expect(link.getAttribute('href')).toMatch(/\/deal-board\?warning=.+&stage=.+/);
  });

  it('shows the empty message when no warnings exist', () => {
    const deals = [mkDeal({ id: 'b', stage: 'discovery', daysSinceUpdate: 0, updatedAt: new Date(NOW).toISOString() })];
    const health = computeDealHealthSet(deals, { b: { events: [mkEvent({ dealId: 'b' })] } }, NOW);
    render(
      <MemoryRouter>
        <WarningStageMatrix deals={deals} health={health} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/No warnings across the open pipeline/)).toBeInTheDocument();
  });
});

/* ── ApprovalChain ── */

describe('ApprovalChain', () => {
  it('renders per-step role pills with status', () => {
    render(
      <ApprovalChain
        requestStatus="pending"
        steps={[
          { id: 's1', role: 'manager', status: 'approved', decidedBy: 'op' },
          { id: 's2', role: 'director', status: 'pending', decidedBy: null },
        ]}
      />,
    );
    expect(screen.getByRole('list', { name: 'Approval chain' })).toBeInTheDocument();
    expect(screen.getByText('manager')).toBeInTheDocument();
    expect(screen.getByText('director')).toBeInTheDocument();
    expect(screen.getByTitle('manager — approved by op')).toBeInTheDocument();
  });

  it('degrades to a request-level pill when steps are unknown', () => {
    render(<ApprovalChain requestStatus="pending" />);
    expect(screen.getByText(/chain pending/)).toBeInTheDocument();
    expect(screen.getByText(/step detail arrives/)).toBeInTheDocument();
  });
});

/* ── WinLossModal ── */

describe('WinLossModal', () => {
  it('composes the loss reason from category + note and never uses window.prompt', () => {
    const onConfirm = vi.fn();
    const promptSpy = vi.spyOn(window, 'prompt');
    render(<WinLossModal mode="lost" dealName="Test Project" onConfirm={onConfirm} onCancel={() => {}} />);

    fireEvent.change(screen.getByLabelText('Loss category'), { target: { value: 'competitor' } });
    fireEvent.change(screen.getByPlaceholderText(/What actually killed it/), { target: { value: 'Binance undercut' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm loss' }));

    expect(onConfirm).toHaveBeenCalledWith({ reason: 'Chose a competitor — Binance undercut', category: 'competitor' });
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it('omits the category for wins', () => {
    const onConfirm = vi.fn();
    render(<WinLossModal mode="won" dealName="Test Project" onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm win' }));
    expect(onConfirm).toHaveBeenCalledWith({ reason: 'Regulatory readiness / MiCAR story', category: undefined });
  });
});

/* ── PlaybookChips ── */

describe('PlaybookChips', () => {
  const playbook = [
    { key: 'T', label: 'Tokenomics review', status: 'done' },
    { key: 'K', label: 'KYB / entity check', status: 'empty' },
    { key: 'L', label: 'Legal opinion', status: 'empty' },
    { key: 'C', label: 'Compliance greenlight', status: 'empty' },
    { key: 'O', label: 'Offer sent', status: 'empty' },
  ] as const;

  it('opens the checklist popover and toggles a step', () => {
    const onToggle = vi.fn();
    render(<PlaybookChips playbook={[...playbook]} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: /Listing playbook 1\/5 complete/ }));
    fireEvent.click(screen.getByRole('button', { name: /KYB \/ entity check/ }));
    expect(onToggle).toHaveBeenCalledWith('K');
  });

  it('is read-only without onToggle', () => {
    render(<PlaybookChips playbook={[...playbook]} />);
    expect(screen.getByRole('button', { name: /Listing playbook 1\/5 complete/ })).toBeDisabled();
  });
});

/* ── Scenario treatment ── */

describe('ScenarioValue / SimPill', () => {
  it('shows the plain baseline when no scenario is active', () => {
    render(<ScenarioValue cents={1_000_000} />);
    expect(screen.getByText('$10K')).toBeInTheDocument();
    const { container } = render(<SimPill />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows adjusted-in-cyan with struck-through baseline when a value dial is off', () => {
    useSalesScenarioStore.setState({ valueDelta: -0.2 });
    render(<ScenarioValue cents={1_000_000} />);
    const adjusted = screen.getByTitle('Scenario-adjusted value');
    expect(adjusted).toHaveTextContent('$8K');
    expect(adjusted.className).toContain('text-cyan-700');
    const baseline = screen.getByTitle('Baseline value');
    expect(baseline).toHaveTextContent('$10K');
    expect(baseline.className).toContain('line-through');
    // SIM pill appears and resets the store.
    render(<SimPill />);
    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(useSalesScenarioStore.getState().valueDelta).toBe(0);
  });
});

/* ── Playbook persistence (localStorage fallback) ── */

describe('playbook local persistence', () => {
  it('sanitizes keys into canonical T·K·L·C·O order', () => {
    expect(sanitizePlaybookKeys(['O', 'T', 'T', 'nope', 42])).toEqual(['T', 'O']);
    expect(sanitizePlaybookKeys('garbage')).toEqual([]);
  });

  it('round-trips through localStorage and survives corrupt storage', () => {
    writeLocalPlaybook('deal-1', ['K', 'T']);
    expect(readLocalPlaybook()['deal-1']).toEqual(['T', 'K']);
    localStorage.setItem(PLAYBOOK_LOCAL_KEY, '{corrupt');
    expect(readLocalPlaybook()).toEqual({});
  });
});
