import { Badge } from '@/components/ui';
import { NarrativeGap, StateNotes, useStateNarrative } from '@/data/stateNarrative';
import { toBadgeStatus } from '@/lib/formatting';
import { State, Status } from '@/types/ontology';

interface StateInspectorPanelProps {
  state: State;
  effectiveStatus?: Status;
}

export function StateInspectorPanel({ state, effectiveStatus }: StateInspectorPanelProps) {
  const displayStatus = effectiveStatus || state.status;
  /* Every structured field below still renders on the first frame. Only the two prose fields
     wait, because they were moved out of the entry chunk — see `data/stateNarrative.tsx`. */
  const narrative = useStateNarrative(state.abbreviation);

  return (
    <div className="space-y-4 text-xs leading-relaxed text-navy">
      <div className="flex flex-wrap gap-2">
        <Badge status={toBadgeStatus(displayStatus)}>{displayStatus}</Badge>
        <span className="rounded-full border border-line px-2.5 py-0.5 uppercase tracking-wider text-[10px] font-mono">
          {state.phase}
        </span>
        <span className="rounded-full border border-line px-2.5 py-0.5 uppercase tracking-wider text-[10px] font-mono">
          {state.tier}
        </span>
      </div>

      <div className="space-y-2 border-b border-line pb-3">
        <p>
          <span className="font-semibold text-grey block uppercase text-[9px] tracking-wider">
            Regime Type
          </span>{' '}
          {state.regimeType}
        </p>
        <p>
          <span className="font-semibold text-grey block uppercase text-[9px] tracking-wider">
            Launch Priority
          </span>{' '}
          {state.priority}
        </p>
        {state.regulator && (
          <p>
            <span className="font-semibold text-grey block uppercase text-[9px] tracking-wider">
              {state.tier !== 'Unresearched' ? 'State Regulator' : 'Coverage Status'}
            </span>{' '}
            {state.regulator}
          </p>
        )}
      </div>

      {state.tier !== 'Unresearched' && (
        <div className="space-y-2 border-b border-line pb-3">
          {state.minNetWorth && (
            <p>
              <span className="font-semibold text-grey block uppercase text-[9px] tracking-wider">
                Minimum Corporate Net Worth
              </span>{' '}
              <span className="font-mono">{state.minNetWorth}</span>
            </p>
          )}
          {state.suretyBond && (
            <p>
              <span className="font-semibold text-grey block uppercase text-[9px] tracking-wider">
                Surety Bond Collateral
              </span>{' '}
              <span className="font-mono">{state.suretyBond}</span>
            </p>
          )}
          {state.sandboxAvailable !== undefined && (
            <p>
              <span className="font-semibold text-grey block uppercase text-[9px] tracking-wider">
                Regulatory Sandbox
              </span>{' '}
              {state.sandboxAvailable ? 'Exemption Available' : 'None'}
            </p>
          )}
          {/* THREE OUTCOMES, NOT TWO. `sandboxNotes` is genuinely absent for 5 of the 50
              jurisdictions, so "no note recorded" is a real answer here — but it is only a real
              answer once the asset has arrived. Rendering nothing while the fetch is in flight
              (or after it failed) would print that real answer over a fault. */}
          {narrative.state === 'ready' ? (
            narrative.narrative.sandboxNotes ? (
              <p className="italic text-grey-dark pl-2 border-l border-line">
                &ldquo;{narrative.narrative.sandboxNotes}&rdquo;
              </p>
            ) : (
              <p className="font-mono text-[10px] uppercase tracking-wider text-grey">
                No sandbox note recorded
              </p>
            )
          ) : (
            <NarrativeGap read={narrative} subject={`${state.name}'s sandbox note`} />
          )}
          <p>
            <span className="font-semibold text-grey block uppercase text-[9px] tracking-wider">
              NMLS Registration
            </span>{' '}
            {state.nmlsRequired ? 'Required (Apply via NMLS)' : 'Not Used / Exempt'}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {state.estCost && (
          <p>
            <span className="font-semibold text-grey block uppercase text-[9px] tracking-wider">
              Estimated {state.tier !== 'Unresearched' ? 'Fees' : 'Cost'}
            </span>{' '}
            <span className="font-mono">{state.estCost}</span>
          </p>
        )}
        {state.estTimeline && (
          <p>
            <span className="font-semibold text-grey block uppercase text-[9px] tracking-wider">
              Estimated {state.tier !== 'Unresearched' ? 'Pipeline Duration' : 'Timeline'}
            </span>{' '}
            <span className="font-mono">{state.estTimeline}</span>
          </p>
        )}
        <div>
          <span className="font-semibold text-grey block uppercase text-[9px] tracking-wider">
            Operational Notes
          </span>{' '}
          {/* Every one of the 50 jurisdictions HAS operational notes, so there is no
              legitimately-empty case here: `StateNotes` refuses on loading and on fault. */}
          <StateNotes state={state} className="text-xs" />
        </div>
      </div>
    </div>
  );
}
