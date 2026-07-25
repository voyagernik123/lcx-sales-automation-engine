/**
 * Refusal classification. This is the module that replaces regex-matching server
 * prose, so the tests are mostly about the two ways that goes wrong: classifying
 * on a message instead of a code, and offering an override where an override
 * cannot legitimately help.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/container', () => ({ isTerminal: () => false }));

let respond: () => { status: number; body: unknown };

function installFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const r = respond();
      return {
        ok: r.status < 400,
        status: r.status,
        statusText: 'x',
        headers: new Headers(),
        text: async () => JSON.stringify(r.body),
      } as unknown as Response;
    }),
  );
}

async function fresh() {
  vi.resetModules();
  return import('@/components/command/invoke');
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lcx_operator_email', 'nik@lcx.com');
  localStorage.setItem('lcx_desk_passcode', 'test#1234');
  respond = () => ({ status: 200, body: { data: { action: 'x', result: {} } } });
  installFetch();
});

afterEach(() => vi.unstubAllGlobals());

describe('success', () => {
  it('returns the action result', async () => {
    respond = () => ({ status: 200, body: { data: { action: 'track', result: { tier: 'tracked', promoted: true } } } });
    const { invoke } = await fresh();
    const out = await invoke('track', 'project', 'p1', {});
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.promoted).toBe(true);
  });

  it('detects a silent no-op, which HTTP 200 alone would hide', async () => {
    const { wasNoOp } = await fresh();
    // `track` on an already-tracked project: 200 with promoted:false. Reporting
    // that as plain success would tell the operator something happened.
    expect(wasNoOp({ tier: 'tracked', promoted: false })).toBe(true);
    expect(wasNoOp({ tier: 'tracked', promoted: true })).toBe(false);
    expect(wasNoOp({ notified: true })).toBe(false);
  });
});

describe('gate refusals carry their structured detail into the remedy', () => {
  it('SAT_REQUIRED names the missing tradecraft', async () => {
    respond = () => ({
      status: 409,
      body: {
        error: 'Program-critical decision: run the missing tradecraft first',
        code: 'SAT_REQUIRED',
        missing: ['premortem', 'devils_advocate'],
      },
    });
    const { invoke } = await fresh();
    const out = await invoke('command_decide', 'command_decision', 'dec_01', { chosen: 'A' });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe('SAT_REQUIRED');
    expect(out.remedy).toContain('premortem');
    expect(out.remedy).toContain('devils_advocate');
    expect(out.overridable).toBe(true);
  });

  it('COMPLIANCE_GATE lists the blockers', async () => {
    respond = () => ({
      status: 409,
      body: {
        error: 'Cannot launch',
        code: 'COMPLIANCE_GATE',
        blockers: ['compliance review missing (legal_check)', 'projected reward spend exceeds the budget envelope'],
      },
    });
    const { invoke } = await fresh();
    const out = await invoke('dist_campaign_set_status', 'dist_campaign', 'c1', { status: 'live' });
    if (out.ok) throw new Error('expected refusal');
    expect(out.remedy).toContain('legal_check');
    expect(out.remedy).toContain('budget envelope');
    expect(out.overridable).toBe(true);
  });

  it('WORKSPACE_FORBIDDEN names the workspace and the capability', async () => {
    respond = () => ({
      status: 403,
      body: { error: 'requires operate', code: 'WORKSPACE_FORBIDDEN', workspace: 'distribution', needed: 'operate' },
    });
    const { invoke } = await fresh();
    const out = await invoke('dist_listing_set_status', 'dist_listing', 'l1', { status: 'live' });
    if (out.ok) throw new Error('expected refusal');
    expect(out.remedy).toContain('distribution');
    expect(out.remedy).toContain('operate');
  });

  it('VALIDATION points at the offending field', async () => {
    respond = () => ({
      status: 400,
      body: {
        error: 'Invalid',
        code: 'VALIDATION',
        issues: [{ path: 'status', message: 'Invalid option' }],
      },
    });
    const { invoke } = await fresh();
    const out = await invoke('command_set_task_status', 'command_task', 't1', { status: 'bogus' });
    if (out.ok) throw new Error('expected refusal');
    expect(out.remedy).toContain('status');
    expect(out.remedy).toContain('Invalid option');
  });
});

describe('authority is never presented as overridable', () => {
  it('APPROVER_REQUIRED offers no override', async () => {
    respond = () => ({
      status: 403,
      body: { error: 'requires approver authority', code: 'APPROVER_REQUIRED' },
    });
    const { invoke } = await fresh();
    const out = await invoke('dist_campaign_set_status', 'dist_campaign', 'c1', { status: 'live' });
    if (out.ok) throw new Error('expected refusal');

    // This was a real privilege escalation until Phase 3 closed it: `overrideGate`
    // used to bypass the approver check. The command line must never suggest it as
    // a way through, or it teaches the operator to reach for exactly that.
    expect(out.overridable).toBe(false);
    expect(out.remedy).toMatch(/cannot grant authority/i);
    expect(out.remedy).toMatch(/ask an approver/i);
  });
});

describe('classification is by code, never by message', () => {
  it('a refusal whose PROSE mentions compliance but whose code does not is not treated as a gate', async () => {
    // The failure mode this guards: three surfaces in this app regex the message
    // (/compliance|approver|reward spend/i). Any message containing those words —
    // including one synthesised locally — would surface an override prompt for a
    // write the server never gate-rejected.
    respond = () => ({
      status: 500,
      body: { error: 'compliance service unavailable; approver notified', code: 'ACTION_ERROR' },
    });
    const { invoke } = await fresh();
    const out = await invoke('dist_campaign_set_status', 'dist_campaign', 'c1', { status: 'live' });
    if (out.ok) throw new Error('expected refusal');
    expect(out.overridable).toBeUndefined();
    expect(out.remedy).not.toMatch(/override/i);
  });

  it('an unknown code still says plainly that nothing changed', async () => {
    respond = () => ({ status: 500, body: { error: 'boom', code: 'SOMETHING_NEW' } });
    const { invoke } = await fresh();
    const out = await invoke('notify', 'project', 'p', { title: 'x' });
    if (out.ok) throw new Error('expected refusal');
    expect(out.remedy).toMatch(/nothing was changed/i);
  });
});

describe('offline', () => {
  it('explains why a governed write cannot be queued', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const { invoke } = await fresh();
    const out = await invoke('notify', 'project', 'p', { title: 'x' });
    if (out.ok) throw new Error('expected refusal');
    expect(out.code).toBe('NETWORK');
    expect(out.remedy).toMatch(/live connection/i);
  });
});
