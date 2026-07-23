# LCX COMMAND — Data Gaps

**Generated:** 23 July 2026. Per the master brief's non-fabrication rule, every field the strategy does not contain is left **null** in `data/seed/` and listed here. Fix these at the source before they propagate into the ontology and every downstream simulation.

## Critical gaps (resolve before Phase 1 approval)
1. **Launch date is unconfirmed.** Exchange milestones (M1 21 Jul, M2 27 Jul, M3 29 Jul 2026) are tagged *tentative*; the DeFi roadmap spans 13 Jul → Q3–Q4 2026. The launch date is the anchor for the flagship launch-schedule simulation — confirm it, or the model runs on a placeholder.
2. **Partner contacts — all null.** No named contacts, emails, or relationship owners for any of the 38 partners. Needed for the Action/outreach layer (Phase 8).
3. **Partner commercial terms — all null.** No spreads, fees, credit lines, min sizes, or signed terms (these come from the Phase 1/2 RFIs, not yet run).
4. **Exchange model undecided.** CLOB + market-making vs riskless-principal RFQ is open (decision `dec_01`) — it changes the task graph and integration.
5. **No confirmed internal financials.** No confirmed revenue, trading-volume, capital, runway, or fee-tier figures were present. All financial figures in seed are **planning assumptions or public benchmarks** (`assumption:true`), not company numbers. Real figures needed for the revenue/volume and treasury/runway simulations.

## High gaps
6. **BSA/Compliance Officer** — not yet hired (task `t_bsa`, status pending). Gates Phases 2 & 4.
7. **Securities counsel** — not engaged (`t_counsel`). Gates every listing decision.
8. **US entity & licensing status** — MSB/state MTLs not confirmed in place; no BD/ATS. Which legal entity contracts (LCX USA Inc. vs LCX Liberty Labs Inc.) is inconsistent across source docs — confirm.
9. **State coverage** — the beachhead states LCX can serve at launch are undecided (drives Phase 3 addressable audience).
10. **Deal pipeline values / close probabilities** — partners have a qualitative `pipeline_stage` but no deal value or probability; the Deal object is under-specified for the partner-pipeline forecast.
11. **Capability scores** are LCX-COMMAND analyst assessments (from the phase scorecards), not commercial rankings — do not treat as confirmed.

## Scope divergences (brief vs. strategy)
12. **Tokenized precious-metals distribution / MetalsDistributor partners** — referenced in the master brief but **not covered** in the 4-phase strategy. No metals distributors are named. The ontology keeps a MetalsDistributor type but it is empty. Decide whether metals distribution is in scope; if so it needs its own research pass (a "Phase 5"-style workstream) before it can be modelled.
13. **RWA / tokenization** appears only as a Liberty Chain ambition (Phase 4 end-state), not a detailed workstream — light on partners, assets, and economics.

## Data-quality notes
14. One source doc contains a known typo carried through from the roadmap ("HoldRetain" rating on the DEX Explorer row) — cosmetic, flagged for cleanup at source.
15. Owners are taken from the Action Plan / roadmap where stated; some tasks list a team/role rather than a named person.

## Recommendation
Resolve items 1–5 (and ideally 6–9) at the source before approving Phase 1. The extract is designed so that filling these in `data/seed/` re-seeds the whole platform cleanly — fix here, not downstream.
