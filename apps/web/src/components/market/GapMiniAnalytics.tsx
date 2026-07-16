import { useMemo } from 'react';
import { Crosshair, BarChart3 } from 'lucide-react';
import type { GapRow } from '@/lib/api/bd';
import { BarChartH } from '@/components/charts';
import { Card, CardBody, CardHeader } from '@/components/ui';
import { biggestOpportunity, fmtUsd, topExchangesByCoverage } from './gapMatrix';

/**
 * Matrix sidebar: where the gaps cluster (venues ranked by coverage) and
 * the single biggest opportunity in the screen, with its "why".
 */
export interface GapMiniAnalyticsProps {
  rows: GapRow[];
  onInspect: (id: string) => void;
}

export function GapMiniAnalytics({ rows, onInspect }: GapMiniAnalyticsProps) {
  const coverage = useMemo(() => topExchangesByCoverage(rows, 8), [rows]);
  const opportunity = useMemo(() => biggestOpportunity(rows), [rows]);

  if (rows.length === 0) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex items-center gap-1.5">
          <BarChart3 size={12} /> Venues by gap coverage
        </CardHeader>
        <CardBody>
          <p className="mb-2 text-micro text-grey">
            Of the {rows.length} gap projects shown, how many are live on each venue — where competitors
            already collected the listing fee LCX hasn't.
          </p>
          <BarChartH data={coverage} formatValue={(v) => `${v}`} />
        </CardBody>
      </Card>

      {opportunity && (
        <Card status="conditional">
          <CardHeader className="flex items-center gap-1.5">
            <Crosshair size={12} /> Biggest single opportunity
          </CardHeader>
          <CardBody>
            <button
              type="button"
              onClick={() => onInspect(opportunity.project.id)}
              className="text-left text-body font-bold text-navy hover:underline"
              title={`Inspect ${opportunity.project.name}`}
            >
              {opportunity.project.name}
              {opportunity.project.ticker && (
                <span className="ml-1.5 font-mono text-micro font-semibold text-grey">
                  {opportunity.project.ticker}
                </span>
              )}
            </button>
            <div className="mt-1 font-mono text-micro text-grey">
              priority {opportunity.project.priorityScore} × {opportunity.project.exchangeCount} venues ={' '}
              <span className="font-bold text-amber-700 dark:text-amber-400">{opportunity.score}</span>
            </div>
            <p className="mt-2 text-micro leading-relaxed text-grey">{opportunity.why}</p>
            <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-micro text-grey">
              <span>Market cap</span>
              <span className="text-right font-mono font-semibold text-navy">
                {fmtUsd(opportunity.project.marketCapUsd)}
              </span>
              <span>Propensity</span>
              <span className="text-right font-mono font-semibold text-navy">
                {opportunity.project.propensityScore}
              </span>
              <span>Verified contact</span>
              <span className="text-right font-mono font-semibold text-navy">
                {opportunity.project.verifiedContactCount > 0 ? 'yes' : 'none yet'}
              </span>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
