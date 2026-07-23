# LCX COMMAND — Strategy Extract (Phase 0 / SOURCE MATERIAL)

**Generated:** 23 July 2026 · **Source:** `LCX_US_Strategy_AllPhases` (the 4-phase LCX US strategy: Liquidity Partners, Payment Rails, Waitlist Growth, Listing Business) plus the LCX Liberty DeFi Launch Roadmap, USA Team Action Plan V3, and the DeFi Narrative.

**Status:** This is the pre-build extraction the master brief requires *before* Phase 1 code. It is a faithful synthesis of the strategy already produced. Per the brief's rule, anything the strategy does not contain is left **null** and recorded in `DATA_GAPS.md` — nothing is fabricated. Planning figures are tagged as **assumptions**, not confirmed facts.

**Structured seed:** `data/seed/` — `products.json`, `partners.json`, `workstreams.json`, `tasks.json`, `launch_plan.json`, `financial_assumptions.json`, `risk_factors.json`, `decisions.json` (+ CSV mirrors). These are the seed for the ontology in Phase 3.

---

## 1. Products (5)
| Product | Type | Status | Owner |
| :-- | :-- | :-- | :-- |
| LCX Exchange USA | US spot CEX | In planning | Samaksh Wangnoo |
| Liberty Chain | OP-Stack L2 | Testnet (Meridian) live; mainnet planned | Anurag Verma |
| Liberty DEX | DEX | In progress (via MasterDEX) | Ishan / Nikhil |
| Liberty Wallet | Self-custody wallet | Beta planned | Anurag Verma |
| LCX Liberty Explorer | Block explorer | Live (testnet) | Anurag Verma |

The operating model for the exchange: **LCX-in-the-middle** (principal — buys/sells from LPs, sells to users), **custody stays at LCX**, DeFi line alongside.

## 2. Partners (38, typed)
Full records in `partners.json`. Types: **LiquidityProvider / MarketMaker, Aggregator, Prime, Custodian (off-exchange settlement), StablecoinIssuer, Bank, OnRamp, Surveillance, Compliance/KYC.**

- **Liquidity (Phase 1):** B2C2 *(anchor, onboarding)*, FalconX *(rec, 4.69)*, Cumberland/DRW *(rec, 4.57)*, Galaxy, GSR, Wintermute *(alternates)*, Flowdesk, DV Chain, Keyrock *(specialists)*; Talos *(aggregation)*; Crossover CROSSx *(non-custodial ECN)*; Coinbase Prime, Ripple Prime *(prime)*; Fireblocks *(rec settlement)*, Copper, BitGo *(settlement)*.
- **Stablecoin (Phase 2):** Circle/USDC *(anchor, Circle Mint)*, Paxos/PYUSD+USDG, Anchorage/USAT *(support)*; Tether/USDT *(hold/geoblock US)*; WLF/USD1 *(exclude pending counsel)*.
- **Banks / on-ramp (Phase 2):** Cross River *(lead sponsor bank)*, Column, Lead, FV Bank, Customers, Bank Frick; Zero Hash, Cybrid, Bridge *(embedded)*; Onramper, Transak, MoonPay *(already started)*; Plaid *(bank-link + ACH risk)*.
- **Surveillance / compliance (Phase 4/2):** Solidus Labs *(rec surveillance)*, Eventus; Sumsub/Persona *(KYC)*, Notabene *(Travel Rule)*.

Every partner's `primary_contact` and `terms` are **null** — see gaps.

## 3. Workstreams (6)
The 4 strategy phases (Liquidity, Rails, Waitlist, Listing) plus the two owned tracks — **Exchange USA** (Samaksh) and **Liberty DEX** (Anurag). See `workstreams.json`.

## 4. Tasks / Milestones + dependency graph (24)
Full graph in `tasks.json` (`depends_on` arrays). Backbone of the launch-schedule model:
- **Cross-cutting unblockers:** hire **BSA/Compliance Officer** (gates P2 & P4); **engage securities counsel** (gates P4).
- **P1:** confirm exchange model → complete B2C2 onboarding → RFI FalconX+Cumberland → Fireblocks OES → 3-LP liquidity live.
- **P2:** (BSA) → select sponsor bank + Circle Mint / FinCEN MSB → beachhead MTLs → fiat+USDC live; adopt GENIUS stablecoin policy.
- **P3:** waitlist page + referral loop → convert warm base / crypto-native ads; mainstream ads **blocked** on MSB+MTL.
- **P4:** (counsel) → listing policy + committee / surveillance / TTF → first non-security listings (depends on P1 liquidity + P2 rails + OES) → pursue BD/ATS.
- **Owned:** Exchange M1 (21 Jul) → M2 (27 Jul) → M3 (29 Jul) — **all tentative**.

## 5. Launch plan (the anchor variable)
`launch_plan.json`. **The US launch date is UNCONFIRMED** — the Action Plan marks the Exchange milestones (21/27/29 Jul 2026) as *tentative*, and the DeFi roadmap runs L0→L12 (13 Jul → Q3–Q4 2026). Treat the launch date as the anchor variable everything keys off, and flag it as unconfirmed in the launch-schedule Monte Carlo (Phase 6). Gating dependencies are enumerated (BSA officer, counsel, bank, MSB, MTL, 3-LP, OES, fiat, surveillance, listing policy).

## 6. Financial assumptions (13 — mostly planning)
`financial_assumptions.json`. These become simulation inputs — but most are **planning assumptions**, not confirmed company figures: waitlist budgets (Lean $25k / Base $100k / Aggressive $300k), CAC ranges ($30–60 crypto-native; $100–200 general), funnel conversions (planning), MTL cost ($50k–500k+/state; national 7-figure/12–18 mo), and known pricing models (B2C2 spread-only; Circle Mint 1:1 no fee; card on-ramp 3.5–5.5%). No confirmed internal revenue/volume/capital/runway numbers were present in the strategy — recorded as gaps.

## 7. Risk factors (12)
`risk_factors.json`, categorised (Regulatory / Operational / Market / Technical / Program) with likelihood × impact and mitigations. Critical: token misclassification; US entity/licensing not in place. High: BSA-officer hire, GENIUS permissibility, LP counterparty risk, banking concentration, reward-design securities line, $LCX self-listing conflict, unconfirmed launch date.

## 8. Decisions (24)
`decisions.json` — the full cross-phase decisions register, each with a recommended option and `status: open`. These seed the Decision objects in Phase 7.

---

### Note on brief vs. strategy scope
The master brief references **tokenized precious-metals distribution** and a **MetalsDistributor** partner type. The current 4-phase strategy does **not** cover a metals-distribution workstream or name metals distributors — it covers liquidity, rails, waitlist, and listings, with RWA/tokenization appearing only as a Liberty Chain ambition (Phase 4 end-state). This divergence is recorded in `DATA_GAPS.md`; the ontology includes a MetalsDistributor type but it is currently unpopulated.
