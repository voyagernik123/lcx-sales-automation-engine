import { Rocket } from 'lucide-react';
import { PageTitle } from '@/components/ui';

/**
 * DISTRIBUTION COMMAND — the compartment exists before its instruments
 * (LCX ONE Phase 1). The deep ontology, growth engines, and cockpit land in
 * Phases 3–5; this surface marks the territory and states the mission so the
 * workspace switcher never opens onto a blank wall.
 */
export function DistributionHome() {
  return (
    <div className="p-5">
      <PageTitle
        icon={<Rocket size={20} />}
        subtitle="PayAgent DISTRIBUTION COMMAND — rails, listings, campaigns, and the growth engines"
      >
        Distribution
      </PageTitle>

      <div className="mt-4 max-w-2xl rounded-lg border border-line bg-card p-5 shadow-card">
        <p className="text-label text-grey-dark">
          This compartment is live and access-controlled — the platform-within-the-platform for
          distributing <span className="font-semibold text-navy">PayAgent by LCX AI Labs</span> end to end.
        </p>
        <ul className="mt-3 space-y-1.5 font-mono text-micro text-grey">
          <li>Phase 3 — the distribution deep ontology (rails, surfaces, competitors, gaps G1–G8)</li>
          <li>Phase 4 — growth decision engines + the x402 seller layer</li>
          <li>Phase 5 — the cockpit: presence dial, listing ops, campaign ops, GEO console</li>
          <li>Phase 6 — the governed loop: compliance-gated campaigns, budget caps, monitors</li>
          <li>Phase 7 — the distribution AI operator</li>
        </ul>
      </div>
    </div>
  );
}
