import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  A SUSPENDED DESK IN A LIVE CRISIS — THE STATE NOBODY DESIGNS FOR
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A competent authority has suspended LCX's marketing communications under MiCA Art 94(1)
 * — up to 30 consecutive WORKING days — and an incident starts anyway. `crisisCapabilities`
 * and the nine-gate `activateCrisisStatement` were built for exactly this and had NO CALLER:
 * they need a `DeskMode`, the mode lived privately inside `routes/marketingDesk.ts`, and the
 * crisis room's own file header said capabilities were "absent rather than invented".
 *
 * ══ WHY BOTH ROUTERS RUN OVER ONE STUB HERE ══
 * The suspension is imposed through `POST /v1/marketing/desk-mode` on the DESK router and
 * read back through the crisis routes on the MEMORY router, over a single in-memory
 * `object_actions` array. That is the whole point of `marketing/deskModeStore.ts`: two
 * routers, one store, one answer to "is the desk shut". A second reader would let the
 * board and the crisis room print opposite sentences about the same instant, and this file
 * cannot pass if the memory router reads anywhere but where the desk router wrote.
 *
 * ══ WHAT EACH TEST WOULD CATCH ══
 *  · a suspension turning composition, clearance, recording or export into a refusal —
 *    which would take the record away at the moment the supervisor will ask for it;
 *  · handoff surviving a suspension;
 *  · the Art 88(1) disclosure being CLASSIFIED by the instrument instead of refused to
 *    counsel — the legal call this thing must not make;
 *  · counsel taken from the request body rather than the incident record, which would make
 *    the refusal self-clearing;
 *  · the nine gates never reaching `desk_permits_handoff`, or reaching it and passing;
 *  · a suspension that has LAPSED still refusing — refusing longer than the authority
 *    ordered is its own compliance problem, and the engine says so;
 *  · an unreadable mode record being read as `normal`.
 */

type Row = Record<string, unknown>;

interface LedgerRow {
  id: string; subject_type: string; subject_id: string; action: string;
  params: unknown; result: unknown; actor: string; created_at: string;
}

const db = {
  present: true,
  ledger: [] as LedgerRow[],
  incidents: [] as Row[],
  instances: [] as Row[],
  clears: [] as Row[],
  nextLedgerId: 1,
};

let calls: { sql: string; params: unknown[] }[] = [];

const DAY_MS = 86_400_000;

/**
 * The stub behaves like Postgres for the shapes that matter, and `object_actions` is a real
 * append-only array: the mode written by one request is the mode the next request reads.
 */
