/**
 * LCX COMMAND seed data (Wave 1) — the US-launch strategy extract, compiled to a
 * TS module so it bundles into dist (prod runs compiled JS; tsc does not copy
 * .json). Source of truth mirrors apps/api/src/seed/command/*.json.
 * Non-fabrication rule: null fields are gaps, never invented. DO NOT hand-edit;
 * regenerate from the JSON if the strategy changes.
 */
export const COMMAND_SEED = {
  "products": [
    {
      "id": "prod_exchange_usa",
      "name": "LCX Exchange USA",
      "type": "CEX",
      "status": "in_planning",
      "owner": "Samaksh Wangnoo",
      "notes": "US spot exchange; LCX-in-the-middle (principal); custody at LCX; segregated order books (model to confirm).",
      "source": "Action Plan Track 01; Master Strategy"
    },
    {
      "id": "prod_liberty_chain",
      "name": "Liberty Chain (LCX Liberty Chain)",
      "type": "Chain",
      "status": "testnet",
      "owner": "Anurag Verma",
      "notes": "OP Stack L2, EVM; Meridian testnet + explorer live; mainnet + framework GA targeted; RWA/tokenization.",
      "source": "DeFi Launch Roadmap; Narrative"
    },
    {
      "id": "prod_liberty_dex",
      "name": "Liberty DEX",
      "type": "DEX",
      "status": "in_progress",
      "owner": "Ishan/Nikhil",
      "notes": "dex.lcx.com; built via MasterDEX acquisition; non-custodial swap + portfolio.",
      "source": "Roadmap L7; MasterDEX audit"
    },
    {
      "id": "prod_liberty_wallet",
      "name": "Liberty Wallet",
      "type": "Wallet",
      "status": "beta_planned",
      "owner": "Anurag Verma",
      "notes": "Self-custody EVM browser extension + mobile; beta (testnet), GA planned.",
      "source": "Roadmap L5/L6; Wallet Privacy Policy"
    },
    {
      "id": "prod_liberty_explorer",
      "name": "LCX Liberty Explorer (Meridian)",
      "type": "Explorer",
      "status": "live_testnet",
      "owner": "Anurag Verma",
      "notes": "Block explorer for Liberty Chain testnet.",
      "source": "Roadmap L1"
    }
  ],
  "partners": [
    {
      "id": "pt_b2c2",
      "name": "B2C2",
      "type": "LiquidityProvider",
      "subtype": "Principal market maker",
      "pipeline_stage": "incumbent_onboarding",
      "capability_score": 4.37,
      "tier": "Tier 1",
      "primary_contact": null,
      "terms": null,
      "notes": "Anchor LP; SBI-owned; first OTC LP under MiCA; B2C2 USA Inc (FinCEN MSB, FL); on Fireblocks Network. Onboarding started.",
      "source": "Phase 1"
    },
    {
      "id": "pt_falconx",
      "name": "FalconX",
      "type": "LiquidityProvider",
      "subtype": "Prime broker + principal LP",
      "pipeline_stage": "recommended_rfi",
      "capability_score": 4.69,
      "tier": "Tier 1",
      "primary_contact": null,
      "terms": null,
      "notes": "Only CFTC-registered crypto swap dealer; 400+ tokens; 24/7 electronic options; full prime stack.",
      "source": "Phase 1"
    },
    {
      "id": "pt_cumberland",
      "name": "Cumberland (DRW)",
      "type": "LiquidityProvider",
      "subtype": "Principal market maker",
      "pipeline_stage": "recommended_rfi",
      "capability_score": 4.57,
      "tier": "Tier 1",
      "primary_contact": null,
      "terms": null,
      "notes": "NY BitLicense; DRW-backed; top-two OTC depth; BTC/ETH options + futures basis.",
      "source": "Phase 1"
    },
    {
      "id": "pt_galaxy",
      "name": "Galaxy Digital",
      "type": "LiquidityProvider",
      "subtype": "Principal OTC",
      "pipeline_stage": "alternate",
      "capability_score": 4.16,
      "tier": "Tier 2",
      "primary_contact": null,
      "terms": null,
      "notes": "US-listed (Nasdaq GLXY); OTC spot+derivs; options & forwards; lending.",
      "source": "Phase 1"
    },
    {
      "id": "pt_gsr",
      "name": "GSR",
      "type": "LiquidityProvider",
      "subtype": "Market maker",
      "pipeline_stage": "alternate",
      "capability_score": 4.1,
      "tier": "Tier 2",
      "primary_contact": null,
      "terms": null,
      "notes": "200+ assets, 25 fiat; bespoke options & structured derivatives.",
      "source": "Phase 1"
    },
    {
      "id": "pt_wintermute",
      "name": "Wintermute",
      "type": "LiquidityProvider",
      "subtype": "Algorithmic MM/OTC",
      "pipeline_stage": "alternate",
      "capability_score": 4.05,
      "tier": "Tier 2",
      "primary_contact": null,
      "terms": null,
      "notes": "~$15B/day; US HQ (NYC) 2025; OTC options growing; confirm US entity.",
      "source": "Phase 1"
    },
    {
      "id": "pt_flowdesk",
      "name": "Flowdesk",
      "type": "LiquidityProvider",
      "subtype": "MMaaS",
      "pipeline_stage": "specialist",
      "capability_score": 3.65,
      "tier": "Tier 3",
      "primary_contact": null,
      "terms": null,
      "notes": "Market-Making-as-a-Service for exchanges; MiCA CASP; best plug-in fit.",
      "source": "Phase 1"
    },
    {
      "id": "pt_dvchain",
      "name": "DV Chain (DV Trading)",
      "type": "LiquidityProvider",
      "subtype": "Principal OTC + white-label",
      "pipeline_stage": "specialist",
      "capability_score": 3.53,
      "tier": "Tier 3",
      "primary_contact": null,
      "terms": null,
      "notes": "White-label OTC tech stack; same-day USD/EUR/CAD settlement.",
      "source": "Phase 1"
    },
    {
      "id": "pt_keyrock",
      "name": "Keyrock",
      "type": "LiquidityProvider",
      "subtype": "MM + OTC + options",
      "pipeline_stage": "specialist",
      "capability_score": 3.63,
      "tier": "Tier 3",
      "primary_contact": null,
      "terms": null,
      "notes": "85+ venues; Liechtenstein entity (LCX AG jurisdiction).",
      "source": "Phase 1"
    },
    {
      "id": "pt_talos",
      "name": "Talos",
      "type": "Aggregator",
      "subtype": "OEMS / multi-dealer",
      "pipeline_stage": "evaluate",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "One integration to 70-100+ LPs; best-ex routing; not an LP itself.",
      "source": "Phase 1"
    },
    {
      "id": "pt_crossover",
      "name": "Crossover Markets (CROSSx)",
      "type": "LiquidityProvider",
      "subtype": "Execution-only ECN (non-custodial)",
      "pipeline_stage": "evaluate",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "Non-custodial agency venue; strong custody-at-LCX fit; US spot since Jun 2025.",
      "source": "Phase 1"
    },
    {
      "id": "pt_coinbaseprime",
      "name": "Coinbase Prime",
      "type": "Prime",
      "subtype": "Prime broker (custody+trade+finance)",
      "pipeline_stage": "evaluate",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "NY qualified custodian; multi-venue execution; competitor-adjacent.",
      "source": "Phase 1"
    },
    {
      "id": "pt_rippleprime",
      "name": "Ripple Prime (ex-Hidden Road)",
      "type": "Prime",
      "subtype": "Prime broker / clearing",
      "pipeline_stage": "evaluate",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "Clears $3T+/yr; acquired by Ripple $1.25B (Oct 2025).",
      "source": "Phase 1"
    },
    {
      "id": "pt_fireblocks",
      "name": "Fireblocks",
      "type": "Custodian",
      "subtype": "Off-exchange settlement / MPC",
      "pipeline_stage": "recommended",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "Network/Off-Exchange settlement; B2C2 on it; likely settlement backbone.",
      "source": "Phase 1/2"
    },
    {
      "id": "pt_copper",
      "name": "Copper (ClearLoop)",
      "type": "Custodian",
      "subtype": "Off-exchange settlement",
      "pipeline_stage": "evaluate",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "Assets in Copper MPC custody; net settlement; UAE VASP.",
      "source": "Phase 1"
    },
    {
      "id": "pt_bitgo",
      "name": "BitGo (Go Network)",
      "type": "Custodian",
      "subtype": "Qualified custody + OES",
      "pipeline_stage": "evaluate",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "US qualified custodian; off-exchange settlement.",
      "source": "Phase 1/4"
    },
    {
      "id": "pt_circle",
      "name": "Circle (USDC/EURC)",
      "type": "StablecoinIssuer",
      "subtype": "GENIUS-aligned issuer",
      "pipeline_stage": "recommended",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "Anchor USDC rail via Circle Mint (1:1, no spread); CCTP cross-chain.",
      "source": "Phase 2"
    },
    {
      "id": "pt_paxos",
      "name": "Paxos (PYUSD/USDG)",
      "type": "StablecoinIssuer",
      "subtype": "Regulated issuer",
      "pipeline_stage": "support",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "Route to PYUSD & USDG; NYDFS trust; OCC charter in progress.",
      "source": "Phase 2"
    },
    {
      "id": "pt_anchorage_usat",
      "name": "Anchorage / USAT",
      "type": "StablecoinIssuer",
      "subtype": "US-compliant Tether product",
      "pipeline_stage": "support",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "USAT (issued by Anchorage Digital Bank N.A.) = US-compliant Tether option (launched Jan 2026).",
      "source": "Phase 2"
    },
    {
      "id": "pt_tether",
      "name": "Tether (USDT)",
      "type": "StablecoinIssuer",
      "subtype": "Non-US issuer",
      "pipeline_stage": "hold_geoblock",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "USDT not yet GENIUS-permitted for US persons; hold/geoblock until Treasury determination.",
      "source": "Phase 2"
    },
    {
      "id": "pt_wlf_usd1",
      "name": "World Liberty Financial (USD1)",
      "type": "StablecoinIssuer",
      "subtype": "Unconfirmed PPSI",
      "pipeline_stage": "exclude_pending_counsel",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "PPSI status unconfirmed; do NOT support for US until counsel confirms ('handle USD1 with care').",
      "source": "Phase 2"
    },
    {
      "id": "pt_crossriver",
      "name": "Cross River Bank",
      "type": "Bank",
      "subtype": "Sponsor bank (FBO + rails)",
      "pipeline_stage": "recommended",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "Banks Circle/Coinbase; fiat+USDC platform (Nov 2025). Lead sponsor-bank candidate.",
      "source": "Phase 2"
    },
    {
      "id": "pt_column",
      "name": "Column",
      "type": "Bank",
      "subtype": "API-native bank",
      "pipeline_stage": "alternate",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "ACH/wire/FedNow via API.",
      "source": "Phase 2"
    },
    {
      "id": "pt_lead",
      "name": "Lead Bank",
      "type": "Bank",
      "subtype": "BaaS FBO",
      "pipeline_stage": "alternate",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "Fintech/crypto BaaS.",
      "source": "Phase 2"
    },
    {
      "id": "pt_fvbank",
      "name": "FV Bank",
      "type": "Bank",
      "subtype": "USD + digital-asset custody",
      "pipeline_stage": "alternate",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "USD accounts + stablecoin deposits.",
      "source": "Phase 2"
    },
    {
      "id": "pt_customers",
      "name": "Customers Bank",
      "type": "Bank",
      "subtype": "High-volume settlement",
      "pipeline_stage": "alternate",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "Institutional/high-volume settlement.",
      "source": "Phase 2"
    },
    {
      "id": "pt_bankfrick",
      "name": "Bank Frick",
      "type": "Bank",
      "subtype": "Liechtenstein bank",
      "pipeline_stage": "evaluate",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "Used by Kraken; LCX AG jurisdiction synergy; confirm US-person servicing.",
      "source": "Phase 2"
    },
    {
      "id": "pt_zerohash",
      "name": "Zero Hash",
      "type": "OnRamp",
      "subtype": "Embedded rails (rent)",
      "pipeline_stage": "evaluate",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "USD ACH+wire + USDC + settlement + regulatory cover; 50+ MTLs, BitLicense.",
      "source": "Phase 2"
    },
    {
      "id": "pt_cybrid",
      "name": "Cybrid",
      "type": "OnRamp",
      "subtype": "Embedded stablecoin settlement",
      "pipeline_stage": "evaluate",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "Zero Hash alternative.",
      "source": "Phase 2"
    },
    {
      "id": "pt_bridge",
      "name": "Bridge (Stripe)",
      "type": "OnRamp",
      "subtype": "Stablecoin orchestration",
      "pipeline_stage": "evaluate",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "Issuance/FX/payouts; best for stablecoin+global payout.",
      "source": "Phase 2"
    },
    {
      "id": "pt_onramper",
      "name": "Onramper",
      "type": "OnRamp",
      "subtype": "On-ramp aggregator",
      "pipeline_stage": "in_progress",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "ALREADY STARTED. Aggregates 30+ on-ramps.",
      "source": "Phase 2/Roadmap"
    },
    {
      "id": "pt_transak",
      "name": "Transak",
      "type": "OnRamp",
      "subtype": "On-ramp",
      "pipeline_stage": "in_progress",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "ALREADY STARTED. ACH+card, 49 US states.",
      "source": "Phase 2/Roadmap"
    },
    {
      "id": "pt_moonpay",
      "name": "MoonPay",
      "type": "OnRamp",
      "subtype": "On-ramp",
      "pipeline_stage": "in_progress",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "ALREADY STARTED. Cards/Apple/Google Pay.",
      "source": "Phase 2/Roadmap"
    },
    {
      "id": "pt_plaid",
      "name": "Plaid",
      "type": "OnRamp",
      "subtype": "Bank-linking + ACH risk",
      "pipeline_stage": "recommended",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "Auth/Identity/Balance/Signal; ACH fraud tooling.",
      "source": "Phase 2"
    },
    {
      "id": "pt_solidus",
      "name": "Solidus Labs",
      "type": "Surveillance",
      "subtype": "Trade surveillance",
      "pipeline_stage": "recommended",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "Crypto-native manipulation/wash/spoofing monitoring; ~$16T/day.",
      "source": "Phase 4"
    },
    {
      "id": "pt_eventus",
      "name": "Eventus",
      "type": "Surveillance",
      "subtype": "Trade surveillance",
      "pipeline_stage": "alternate",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "Surveillance alternative.",
      "source": "Phase 4"
    },
    {
      "id": "pt_sumsub",
      "name": "Sumsub / Persona",
      "type": "Compliance",
      "subtype": "KYC/KYB",
      "pipeline_stage": "select",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "Identity verification + AML; Sumsub bundles Travel Rule.",
      "source": "Phase 2/3"
    },
    {
      "id": "pt_notabene",
      "name": "Notabene",
      "type": "Compliance",
      "subtype": "Travel Rule",
      "pipeline_stage": "select",
      "capability_score": null,
      "tier": null,
      "primary_contact": null,
      "terms": null,
      "notes": "VASP-to-VASP Travel Rule messaging.",
      "source": "Phase 2"
    }
  ],
  "workstreams": [
    {
      "id": "ws_p1",
      "name": "Phase 1 — Liquidity Partners",
      "owner": "BD / Anurag",
      "status": "active",
      "source": "Master Strategy"
    },
    {
      "id": "ws_p2",
      "name": "Phase 2 — Payment Rails",
      "owner": "Compliance / BD",
      "status": "active",
      "source": "Master Strategy"
    },
    {
      "id": "ws_p3",
      "name": "Phase 3 — Waitlist Growth",
      "owner": "Marketing",
      "status": "active",
      "source": "Master Strategy"
    },
    {
      "id": "ws_p4",
      "name": "Phase 4 — Listing Business",
      "owner": "Legal / Product",
      "status": "planning",
      "source": "Master Strategy"
    },
    {
      "id": "ws_exusa",
      "name": "Exchange USA (owned)",
      "owner": "Samaksh Wangnoo",
      "status": "active",
      "source": "Action Plan Track 01"
    },
    {
      "id": "ws_ldex",
      "name": "Liberty DEX (owned)",
      "owner": "Anurag Verma",
      "status": "active",
      "source": "Action Plan Track 02"
    }
  ],
  "tasks": [
    {
      "id": "t_bsa",
      "workstream": "cross",
      "title": "Hire BSA/Compliance Officer",
      "owner": "Exec/HR",
      "target_date": null,
      "status": "pending",
      "depends_on": [],
      "notes": "Critical-path dependency for Phases 2 & 4.",
      "source": "Action Plan; Master Strategy"
    },
    {
      "id": "t_counsel",
      "workstream": "ws_p4",
      "title": "Engage US securities counsel",
      "owner": "Legal/Monty",
      "target_date": null,
      "status": "not_started",
      "depends_on": [],
      "notes": "Gate for every listing decision + stablecoin/reward guardrails.",
      "source": "Phase 4"
    },
    {
      "id": "t_model",
      "workstream": "ws_p1",
      "title": "Confirm exchange model (CLOB+MM vs RFQ)",
      "owner": "Product/Anurag",
      "target_date": null,
      "status": "open",
      "depends_on": [],
      "notes": "Drives LP integration + settlement design.",
      "source": "Phase 1"
    },
    {
      "id": "t_b2c2_onb",
      "workstream": "ws_p1",
      "title": "Complete B2C2 onboarding (anchor LP)",
      "owner": "BD",
      "target_date": null,
      "status": "in_progress",
      "depends_on": [
        "t_model"
      ],
      "notes": "Anchor LP; already started.",
      "source": "Roadmap; Phase 1"
    },
    {
      "id": "t_lp_rfi",
      "workstream": "ws_p1",
      "title": "Issue LP RFI to FalconX + Cumberland",
      "owner": "BD",
      "target_date": null,
      "status": "not_started",
      "depends_on": [
        "t_model"
      ],
      "notes": "Price spreads/credit/settlement.",
      "source": "Phase 1"
    },
    {
      "id": "t_oes",
      "workstream": "ws_p1",
      "title": "Stand up off-exchange settlement (Fireblocks)",
      "owner": "Eng/Security",
      "target_date": null,
      "status": "not_started",
      "depends_on": [
        "t_b2c2_onb"
      ],
      "notes": "Keeps custody at LCX.",
      "source": "Phase 1"
    },
    {
      "id": "t_3lp",
      "workstream": "ws_p1",
      "title": "Integrate 3-LP liquidity live",
      "owner": "Eng/Trading",
      "target_date": null,
      "status": "not_started",
      "depends_on": [
        "t_lp_rfi",
        "t_oes"
      ],
      "notes": "B2C2 + FalconX + Cumberland.",
      "source": "Phase 1"
    },
    {
      "id": "t_bankselect",
      "workstream": "ws_p2",
      "title": "Select sponsor bank + Circle Mint",
      "owner": "BD/Eng",
      "target_date": null,
      "status": "not_started",
      "depends_on": [
        "t_bsa"
      ],
      "notes": "Cross River lead; USDC via Circle Mint.",
      "source": "Phase 2"
    },
    {
      "id": "t_msb",
      "workstream": "ws_p2",
      "title": "FinCEN MSB registration",
      "owner": "Compliance",
      "target_date": null,
      "status": "not_started",
      "depends_on": [
        "t_bsa"
      ],
      "notes": "Federal baseline.",
      "source": "Phase 2"
    },
    {
      "id": "t_mtl",
      "workstream": "ws_p2",
      "title": "Beachhead state MTL plan (excl NY)",
      "owner": "Compliance/Legal",
      "target_date": null,
      "status": "not_started",
      "depends_on": [
        "t_msb"
      ],
      "notes": "Rent cover first; build footprint.",
      "source": "Phase 2"
    },
    {
      "id": "t_fiat_live",
      "workstream": "ws_p2",
      "title": "Fiat (ACH/wire) + USDC live in beachhead",
      "owner": "Eng",
      "target_date": null,
      "status": "not_started",
      "depends_on": [
        "t_bankselect",
        "t_mtl"
      ],
      "notes": "Deposit/withdrawal rails.",
      "source": "Phase 2"
    },
    {
      "id": "t_stablepolicy",
      "workstream": "ws_p2",
      "title": "Adopt GENIUS stablecoin policy",
      "owner": "Compliance/Product",
      "target_date": null,
      "status": "open",
      "depends_on": [
        "t_counsel"
      ],
      "notes": "USDC anchor + PYUSD/USDG/USAT; hold USDT; exclude USD1.",
      "source": "Phase 2"
    },
    {
      "id": "t_waitlist_tool",
      "workstream": "ws_p3",
      "title": "Stand up waitlist page + referral loop",
      "owner": "Marketing/Eng",
      "target_date": null,
      "status": "not_started",
      "depends_on": [],
      "notes": "Viral Loops; position-based rewards.",
      "source": "Phase 3"
    },
    {
      "id": "t_warm_base",
      "workstream": "ws_p3",
      "title": "Convert warm US base (email/in-app)",
      "owner": "Marketing",
      "target_date": null,
      "status": "not_started",
      "depends_on": [
        "t_waitlist_tool"
      ],
      "notes": "50%+ of LCX.com is US.",
      "source": "Phase 3"
    },
    {
      "id": "t_cryptoads",
      "workstream": "ws_p3",
      "title": "Crypto-native ad tests",
      "owner": "Growth",
      "target_date": null,
      "status": "not_started",
      "depends_on": [
        "t_waitlist_tool"
      ],
      "notes": "HypeLab/Bitmedia/Coinzilla; sub-$60 CAC.",
      "source": "Phase 3"
    },
    {
      "id": "t_mainstream_ads",
      "workstream": "ws_p3",
      "title": "Mainstream paid (Google/Meta/X)",
      "owner": "Growth",
      "target_date": null,
      "status": "blocked",
      "depends_on": [
        "t_msb",
        "t_mtl"
      ],
      "notes": "Gated by certification + licensing.",
      "source": "Phase 3"
    },
    {
      "id": "t_listpolicy",
      "workstream": "ws_p4",
      "title": "Listing & delisting policy + committee",
      "owner": "Legal/Product",
      "target_date": null,
      "status": "not_started",
      "depends_on": [
        "t_counsel"
      ],
      "notes": "With DD framework.",
      "source": "Phase 4"
    },
    {
      "id": "t_surveil",
      "workstream": "ws_p4",
      "title": "Select market-surveillance vendor",
      "owner": "Compliance/Eng",
      "target_date": null,
      "status": "not_started",
      "depends_on": [],
      "notes": "Solidus Labs lead.",
      "source": "Phase 4"
    },
    {
      "id": "t_ttf",
      "workstream": "ws_p4",
      "title": "Adopt Token Transparency Framework",
      "owner": "Product/Legal",
      "target_date": null,
      "status": "not_started",
      "depends_on": [],
      "notes": "Industry disclosure standard.",
      "source": "Phase 4"
    },
    {
      "id": "t_first_listings",
      "workstream": "ws_p4",
      "title": "List first non-security majors",
      "owner": "Legal/Product",
      "target_date": null,
      "status": "not_started",
      "depends_on": [
        "t_listpolicy",
        "t_surveil",
        "t_3lp",
        "t_fiat_live",
        "t_oes"
      ],
      "notes": "BTC/ETH/USDC + vetted handful; each with counsel opinion.",
      "source": "Phase 4"
    },
    {
      "id": "t_bdats",
      "workstream": "ws_p4",
      "title": "Pursue broker-dealer + ATS (securities/RWA)",
      "owner": "Legal",
      "target_date": null,
      "status": "future",
      "depends_on": [
        "t_first_listings"
      ],
      "notes": "12-24 mo; or CFTC reg if CLARITY passes.",
      "source": "Phase 4"
    },
    {
      "id": "m_ex_m1",
      "workstream": "ws_exusa",
      "title": "Exchange M1 — onboarding live (web)",
      "owner": "Samaksh",
      "target_date": "2026-07-21",
      "status": "tentative",
      "depends_on": [],
      "notes": "Landing + user onboarding.",
      "source": "Action Plan Track 01"
    },
    {
      "id": "m_ex_m2",
      "workstream": "ws_exusa",
      "title": "Exchange M2 — deposits/withdrawals + mobile",
      "owner": "Samaksh",
      "target_date": "2026-07-27",
      "status": "tentative",
      "depends_on": [
        "m_ex_m1"
      ],
      "notes": "Money in/out; app to stores.",
      "source": "Action Plan Track 01"
    },
    {
      "id": "m_ex_m3",
      "workstream": "ws_exusa",
      "title": "Exchange M3 — full platform launch",
      "owner": "Samaksh",
      "target_date": "2026-07-29",
      "status": "tentative",
      "depends_on": [
        "m_ex_m2"
      ],
      "notes": "Buy/Sell, Referral, Dep/Wd live.",
      "source": "Action Plan Track 01"
    }
  ],
  "decisions": [
    {
      "id": "dec_01",
      "phase": "P1",
      "decision": "Exchange model",
      "recommendation": "RFQ/riskless-principal to launch; reconcile 'segregated order books'",
      "status": "open"
    },
    {
      "id": "dec_02",
      "phase": "P1",
      "decision": "Launch asset scope",
      "recommendation": "BTC/ETH/USDC + top majors first",
      "status": "open"
    },
    {
      "id": "dec_03",
      "phase": "P1",
      "decision": "Sourcing architecture",
      "recommendation": "Hybrid: direct B2C2+FalconX+Cumberland, Talos overlay later",
      "status": "open"
    },
    {
      "id": "dec_04",
      "phase": "P1",
      "decision": "Settlement/custody",
      "recommendation": "Fireblocks off-exchange settlement",
      "status": "open"
    },
    {
      "id": "dec_05",
      "phase": "P1",
      "decision": "Keep B2C2 as anchor",
      "recommendation": "Yes",
      "status": "open"
    },
    {
      "id": "dec_06",
      "phase": "P1",
      "decision": "Number of LPs at launch",
      "recommendation": "3 (B2C2+FalconX+Cumberland)",
      "status": "open"
    },
    {
      "id": "dec_07",
      "phase": "P2",
      "decision": "Build vs rent licensing",
      "recommendation": "Rent-first hybrid; build MTLs in parallel",
      "status": "open"
    },
    {
      "id": "dec_08",
      "phase": "P2",
      "decision": "Fiat: bank vs embedded",
      "recommendation": "Sponsor bank + Circle Mint",
      "status": "open"
    },
    {
      "id": "dec_09",
      "phase": "P2",
      "decision": "State scope at launch",
      "recommendation": "Beachhead, exclude NY",
      "status": "open"
    },
    {
      "id": "dec_10",
      "phase": "P2",
      "decision": "Stablecoin list",
      "recommendation": "USDC anchor + PYUSD/USDG/USAT; hold USDT; exclude USD1",
      "status": "open"
    },
    {
      "id": "dec_11",
      "phase": "P2",
      "decision": "USDC rail",
      "recommendation": "Circle Mint direct",
      "status": "open"
    },
    {
      "id": "dec_12",
      "phase": "P2",
      "decision": "Instant rails at launch",
      "recommendation": "ACH+wire baseline; add FedNow/RTP; card via aggregators",
      "status": "open"
    },
    {
      "id": "dec_13",
      "phase": "P3",
      "decision": "Paid budget",
      "recommendation": "Base ~$100k, scale on proof",
      "status": "open"
    },
    {
      "id": "dec_14",
      "phase": "P3",
      "decision": "Reward model",
      "recommendation": "Position/non-cash only",
      "status": "open"
    },
    {
      "id": "dec_15",
      "phase": "P3",
      "decision": "Waitlist target & deadline",
      "recommendation": "25k by launch (base)",
      "status": "open"
    },
    {
      "id": "dec_16",
      "phase": "P3",
      "decision": "State scope for invites",
      "recommendation": "Licensed-states beachhead (mirror P2)",
      "status": "open"
    },
    {
      "id": "dec_17",
      "phase": "P3",
      "decision": "Waitlist/referral tool",
      "recommendation": "Viral Loops",
      "status": "open"
    },
    {
      "id": "dec_18",
      "phase": "P3",
      "decision": "Mainstream-paid timing",
      "recommendation": "Gate on certification + licence",
      "status": "open"
    },
    {
      "id": "dec_19",
      "phase": "P4",
      "decision": "Listing path",
      "recommendation": "Hybrid — non-security now, build toward BD/ATS",
      "status": "open"
    },
    {
      "id": "dec_20",
      "phase": "P4",
      "decision": "Launch listing set",
      "recommendation": "BTC/ETH/USDC + vetted handful; $LCX only with counsel",
      "status": "open"
    },
    {
      "id": "dec_21",
      "phase": "P4",
      "decision": "Securities counsel",
      "recommendation": "External securities firm now",
      "status": "open"
    },
    {
      "id": "dec_22",
      "phase": "P4",
      "decision": "Surveillance vendor",
      "recommendation": "Solidus Labs",
      "status": "open"
    },
    {
      "id": "dec_23",
      "phase": "P4",
      "decision": "Adopt Token Transparency Framework",
      "recommendation": "Yes",
      "status": "open"
    },
    {
      "id": "dec_24",
      "phase": "P4",
      "decision": "Sequencing vs CLARITY",
      "recommendation": "Proceed under current law; treat CLARITY as upside",
      "status": "open"
    }
  ],
  "risks": [
    {
      "id": "rf_classify",
      "category": "Regulatory",
      "title": "Token misclassification (listing a security)",
      "likelihood": "Medium",
      "impact": "Critical",
      "mitigation": "Counsel-opinion gate; non-security-first; adopt TTF",
      "phase": "P4"
    },
    {
      "id": "rf_licensing",
      "category": "Regulatory",
      "title": "US entity & licensing not in place (MSB/MTL; BD/ATS)",
      "likelihood": "High",
      "impact": "Critical",
      "mitigation": "Rent-first + beachhead states; build footprint; counsel",
      "phase": "P1/P2/P4"
    },
    {
      "id": "rf_bsa",
      "category": "Operational",
      "title": "BSA/Compliance Officer not yet hired",
      "likelihood": "High",
      "impact": "High",
      "mitigation": "Prioritise the hire — gates two phases",
      "phase": "P2/P4"
    },
    {
      "id": "rf_genius",
      "category": "Regulatory",
      "title": "GENIUS stablecoin permissibility",
      "likelihood": "Medium",
      "impact": "High",
      "mitigation": "Support only permitted coins; hold USDT; exclude USD1; counsel",
      "phase": "P2"
    },
    {
      "id": "rf_counterparty",
      "category": "Market",
      "title": "LP counterparty/credit risk",
      "likelihood": "Medium",
      "impact": "High",
      "mitigation": "Off-exchange settlement; spread flow across 3 LPs",
      "phase": "P1"
    },
    {
      "id": "rf_bank",
      "category": "Operational",
      "title": "Banking concentration (post-2023 failures)",
      "likelihood": "Medium",
      "impact": "High",
      "mitigation": "Primary + backup sponsor bank",
      "phase": "P2"
    },
    {
      "id": "rf_reward",
      "category": "Regulatory",
      "title": "Reward design crosses securities line",
      "likelihood": "Medium",
      "impact": "High",
      "mitigation": "Non-token/position rewards; counsel on any token",
      "phase": "P3"
    },
    {
      "id": "rf_adgate",
      "category": "Operational",
      "title": "Mainstream paid gated by certification+licence",
      "likelihood": "High",
      "impact": "Medium",
      "mitigation": "Front-load crypto-native/organic; big paid later",
      "phase": "P3"
    },
    {
      "id": "rf_model",
      "category": "Technical",
      "title": "Exchange-model ambiguity (CLOB vs RFQ)",
      "likelihood": "Medium",
      "impact": "Medium",
      "mitigation": "Decide before integration",
      "phase": "P1"
    },
    {
      "id": "rf_fraud",
      "category": "Operational",
      "title": "ACH returns / card chargebacks",
      "likelihood": "Medium",
      "impact": "Medium",
      "mitigation": "Plaid Signal + 7-day holds; underwriter",
      "phase": "P2/P3"
    },
    {
      "id": "rf_lcxconflict",
      "category": "Regulatory",
      "title": "$LCX self-listing conflict/optics",
      "likelihood": "Medium",
      "impact": "High",
      "mitigation": "Independent legal opinion + governance controls",
      "phase": "P4"
    },
    {
      "id": "rf_launchdate",
      "category": "Program",
      "title": "Launch date unconfirmed / tentative",
      "likelihood": "High",
      "impact": "High",
      "mitigation": "Confirm the anchor; simulate schedule risk",
      "phase": "All"
    }
  ],
  "financialAssumptions": [
    {
      "id": "fa_wl_lean",
      "area": "Phase 3 waitlist",
      "item": "Lean paid budget",
      "value": 25000,
      "unit": "USD",
      "assumption": true,
      "source": "Phase 3 model"
    },
    {
      "id": "fa_wl_base",
      "area": "Phase 3 waitlist",
      "item": "Base paid budget",
      "value": 100000,
      "unit": "USD",
      "assumption": true,
      "source": "Phase 3 model"
    },
    {
      "id": "fa_wl_aggr",
      "area": "Phase 3 waitlist",
      "item": "Aggressive paid budget",
      "value": 300000,
      "unit": "USD",
      "assumption": true,
      "source": "Phase 3 model"
    },
    {
      "id": "fa_cac_exch",
      "area": "Phase 3 waitlist",
      "item": "Crypto-exchange signup CAC (general)",
      "value": "100-200",
      "unit": "USD",
      "assumption": true,
      "source": "HypeLab benchmarks"
    },
    {
      "id": "fa_cac_native",
      "area": "Phase 3 waitlist",
      "item": "Crypto-native ad CAC",
      "value": "30-60",
      "unit": "USD",
      "assumption": true,
      "source": "HypeLab (50-70% lower)"
    },
    {
      "id": "fa_wl_lpconv",
      "area": "Phase 3 waitlist",
      "item": "Waitlist LP conversion",
      "value": "15-30",
      "unit": "%",
      "assumption": true,
      "source": "GetWaitlist benchmarks"
    },
    {
      "id": "fa_verify",
      "area": "Phase 3 funnel",
      "item": "Waitlist→verified (KYC)",
      "value": 55,
      "unit": "%",
      "assumption": true,
      "source": "Phase 3 model (planning)"
    },
    {
      "id": "fa_funded",
      "area": "Phase 3 funnel",
      "item": "Verified→funded",
      "value": 45,
      "unit": "%",
      "assumption": true,
      "source": "Phase 3 model (planning)"
    },
    {
      "id": "fa_mtl_state",
      "area": "Phase 2 licensing",
      "item": "State MTL cost each",
      "value": "50000-500000+",
      "unit": "USD",
      "assumption": false,
      "source": "Finextra MTL guide 2026"
    },
    {
      "id": "fa_mtl_natl",
      "area": "Phase 2 licensing",
      "item": "National MTL footprint",
      "value": "7-figure; 12-18 months",
      "unit": "USD/time",
      "assumption": false,
      "source": "Finextra MTL guide 2026"
    },
    {
      "id": "fa_b2c2_fee",
      "area": "Phase 1 liquidity",
      "item": "B2C2 pricing model",
      "value": "spread-only, no per-tx fee",
      "unit": "model",
      "assumption": false,
      "source": "B2C2"
    },
    {
      "id": "fa_circle_fee",
      "area": "Phase 2 stablecoin",
      "item": "Circle Mint USDC mint/redeem",
      "value": "1:1, no spread, no issuance fee",
      "unit": "model",
      "assumption": false,
      "source": "Circle Mint"
    },
    {
      "id": "fa_card_fee",
      "area": "Phase 2 on-ramp",
      "item": "Card on-ramp fee",
      "value": "3.5-5.5",
      "unit": "%",
      "assumption": false,
      "source": "Transak/MoonPay"
    }
  ],
  "launchPlan": {
    "anchor_variable": "US launch date — TREAT AS UNCONFIRMED. Action Plan lists Exchange milestones M1 21 Jul, M2 27 Jul, M3 29 Jul 2026 as 'tentative'. Confirm before using as a hard anchor.",
    "targets": [
      {
        "name": "Exchange USA M1 (onboarding)",
        "date": "2026-07-21",
        "confirmed": false
      },
      {
        "name": "Exchange USA M2 (deposits + mobile)",
        "date": "2026-07-27",
        "confirmed": false
      },
      {
        "name": "Exchange USA M3 (full platform)",
        "date": "2026-07-29",
        "confirmed": false
      },
      {
        "name": "DeFi line (Liberty) L0–L12",
        "date": "2026-07-13 to Q3-Q4 2026",
        "confirmed": false,
        "note": "Roadmap L0 Foundation → L12 first tokenization."
      }
    ],
    "gating_dependencies": [
      "t_bsa",
      "t_counsel",
      "t_bankselect",
      "t_msb",
      "t_mtl",
      "t_3lp",
      "t_oes",
      "t_fiat_live",
      "t_surveil",
      "t_listpolicy"
    ],
    "source": "Action Plan Track 01/04; DeFi Launch Roadmap; Master Strategy"
  }
} as const;
