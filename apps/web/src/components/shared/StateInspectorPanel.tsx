import { Badge } from '@/components/ui';
import { toBadgeStatus } from '@/lib/formatting';
import { State, Status } from '@/types/ontology';

interface StateInspectorPanelProps {
  state: State;
  effectiveStatus?: Status;
}

export function StateInspectorPanel({ state, effectiveStatus }: StateInspectorPanelProps) {
  const displayStatus = effectiveStatus || state.status;

  return (
    <div className="space-y-4 text-xs leading-relaxed text-navy dark:text-ice">
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
          {state.sandboxNotes && (
            <p className="italic text-grey-dark pl-2 border-l border-line">
              &ldquo;{state.sandboxNotes}&rdquo;
            </p>
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
        <p>
          <span className="font-semibold text-grey block uppercase text-[9px] tracking-wider">
            Operational Notes
          </span>{' '}
          {state.notes}
        </p>
      </div>
    </div>
  );
}