const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  calls.push({ sql, params });
  const p = params;

  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) return { rows: [], rowCount: 0 };
  if (/pg_advisory_xact_lock/.test(sql)) return { rows: [{}], rowCount: 1 };
  if (/to_regclass/.test(sql)) return { rows: [{ ok: db.present }], rowCount: 1 };

  /* ── the desk-mode ledger, shared by both routers ── */
  if (/INSERT INTO object_actions/.test(sql)) {
    const row: LedgerRow = {
      id: `led-${String(db.nextLedgerId++)}`,
      subject_type: String(p[0]), subject_id: String(p[1]), action: String(p[2]),
      params: JSON.parse(String(p[3])), result: JSON.parse(String(p[4])), actor: String(p[5]),
      // Monotonic, so `created_at DESC, id DESC` is deterministic in the stub too.
      created_at: new Date(Date.UTC(2026, 7, 3, 9, db.nextLedgerId)).toISOString(),
    };
    db.ledger.push(row);
    return { rows: [{ id: row.id, created_at: row.created_at }], rowCount: 1 };
  }
  if (/FROM object_actions/.test(sql)) {
    const rows = db.ledger
      .filter((r) => r.subject_type === String(p[0]) && r.subject_id === String(p[1]) && r.action === String(p[2]))
      .sort((a, b) => (a.created_at === b.created_at ? b.id.localeCompare(a.id) : b.created_at.localeCompare(a.created_at)))
      .slice(0, Number(p[3]));
    return { rows, rowCount: rows.length };
  }

  /* ── the crisis room (0063) ── */
  if (/INSERT INTO marketing_crisis_incident/.test(sql)) {
    db.incidents.push({
      incident_uid: p[0], incident_type: p[1], severity: p[2], phase: p[3],
      opened_at: p[4], opened_by: p[5], first_statement_at: null, first_statement_by: null,
      first_statement_source: null, legal_implications: p[6], counsel_named: p[7],
    });
    return { rows: [], rowCount: 1 };
  }
  if (/FROM marketing_crisis_incident WHERE incident_uid/.test(sql)) {
    const row = db.incidents.find((r) => r.incident_uid === p[0]);
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }
  if (/count\(\*\)::int AS n FROM marketing_crisis_statement_instance/.test(sql)) {
    return { rows: [{ n: db.instances.filter((r) => r.incident_uid === p[0]).length }], rowCount: 1 };
  }
  if (/INSERT INTO marketing_crisis_statement_instance/.test(sql)) {
    const seq = db.instances
      .filter((r) => r.incident_uid === p[1])
      .reduce((max, r) => Math.max(max, Number(r.seq)), 0) + 1;
    db.instances.push({
      instance_uid: p[0], incident_uid: p[1], seq, statement_id: p[2], statement_version: p[3],
      library_version: p[4], ad_hoc: p[5], authored_by: p[6], authored_at: p[7], phase: p[8],
      body: JSON.parse(String(p[9])), content_hash: p[10], preconditions_acknowledged: p[11],
      carries_promotional_content: p[12], is_inside_information_disclosure: p[13],
      residual_unknowns_closed: p[14] === null ? null : JSON.parse(String(p[14])), supersedes: p[15],
    });
    return { rows: [], rowCount: 1 };
  }
  if (/FROM marketing_crisis_statement_instance WHERE instance_uid/.test(sql)) {
    const row = db.instances.find((r) => r.instance_uid === p[0]);
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }
  if (/INSERT INTO marketing_crisis_clearance/.test(sql)) {
    const existing = db.clears.find(
      (r) => r.instance_uid === p[0] && r.role === p[1] && r.reviewer === p[3] && r.content_hash === p[6],
    );
    if (existing) {
      existing.mode = p[2]; existing.cleared_at = p[4];
      existing.headline_test = p[5]; existing.comment = p[7];
      return { rows: [], rowCount: 1 };
    }
    db.clears.push({
      instance_uid: p[0], role: p[1], mode: p[2], reviewer: p[3], cleared_at: p[4],
      headline_test: p[5], content_hash: p[6], comment: p[7],
    });
    return { rows: [], rowCount: 1 };
  }
  if (/FROM marketing_crisis_clearance WHERE instance_uid/.test(sql)) {
    const rows = db.clears.filter((r) => r.instance_uid === p[0]);
    return { rows, rowCount: rows.length };
  }

  return { rows: [], rowCount: 0 };
});

const client = { query, release: vi.fn() };

vi.mock('../../db/index.js', () => ({
  getPool: () => ({ query, connect: async () => client }),
  closeDb: async () => {},
  getDb: () => { throw new Error('getDb is not used by the marketing routers'); },
}));

const { marketingMemoryRoutes, _resetMemoryMigrated } = await import('../marketingMemory.js');
const { marketingDeskRoutes } = await import('../marketingDesk.js');
const { _resetMigrated } = await import('../../marketing/service.js');
const { CRISIS_GATE_ORDER } = await import('@lcx/shared');

const PASSCODE = process.env.DESK_PASSCODE ?? 'test#1234';
const KEY = (who: string) => `${who}@lcx.com:${PASSCODE}`;
/** The shared operator key: a FOURTH principal, so an author can differ from three reviewers. */
const MACHINE = process.env.OPERATOR_API_KEY ?? 'dev-operator-key-change-me';

