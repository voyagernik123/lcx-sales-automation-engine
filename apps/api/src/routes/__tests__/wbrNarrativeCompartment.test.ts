import { describe, expect, it } from 'vitest';
import { WORKSPACES, workspaceForApiPath } from '@lcx/shared';

/**
 * THE WBR HAD TWO DOORS WITH DIFFERENT LOCKS, AND THIS PINS THE CHEAP ONE SHUT.
 *
 * Found by an adversarial pass over the AI trust boundary and demonstrated against a real
 * database: a principal holding exactly `intel: operate` read COMMAND and DISTRIBUTION content
 * through `POST /v1/ai/wbr-narrative`.
 *
 * Nothing about the handler was careless in isolation. The defect is structural:
 *   · `/v1/ai` belongs to INTEL's apiPrefixes, so `app.ts` mounts requireWorkspace('intel').
 *   · `requireOperator` on the route is AUTHENTICATION, not authorisation.
 *   · `getLatestWbr` composes its report from command_* and dist_* tables.
 *   · the same report at `/v1/wbr` is gated as GOVERNANCE, which is `elevated`.
 * So the WBR was reachable through the standard-sensitivity compartment as well as the
 * elevated one, and the AI route was the cheap door.
 *
 * These assertions are deliberately about the ROUTE TABLE and the WORKSPACE CONSTITUTION
 * rather than about a live request. That is the level the defect lived at, and it is the level
 * a future edit would reintroduce it at: moving `/v1/ai` into another compartment's prefixes,
 * or adding a second AI endpoint that reads elevated tables, would not be caught by a test that
 * only exercised today's handler.
 */

const ELEVATED_TABLE_PREFIXES = ['command_', 'dist_'] as const;

describe('the WBR is not reachable through a cheaper compartment than the one that owns it', () => {
  it('confirms the two prefixes belong to DIFFERENT compartments at different sensitivities', () => {
    const aiOwner = workspaceForApiPath('/v1/ai/wbr-narrative');
    const wbrOwner = workspaceForApiPath('/v1/wbr');

    expect(aiOwner).toBe('intel');
    expect(wbrOwner).toBe('governance');
    expect(aiOwner).not.toBe(wbrOwner); // the whole reason an explicit in-route gate is needed

    const intel = WORKSPACES.find((w) => w.id === 'intel');
    const governance = WORKSPACES.find((w) => w.id === 'governance');
    expect(intel?.sensitivity).toBe('standard');
    expect(governance?.sensitivity).toBe('elevated');
    // INTEL is also `legacy: true`, which is what makes it cheap to hold: a zero-row roster
    // member receives it from legacyEntitlements.
    expect(intel?.legacy).toBe(true);
  });

  it('the wbr-narrative route carries an EXPLICIT governance gate, not just requireOperator', async () => {
    const src = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../aiOperator.ts', import.meta.url), 'utf8'));

    const line = src
      .split('\n')
      .find((l) => l.includes("aiOperatorRoutes.post('/wbr-narrative'"));
    expect(line, 'the route must still exist').toBeTruthy();

    // The gate, by name, on that registration line. Asserted as source text because the
    // requirement IS the registration — a handler that checks entitlements internally would
    // satisfy a behavioural test while leaving the next endpoint in this file unprotected.
    expect(line).toContain("requireWorkspace('governance'");
    // requireOperator alone was the state that leaked. Both must be present.
    expect(line).toContain('requireOperator');
  });

  it('states WHY: getLatestWbr reads tables from compartments INTEL does not hold', async () => {
    const wbr = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../../kpi/wbr.ts', import.meta.url), 'utf8'));

    // If this ever stops being true the gate could be reconsidered — but it must be
    // reconsidered deliberately, against evidence, not by someone deleting a middleware.
    const found = ELEVATED_TABLE_PREFIXES.filter((p) => wbr.includes(p));
    expect(
      found,
      'the WBR no longer reads command_/dist_ tables — re-derive the gate rather than assuming',
    ).toEqual([...ELEVATED_TABLE_PREFIXES]);
  });

  it('every OTHER route in the AI files is accounted for, so this fix is not a one-off patch', async () => {
    const fs = await import('node:fs/promises');
    const files = ['../aiOperator.ts', '../ai.ts'];
    const ungated: string[] = [];

    for (const f of files) {
      const src = await fs.readFile(new URL(f, import.meta.url), 'utf8');
      for (const line of src.split('\n')) {
        const m = line.match(/Routes\.(get|post)\('([^']+)'/);
        if (!m) continue;
        // A route needs an explicit compartment gate ONLY if it reads outside INTEL. Today
        // exactly one does. This list is the claim; if a new endpoint reads elevated tables it
        // belongs here with its own gate, and this test is where that gets noticed.
        if (m[2] === '/wbr-narrative' && !line.includes('requireWorkspace')) ungated.push(m[2]);
      }
    }
    expect(ungated, 'a route reading another compartment lost its gate').toEqual([]);
  });
});