type Res = { status: number; body: Record<string, any> };

const request = async (
  router: { request: (p: string, init?: RequestInit) => Promise<Response> },
  path: string,
  init: { method?: string; body?: unknown; who?: string } = {},
): Promise<Res> => {
  const res = await router.request(path, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', 'x-api-key': init.who ?? KEY('nik') },
    ...(init.method === 'POST' ? { body: JSON.stringify(init.body ?? {}) } : {}),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
};

const memGet = (path: string, who = KEY('nik')) => request(marketingMemoryRoutes, path, { who });
const memPost = (path: string, body: unknown, who = KEY('nik')) =>
  request(marketingMemoryRoutes, path, { method: 'POST', body, who });
const deskPost = (path: string, body: unknown) =>
  request(marketingDeskRoutes, path, { method: 'POST', body, who: KEY('nik') });

const iso = (offsetDays: number): string => new Date(Date.now() + offsetDays * DAY_MS).toISOString();

const CALENDAR = {
  jurisdiction: 'li', weekend: [0, 6], holidays: ['2026-08-15'],
  coversFrom: '2026-01-01', coversTo: '2026-12-31',
  source: 'Liechtenstein public holidays, Amt für Justiz list 2026',
};

/**
 * AN ART 94(1)(p) PROHIBITION, and the limb is not arbitrary: (p) states no time limit, so
 * `expiresAt` is null, the phase is `unbounded`, and the desk is shut with no dependence on
 * what the wall clock says when this file runs.
 */
const suspend = () =>
  deskPost('/desk-mode', {
    to: { kind: 'suspended_by_authority' },
    reason: 'FMA order served on the desk this morning; nothing goes out.',
    byRoles: ['legal'],
    order: {
      power: 'art_94_1_p_prohibit', authority: 'FMA Liechtenstein', orderRef: 'FMA-2026-4471',
      effectiveFrom: '2026-07-01T00:00:00.000Z', statedEndAt: null,
      groundsStated: 'Suspected infringement of Art 7(1) in a listing promotion.',
    },
    calendar: CALENDAR,
  });

/** An order whose recorded end has PASSED and which nobody filed a lift for. */
const suspendAndLapse = () =>
  deskPost('/desk-mode', {
    to: { kind: 'suspended_by_authority' },
    reason: 'FMA cease-and-suspend order, thirty working days, now expired on its own terms.',
    byRoles: ['legal'],
    order: {
      power: 'art_94_1_q', authority: 'FMA Liechtenstein', orderRef: 'FMA-2026-4471',
      effectiveFrom: iso(-60), statedEndAt: iso(-2),
      groundsStated: 'Suspected infringement of Art 7(1) in a listing promotion.',
    },
    calendar: CALENDAR,
  });

async function openIncident(over: Record<string, unknown> = {}): Promise<string> {
  const res = await memPost('/crisis/incident', {
    incidentType: 'hack_rumour', severity: 'high', openedAt: iso(0), ...over,
  });
  expect(res.status).toBe(201);
  return res.body.data.incident.incidentId as string;
}

/** Author is the MACHINE principal, so all three roster members are non-authors. */
async function compose(incidentId: string, over: Record<string, unknown> = {}): Promise<Res> {
  return memPost(
    '/crisis/statements/ad-hoc/instance',
    {
      incidentId,
      known: ['We are aware of reports about LCX withdrawals and we are looking at it now.'],
      notKnown: ['We do not yet know the cause.'],
      nextStepAction: 'Our engineers are reviewing the withdrawal queue.',
      nextUpdateBy: iso(1),
      ...over,
    },
    MACHINE,
  );
}

const clear = (instanceId: string, role: string, who: string) =>
  memPost(`/crisis/instance/${instanceId}/clearance`, { role, headlineTestPassed: true }, who);

/** The three parallel blocking lanes, held by three distinct non-authors. */
async function holdEveryClear(instanceId: string): Promise<Res> {
  await clear(instanceId, 'reputation', KEY('nik'));
  await clear(instanceId, 'policy', KEY('monty'));
  return clear(instanceId, 'sme', KEY('sam'));
}

const codes = (refusals: { code: string }[] | undefined): string[] => (refusals ?? []).map((r) => r.code);

beforeEach(() => {
  calls = [];
  db.present = true;
  db.ledger = [];
  db.incidents = [];
  db.instances = [];
  db.clears = [];
  db.nextLedgerId = 1;
  query.mockClear();
  _resetMemoryMigrated();
  _resetMigrated();
});

/* ══════════════════════════════════════════════════════════════════════════ */

describe('the suspension reaches the crisis room at all', () => {
  it('reports the desk as OPEN BY DEFAULT, and says it is a default rather than a decision', async () => {
    const id = await openIncident();
    const res = await compose(id);
    expect(res.status).toBe(201);
    expect(res.body.desk.source).toBe('default_normal');
    expect(res.body.desk.capabilities.mayHandOff).toBe(true);
    expect(res.body.desk.capabilities.refusals).toEqual([]);
  });

  it('carries the suspension imposed through the DESK router into a MEMORY router response', async () => {
    // The cross-router proof: one store, or this cannot pass.
    expect((await suspend()).status).toBe(201);
    const id = await openIncident();
    const res = await compose(id);
    expect(res.status).toBe(201);
    expect(res.body.desk.source).toBe('ledger');
    expect(res.body.desk.modeResolvedAgainst.kind).toBe('suspended_by_authority');
    expect(res.body.desk.standing.outboundPermitted).toBe(false);
    // The room's own read, and the ledger row the desk router wrote.
    expect(res.body.desk.modeResolvedAgainst.orderRef).toBe('FMA-2026-4471');
  });
});

describe('a suspended desk keeps draft, clear, record and export — and LOSES handoff', () => {
  it('composes the statement anyway, and stores it', async () => {
    await suspend();
    const id = await openIncident();
    const res = await compose(id);
    // NOT a refusal. A desk that stops keeping its record during a suspension has made its
    // position worse, and the record is what the supervisor will ask for.
    expect(res.status).toBe(201);
    expect(db.instances).toHaveLength(1);
    const caps = res.body.desk.capabilities;
    expect(caps.mayDraft).toBe(true);
    expect(caps.mayClear).toBe(true);
    expect(caps.mayRecordPublication).toBe(true);
    expect(caps.mayExportRecord).toBe(true);
    expect(caps.mayHandOff).toBe(false);
  });

  it('SAYS WHY handoff is gone rather than just failing', async () => {
    await suspend();
    const id = await openIncident();
    const caps = (await compose(id)).body.desk.capabilities;
    expect(codes(caps.refusals)).toContain('DESK_SUSPENDED_BY_AUTHORITY');
    const refusal = caps.refusals.find((r: any) => r.code === 'DESK_SUSPENDED_BY_AUTHORITY');
    // The authority, the order and what is still available — not "forbidden".
    expect(refusal.sentence).toMatch(/FMA Liechtenstein/);
    expect(refusal.sentence).toMatch(/FMA-2026-4471/);
    expect(refusal.sentence).toMatch(/drafted, cleared, logged and exported/);
    expect(refusal.recovery.kind).toBe('wait_until');
    // And the notes tell the operator the record is the point, with the working-day trap named.
    expect(JSON.stringify(caps.notes)).toMatch(/WORKING days/);
  });

  it('records a clearance under the suspension, and the board still holds', async () => {
    await suspend();
    const id = await openIncident();
    const instanceId = (await compose(id)).body.data.instanceId as string;
    const res = await holdEveryClear(instanceId);
    expect(res.status).toBe(201);
    expect(res.body.data.assessment.allBlockingHeld).toBe(true);
    expect(db.clears).toHaveLength(3);
  });

  it('still refuses handoff with every clear held — the last gate, reached', async () => {
    await suspend();
    const id = await openIncident();
    const instanceId = (await compose(id)).body.data.instanceId as string;
    const res = await holdEveryClear(instanceId);

    const activation = res.body.activation;
    expect(activation.issuable).toBe(false);
    const deskGate = activation.gates.find((g: any) => g.gate === 'desk_permits_handoff');
    // REACHED, not skipped: the clearance gate passed, so the desk gate is the one that
    // failed, and the operator learns the text was sound before being told the desk is shut.
    expect(deskGate.skipped).toBe(false);
    expect(deskGate.passed).toBe(false);
    expect(codes(activation.refusals)).toContain('DESK_SUSPENDED_BY_AUTHORITY');
    expect(activation.text).toBeNull();
  });
});

describe('an Art 88(1) disclosure needs counsel named — the instrument will not classify it', () => {
  it('refuses handoff, and refuses to say whether this is marketing or a disclosure', async () => {
    await suspend();
    const id = await openIncident({ legalImplications: true });
    const res = await compose(id, { isInsideInformationDisclosure: true });
    expect(res.status).toBe(201);
    const caps = res.body.desk.capabilities;
    expect(caps.mayHandOff).toBe(false);
    expect(codes(caps.refusals)).toContain('ART_94_CLASSIFICATION_REQUIRES_COUNSEL');
    const refusal = caps.refusals.find((r: any) => r.code === 'ART_94_CLASSIFICATION_REQUIRES_COUNSEL');
    expect(refusal.sentence).toMatch(/legal question, and this instrument will not answer it/);
    expect(refusal.recovery.kind).toBe('supply_data');
    expect(refusal.recovery.missing).toMatch(/counsel who has ruled/);
    // Everything else survives, and the note says so in as many words.
    expect(caps.mayDraft && caps.mayClear && caps.mayRecordPublication && caps.mayExportRecord).toBe(true);
    expect(JSON.stringify(caps.notes)).toMatch(/drafted, cleared and logged, but not handed off/);
  });

  it('permits handoff once counsel is NAMED ON THE INCIDENT RECORD', async () => {
    await suspend();
    const id = await openIncident({ legalImplications: true, counselNamed: 'Dr Anna Frick, Frick & Partner' });
    const res = await compose(id, { isInsideInformationDisclosure: true });
    const caps = res.body.desk.capabilities;
    expect(caps.mayHandOff).toBe(true);
    expect(codes(caps.refusals)).not.toContain('ART_94_CLASSIFICATION_REQUIRES_COUNSEL');
    expect(codes(caps.refusals)).not.toContain('DESK_SUSPENDED_BY_AUTHORITY');
    // The ruling and the name are on the record, and the response names them.
    expect(JSON.stringify(caps.notes)).toMatch(/Dr Anna Frick/);
    expect(res.body.desk.counselNamed).toBe('Dr Anna Frick, Frick & Partner');
    expect(res.body.desk.counselSource).toBe('incident_record');
  });

  it('IGNORES a counsel name asserted in the request body', async () => {
    // The refusal would be self-clearing if the request asking for the permission could
    // supply the name that grants it. Same rule that keeps `reviewer` and `authoredBy` out
    // of request bodies.
    await suspend();
    const id = await openIncident({ legalImplications: true });
    const res = await compose(id, {
      isInsideInformationDisclosure: true,
      counselNamed: 'Whoever Is Handy',
      counsel: 'Whoever Is Handy',
    });
    const caps = res.body.desk.capabilities;
    expect(caps.mayHandOff).toBe(false);
    expect(codes(caps.refusals)).toContain('ART_94_CLASSIFICATION_REQUIRES_COUNSEL');
    expect(res.body.desk.counselNamed).toBeNull();
    expect(JSON.stringify(res.body.desk)).not.toMatch(/Whoever Is Handy/);
  });

  it('refuses a statement marked as BOTH a disclosure and promotional, and never blends them', async () => {
    // Art 88(1): the two shall not be combined. This one bites with no suspension at all.
    const id = await openIncident({ legalImplications: true, counselNamed: 'Dr Anna Frick' });
    const res = await compose(id, { isInsideInformationDisclosure: true, carriesPromotionalContent: true });
    // The composition itself refuses — the route's own Art 88(1) check — and stores nothing.
    expect(res.status).toBe(422);
    expect(db.instances).toHaveLength(0);
    expect(codes(res.body.refusals)).toContain('ART_88_1_DISCLOSURE_MIXED_WITH_MARKETING');
    // And the desk half is on the 422 too, so an operator about to redraft under a
    // suspension knows what the redraft can and cannot lead to.
    expect(res.body.desk.capabilities.mayHandOff).toBe(false);
    expect(codes(res.body.desk.capabilities.refusals)).toContain('ART_88_1_DISCLOSURE_MIXED_WITH_MARKETING');
  });
});

describe('the nine gates, in order, over a stored statement', () => {
  it('answers GET /crisis/instance/:id with the engine gate list in the engine order', async () => {
    const id = await openIncident();
    const instanceId = (await compose(id)).body.data.instanceId as string;
    const res = await memGet(`/crisis/instance/${instanceId}`);
    expect(res.status).toBe(200);
    expect(res.body.activation.gates.map((g: any) => g.gate)).toEqual([...CRISIS_GATE_ORDER]);
  });

  it('stops at clearances_held before a single clear exists, and skips no earlier gate', async () => {
    const id = await openIncident();
    const instanceId = (await compose(id)).body.data.instanceId as string;
    const activation = (await memGet(`/crisis/instance/${instanceId}`)).body.activation;
    expect(activation.issuable).toBe(false);
    const gate = (name: string) => activation.gates.find((g: any) => g.gate === name);
    expect(gate('tri_slot_complete').passed).toBe(true);
    expect(gate('clearances_held').passed).toBe(false);
    expect(gate('clearances_held').skipped).toBe(false);
    expect(gate('desk_permits_handoff').skipped).toBe(true);
    expect(codes(activation.refusals)).toContain('CLEARANCE_BLOCKING_OUTSTANDING');
  });

  it('reports capabilities even where the desk gate was never reached', async () => {
    // The reason capabilities travel BESIDE the gates: an operator must not have to gather
    // three clears to discover the desk is suspended.
    await suspend();
    const id = await openIncident();
    const instanceId = (await compose(id)).body.data.instanceId as string;
    const res = await memGet(`/crisis/instance/${instanceId}`);
    expect(res.body.activation.gates.find((g: any) => g.gate === 'desk_permits_handoff').skipped).toBe(true);
    expect(res.body.activation.capabilities.mayHandOff).toBe(false);
    expect(res.body.desk.capabilities.mayHandOff).toBe(false);
    expect(codes(res.body.desk.capabilities.refusals)).toContain('DESK_SUSPENDED_BY_AUTHORITY');
  });

  it('becomes issuable on an open desk once every blocking lane is held', async () => {
    // The both-directions half: the gate that refuses under a suspension must PASS without
    // one, or the refusal above proves nothing.
    const id = await openIncident();
    const instanceId = (await compose(id)).body.data.instanceId as string;
    const res = await holdEveryClear(instanceId);
    expect(res.body.activation.issuable).toBe(true);
    expect(res.body.activation.gates.every((g: any) => g.passed && !g.skipped)).toBe(true);
    expect(res.body.activation.text).not.toBeNull();
    // Issuable is NOT published, and the payload keeps saying so.
    expect(res.body.data.cannotPublish).toBe(true);
    expect(res.body.activation.unreviewedNotice).toMatch(/./);
  });

  it('recomputes against the mode as it stands NOW, not as it stood at composition', async () => {
    // The statement was issuable; the supervisor then shut the desk. Nothing about the bytes
    // changed, and a mode captured at composition would still report it as issuable.
    const id = await openIncident();
    const instanceId = (await compose(id)).body.data.instanceId as string;
    expect((await holdEveryClear(instanceId)).body.activation.issuable).toBe(true);
    await suspend();
    const after = await memGet(`/crisis/instance/${instanceId}`);
    expect(after.body.activation.issuable).toBe(false);
    expect(codes(after.body.activation.refusals)).toContain('DESK_SUSPENDED_BY_AUTHORITY');
  });
});

describe('the two states between "suspended" and "open"', () => {
  it('does NOT keep refusing a suspension that lapsed on its own terms', async () => {
    // `deskStanding` is explicit: the desk is free again by the order's own terms and the
    // missing lift record is a bookkeeping defect the banner shows — refusing longer than
    // the authority ordered is its own compliance problem.
    expect((await suspendAndLapse()).status).toBe(201);
    const id = await openIncident();
    const res = await compose(id);
    expect(res.body.desk.source).toBe('ledger');
    expect(res.body.desk.standing.phase).toBe('lapsed');
    expect(res.body.desk.standing.lapsedWithoutLiftRecord).toBe(true);
    // The RECORD still says suspended; the mode the permission was answered against does not.
    expect(res.body.desk.standing.mode.kind).toBe('suspended_by_authority');
    expect(res.body.desk.modeResolvedAgainst.kind).toBe('normal');
    expect(res.body.desk.capabilities.mayHandOff).toBe(true);
  });

  it('offers NO permission at all when the newest mode record cannot be read', async () => {
    // The one wrong answer here is "normal". A corrupt newest row must not open the desk.
    db.ledger.push({
      id: 'led-bad', subject_type: 'marketing_desk', subject_id: 'mode',
      action: 'marketing_desk_mode_change', params: {},
      result: { transition: { to: { kind: 'shut_i_think' } } },
      actor: 'nik', created_at: '2026-08-03T10:00:00.000Z',
    });
    const id = await openIncident();
    const res = await compose(id);
    // The statement is still recorded — the record is the point, and the mode is not part of it.
    expect(res.status).toBe(201);
    expect(res.body.desk.source).toBe('unreadable');
    expect(res.body.desk.standing).toBeNull();
    expect(res.body.desk.modeResolvedAgainst).toBeNull();
    expect(res.body.desk.capabilities).toBeNull();
    expect(codes(res.body.desk.refusals)).toContain('DATA_ABSENT_NOT_ZERO');
    expect(res.body.desk.refusals[0].sentence).toMatch(/treat the desk as CLOSED/);
    // No permission anywhere in the payload, and no issuance verdict either.
    expect(JSON.stringify(res.body.desk)).not.toMatch(/"mayHandOff":true/);
    const instanceId = res.body.data.instanceId as string;
    const read = await memGet(`/crisis/instance/${instanceId}`);
    expect(read.status).toBe(200);
    expect(read.body.activation).toBeNull();
  });
});

describe('nothing here publishes, and nothing acquires a credential', () => {
  it('never writes an X credential, a post id or an outbound HTTP call into any of it', async () => {
    await suspend();
    const id = await openIncident();
    const instanceId = (await compose(id)).body.data.instanceId as string;
    const res = await holdEveryClear(instanceId);
    const whole = JSON.stringify(res.body);
    expect(whole).not.toMatch(/api\.twitter|api\.x\.com|bearer_token|access_token/i);
    // The room says it cannot publish on every payload that carries text.
    expect(res.body.data.cannotPublish).toBe(true);
  });

  it('takes no lock and opens no transaction on any crisis read', async () => {
    const id = await openIncident();
    const instanceId = (await compose(id)).body.data.instanceId as string;
    calls = [];
    await memGet(`/crisis/instance/${instanceId}`);
    expect(calls.some((c) => /pg_advisory_xact_lock/.test(c.sql))).toBe(false);
    expect(calls.some((c) => /^BEGIN/.test(c.sql.trim()))).toBe(false);
    expect(calls.some((c) => /INSERT INTO|UPDATE |DELETE FROM/.test(c.sql))).toBe(false);
  });
});
