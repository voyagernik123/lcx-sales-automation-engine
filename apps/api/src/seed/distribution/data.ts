/**
 * DISTRIBUTION COMMAND — the deep ontology (LCX ONE Phase 3).
 *
 * Zero-drift reference: this module is the compiled, git-versioned, immutable
 * knowledge base for distributing PayAgent (by LCX AI Labs). Its source is the
 * graded research dossier `LCX_AGENT_DISTRIBUTION_RESEARCH.md` (2026-07-24);
 * every fact carries `srcRefs` into the SOURCES registry, graded A (primary),
 * B (reputable secondary), C (blog/aggregator synthesis). Postgres (migration
 * 0043) holds only the mutable desk state — listings, campaigns, channel-fact
 * overrides — never this.
 *
 * The web surfaces (Channel Atlas, Rails Map, Competitor Room) render straight
 * off this const; the growth engines (Phase 4) compute over it.
 */

export const DISTRIBUTION_DEEP_SEED = {
  meta: {
    product: 'PayAgent',
    builtBy: 'LCX AI Labs',
    thesis:
      'Agents are simultaneously the customer, the channel, and the referrer. Distribution = machine-legibility × machine-payability. Nobody runs it as one closed loop across both the machine economy (be discoverable + payable by agents) and the human economy (GEO, InfoFi, quests, outreach). That dual-engine loop is the 1000x opening.',
    asOf: '2026-07-24',
    dossier: 'LCX_AGENT_DISTRIBUTION_RESEARCH.md',
  },

  /* ── The product we distribute ── */
  payAgent: {
    tagline: 'The Stripe for AI agents — 10 billion agents by 2030, every one needs to pay and get paid.',
    custody: 'non-custodial (humans) · managed agent wallets (agents)',
    fees: [
      { mode: 'Standard', fee: '2 LCX', creatorReward: '1 LCX', assets: 'USDC, USDT' },
      { mode: 'Pro', fee: '4 LCX', creatorReward: '2 LCX', assets: 'any ERC-20' },
    ],
    rewardLoop: 'Every paid link rewards its creator (human or agent) in LCX; payer without LCX is auto-sourced via Uniswap so payments never fail. Native token-demand + creator-yield loop no fiat rail can copy.',
    chains: ['Ethereum', 'Base', 'Arbitrum', 'Optimism', 'Polygon', 'BSC', 'Liberty Chain (planned)'],
    surfaces: ['REST API (HMAC)', '@payagent/sdk (npm)', 'payagent-mcp (Claude/Cursor)', 'Telegram bot', 'X bot', 'ERC-681 QR', 'EIP-2612 gasless permits', 'webhooks', 'referral system', 'llms.txt + SSR'],
    roadmap: ['AgentHire (A2A marketplace + escrow)', 'PayAgent crypto card (NFC)', 'hosted MCP (SSE)', 'Liberty Chain integration', 'recurring payments', 'Python/Go SDKs'],
    srcRefs: ['s_payagent', 's_payagent_about', 's_payagent_changelog'],
  },

  /* ── LAYER A — the payment-standards war (which rails to speak) ── */
  rails: [
    { id: 'x402', name: 'x402', governance: 'Linux Foundation (Coinbase-born, Cloudflare co-founder)', model: 'HTTP 402 + stablecoin micropayments; schemes exact/upto; facilitators verify+settle', traction: '167M+ tx by Apr 2026, 85% on Base; ~69K active agents; 100M-on-Base milestone Jun 3 2026', cost: '~2s settle; $0.00025 (Solana) / ~$0.01 (Base); free facilitator ≤1K tx/mo then $0.001', fitForLcx: 5, lcxNote: 'THE rail for PayAgent to speak natively; LCX could run an LCX-fee-metered facilitator', srcRefs: ['s_x402', 's_x402_cdp', 's_protocols_cmp'] },
    { id: 'acp', name: 'ACP (Agentic Commerce Protocol)', governance: 'Stripe + OpenAI, Apache 2.0', model: 'SharedPaymentTokens (single-use, merchant-scoped); merchant stays merchant-of-record; REST + MCP', traction: 'Powers ChatGPT Instant Checkout; 1M+ Shopify merchants live + Etsy/Glossier/SKIMS/URBN/Coach', cost: 'OpenAI takes 4% on ChatGPT tx + Stripe fees', fitForLcx: 3, lcxNote: 'A surface to sell THROUGH (chat commerce), not compete with; benchmark for AgentHire checkout UX', srcRefs: ['s_acp', 's_protocols_cmp'] },
    { id: 'ap2', name: 'AP2 (Agent Payments Protocol)', governance: 'Google → donated to FIDO Alliance (Apr 2026)', model: 'Verifiable-Credential Mandates (Intent/Cart/Payment) = cryptographic audit trail; v0.2 Human-Not-Present; x402 extension', traction: '60+ partners (Mastercard, PayPal, Adyen, Salesforce, ServiceNow)', cost: 'no protocol fee; card interchange applies', fitForLcx: 3, lcxNote: 'Enterprise/card audit-trail rail; mandate vocabulary mirrors our governed-action doctrine — adopt it', srcRefs: ['s_ap2', 's_protocols_cmp'] },
    { id: 'vic', name: 'Visa Intelligent Commerce', governance: 'Visa', model: 'AI-Ready tokenized card credentials, spend limits/conditions, real-time signals', traction: 'Anthropic, IBM, Microsoft, Mistral, OpenAI, Perplexity, Samsung, Stripe partners', cost: 'n/a', fitForLcx: 2, lcxNote: 'Card-side benchmark; informs the planned PayAgent NFC card controls', srcRefs: ['s_visa'] },
    { id: 'mc_agentpay', name: 'Mastercard Agent Pay', governance: 'Mastercard', model: 'Agentic tokens; Acceptance Framework interops with AP2', traction: 'PayPal partnership expansion Oct 2025', cost: 'n/a', fitForLcx: 2, lcxNote: 'Card-side; watch for AP2 interop', srcRefs: ['s_protocols_cmp'] },
    { id: 'webmcp', name: 'WebMCP', governance: 'W3C (Google + Microsoft, Feb 2026)', model: 'navigator.modelContext.registerTool() — sites expose tools to in-browser agents; SubmitEvent.agentInvoked', traction: 'Chrome 146 Canary experimental; Edge expected', cost: 'free', fitForLcx: 4, lcxNote: 'Make payagent.co itself agent-operable (register createLink/payLink) when it lands', srcRefs: ['s_protocols_cmp'] },
  ],

  /* ── LAYER B — where agents get discovered (the new app stores) ── */
  surfaces: [
    { id: 'mcp_registry', name: 'MCP registries', category: 'registry', audience: 'agent developers', submit: 'publish payagent-mcp to official registry + Smithery (715 MCPs) + mcp.so + PulseMCP w/ rich metadata', telemetry: 'installs / uses counts', constraint: null, srcRefs: ['s_mcp_registry', 's_smithery', 's_mcpso'] },
    { id: 'chatgpt_apps', name: 'ChatGPT Apps', category: 'agent-surface', audience: 'ChatGPT consumers', submit: 'Apps SDK submission (open since Dec 17 2025); monetize via ACP', telemetry: 'app directory placement', constraint: 'review + publication approval', srcRefs: ['s_chatgpt_apps'] },
    { id: 'claude_connectors', name: 'Claude connectors/skills', category: 'agent-surface', audience: 'Claude users', submit: 'PayAgent connector + skill; MCP ecosystem already normalizes x402 per-call', telemetry: null, constraint: null, srcRefs: ['s_payagent_changelog'] },
    { id: 'x402_bazaar', name: 'x402 Bazaar', category: 'discovery', audience: 'autonomous agents', submit: 'expose x402 endpoint metadata → semantic search + quality ranking; its own MCP server', telemetry: 'rank + payment volume', constraint: null, srcRefs: ['s_x402_bazaar'] },
    { id: 'agentic_market', name: 'Agentic Market (Coinbase)', category: 'marketplace', audience: 'agents', submit: 'add x402 support + endpoint metadata → discoverable, no API keys; bundles supported', telemetry: 'TPV, payments race, leaderboards', constraint: null, srcRefs: ['s_agentic_market'] },
    { id: 'okx_ai', name: 'OKX AI', category: 'marketplace', audience: 'agents + OPCs', submit: 'become a listed ASP (agent service provider); escrow on X Layer, OKB evaluator staking', telemetry: 'sold count, % positive, rating', constraint: 'ASP onboarding (KYC likely)', srcRefs: ['s_okx_ai', 's_okx_learn'] },
    { id: 'virtuals_acp', name: 'Virtuals ACP', category: 'marketplace', audience: 'tokenized agents', submit: 'agent-commerce protocol, phased; on Base/BNB/XLayer', telemetry: 'mindshare', constraint: null, srcRefs: ['s_virtuals'] },
    { id: 'moltbook', name: 'Moltbook', category: 'agent-social', audience: 'AI agents (Meta-owned Mar 2026)', submit: 'agent reads skill.md → signs up; a PayAgent agent that tips/pays publicly', telemetry: 'upvotes, verified agents', constraint: 'agent-native, humans observe', srcRefs: ['s_moltbook', 's_moltbook_meta'] },
    { id: 'galxe', name: 'Galxe', category: 'quest', audience: 'crypto users', submit: 'launch reward quests (on-chain verifiable actions); Earndrop distribution', telemetry: '1.1B+ quests completed, DAU', constraint: 'compliance-gate the rewards', srcRefs: ['s_galxe'] },
    { id: 'layer3', name: 'Layer3', category: 'quest', audience: 'crypto users', submit: 'quests → its own wallet/app', telemetry: 'quest completions', constraint: 'compliance-gate the rewards', srcRefs: ['s_layer3'] },
    { id: 'zealy', name: 'Zealy / Intract', category: 'quest', audience: 'community', submit: 'programmatic campaigns', telemetry: 'XP, completions', constraint: 'compliance-gate the rewards', srcRefs: ['s_dossier'] },
    { id: 'kaito_studio', name: 'Kaito Studio', category: 'infofi', audience: 'crypto creators', submit: 'buy curated creator distribution (vetted marketplace); mindshare analytics + Attention Markets (Polymarket)', telemetry: 'mindshare index', constraint: 'Yaps sunset Jan 2026 — curated not open farming', srcRefs: ['s_kaito', 's_kaito_sunset'] },
    { id: 'geo', name: 'GEO / AEO surfaces', category: 'answer-engine', audience: '100M+ daily AI searchers', submit: 'citable comparison content + llms.txt + docs built to be quoted; monitor via Profound-style tooling', telemetry: 'answer share-of-voice', constraint: null, srcRefs: ['s_profound'] },
    { id: 'erc8004', name: 'ERC-8004 agent identity/reputation', category: 'identity', audience: 'A2A economy', submit: 'portable agent Identity/Reputation/Validation registries on Ethereum (extends A2A)', telemetry: 'reputation score', constraint: null, srcRefs: ['s_erc8004', 's_a2a'] },
  ],

  /* ── LAYER C — human-side growth engines (post-2026 reset) ── */
  growthContext: [
    { id: 'x_ban', headline: 'X banned incentivized posting (Jan 15–16 2026)', implication: 'yap-to-earn on X is DEAD; automated posting must be labeled, low-volume, value-adding; incentive loops move on-chain + owned channels (Telegram/Farcaster/Moltbook)', srcRefs: ['s_x_ban', 's_kaito_sunset'] },
    { id: 'geo_shift', headline: 'Search became answers, not links', implication: 'SEO (rank) → AEO (be the answer) → GEO (be the cited source); win "what payment API should my agent use" queries', srcRefs: ['s_profound'] },
    { id: 'kol_agents', headline: 'Autonomous KOL agents (aixbt-class) proved self-marketing media', implication: 'an LCX "economist" agent that uses PayAgent in public = product demo as media', srcRefs: ['s_virtuals'] },
    { id: 'gtm_automation', headline: 'Fully-automated outbound is table stakes (Clay/11x/Artisan)', implication: 'our existing LCX sales engine extends to agent-developer BD; differentiation = targeting data + LCX-reward offer', srcRefs: ['s_dossier'] },
  ],

  /* ── Competitor dossiers ── */
  competitors: [
    { id: 'prava', name: 'Prava', focus: 'card-rail agentic checkout', funding: 'seed (WTFund/Nikhil Kamath), Dec 2025', playbook: 'ride Visa VIC; run an Agentic Commerce Hackathon; ship Skills/recipes onto agent surfaces (Poke); founder-led X', threat: 3, srcRefs: ['s_prava', 's_prava_tracxn'] },
    { id: 'natural', name: 'Natural', focus: 'fiat agent-bank (13 products, FDIC wallets)', funding: '$30M Series A (Forerunner) at 193 days, $40M+ total', playbook: 'onboarding IS an MCP command; investor-chorus social proof; developer-first', threat: 4, srcRefs: ['s_natural', 's_natural_seriesa'] },
    { id: 'pay3', name: 'pay3', focus: 'consumer crypto payment-link handles', funding: 'early (Gurugram)', playbook: 'the handle is the growth loop — every shared link is an ad; meme build-in-public', threat: 2, srcRefs: ['s_pay3'] },
    { id: 'skyfire', name: 'Skyfire', focus: 'agent identity + payment credentials', funding: 'n/d', playbook: 'the Agent Trust Stack — verified identity, no 403s/blocked checkouts', threat: 3, srcRefs: ['s_skyfire'] },
    { id: 'crossmint', name: 'Crossmint', focus: 'stablecoin platform + agentic cards', funding: 'n/d', playbook: 'embedded wallets, stablecoin orchestration, agentic virtual cards for enterprises', threat: 3, srcRefs: ['s_crossmint'] },
    { id: 'nevermined', name: 'Nevermined', focus: 'agent payments infra (delegate/meter/settle)', funding: 'n/d', playbook: 'across MCP/x402/A2A; "start earning in minutes"', threat: 3, srcRefs: ['s_nevermined'] },
    { id: 'payman', name: 'Payman', focus: 'agentic AI that does banking', funding: 'n/d', playbook: 'AI executes real banking on existing rails w/ controls + audit trails', threat: 2, srcRefs: ['s_payman'] },
  ],

  /* ── The reward/viral loop model (Phase-4 engines compute over these) ── */
  funnel: {
    stages: ['link created', 'link paid', 'creator earns LCX', 'active agent wallet', 'agent refers agent'],
    params: {
      standardFeeLcx: 2, standardCreatorRewardLcx: 1,
      proFeeLcx: 4, proCreatorRewardLcx: 2,
      assumedPaidLinkConversion: 0.35, // illustrative — refined in Phase 4
      assumedAgentReferralRate: 0.15,
    },
    note: 'Illustrative baselines for the Phase-4 K-factor + emission-budget engines; not confirmed metrics.',
  },

  /* ── The gap register — where nobody plays yet (G1–G8) ── */
  gaps: [
    { id: 'G1', title: 'No closed-loop distribution system', gap: 'GEO, quests, marketplaces, outreach, KOL agents all live in separate tools with no shared attribution ledger', lcxAngle: 'Point the LCX platform machinery (ontology, governed actions, monitors, WBR, Monte Carlo) at distribution — this workspace IS that loop' },
    { id: 'G2', title: 'No rail pays agents to distribute it', gap: 'referral systems exist but nobody made AGENTS the affiliate network', lcxAngle: 'LCX rewards: agents earn per link created AND per agent referred — a viral loop whose participants are software; AgentHire escrow makes it trustless' },
    { id: 'G3', title: 'Nobody is present on ALL rails', gap: 'teams pick x402 OR ACP OR AP2', lcxAngle: 'PayAgent as the multi-protocol bridge: speak x402 natively, expose ACP checkout, adopt AP2 mandate vocabulary — "one link, every rail"' },
    { id: 'G4', title: 'Exchange-grade data as agent bait underused', gap: 'CoinAnk sells derivatives data at $0.01/call, 16K sold — tiny supply, real demand', lcxAngle: 'LCX owns exchange data + token-risk/DD frameworks; x402-price them → every sale = LCX fee + PayAgent demo + lead' },
    { id: 'G5', title: 'Agent-native social empty of payment brands', gap: 'Moltbook (Meta-scale soon) has no payment-brand presence', lcxAngle: 'First-mover: a PayAgent agent on Moltbook that tips/pays publicly; skill.md onboarding mirrors Moltbook’s own trick' },
    { id: 'G6', title: 'GEO for agent-payments category uncontested', gap: '"what payment API should my agent use" answers are up for grabs', lcxAngle: 'Systematic AEO: comparison pages, llms.txt everywhere, docs built to be quoted, answer-engine SOV monitoring' },
    { id: 'G7', title: 'Post-X-ban attention vacuum', gap: 'everyone lost their yap engine simultaneously', lcxAngle: 'On-chain quests (Galxe/Layer3) + Kaito Studio curated creators + owned Telegram — compliant by construction' },
    { id: 'G8', title: 'Nobody demos with an autonomous business', gap: 'no one runs a real OPC on their own rail in public', lcxAngle: 'Launch "the first OPC run by an agent on PayAgent": sells a real service, pays its own x402 bills, invoices via PayAgent links, publishes a live P&L' },
  ],

  /* ── Compliance — the marketing-rule checklist the launch gate cites ── */
  complianceChecklist: [
    { id: 'c1', rule: 'MiCA Art. 68 — fair, clear, not-misleading marketing communications', check: 'No guaranteed-return or misleading language in campaign copy; risk warnings present.' },
    { id: 'c2', rule: 'MiCA — marketing must be identifiable as such', check: 'Token-incentivized posts/quests are clearly labeled as promotional.' },
    { id: 'c3', rule: 'Liechtenstein TVTG / FMA — token-service promotion', check: 'LCX-token rewards framed as utility, not investment inducement.' },
    { id: 'c4', rule: 'X platform policy (Jan-2026) — no incentivized posting', check: 'No pay-per-post/engagement-farming on X; incentives live on-chain / owned channels only.' },
    { id: 'c5', rule: 'Treasury/emission envelope', check: 'Projected LCX reward spend is within the approved budget cap (enforced by the emission engine).' },
    { id: 'c6', rule: 'Geo-eligibility', check: 'Campaign excludes restricted jurisdictions per LCX policy.' },
  ],

  /* ── GEO/AEO — the queries to win (the answer-engine question inventory) ── */
  geoQuestions: [
    { id: 'q1', query: 'what payment API should my AI agent use', intent: 'category', priority: 'high' },
    { id: 'q2', query: 'how can an AI agent pay for things autonomously', intent: 'category', priority: 'high' },
    { id: 'q3', query: 'crypto payment API for AI agents', intent: 'category', priority: 'high' },
    { id: 'q4', query: 'x402 alternatives / how to accept x402 payments', intent: 'rail', priority: 'medium' },
    { id: 'q5', query: 'agent wallet with spending limits', intent: 'feature', priority: 'medium' },
    { id: 'q6', query: 'Stripe for AI agents', intent: 'brand', priority: 'high' },
    { id: 'q7', query: 'MCP server for crypto payments', intent: 'feature', priority: 'medium' },
    { id: 'q8', query: 'agent-to-agent payment settlement', intent: 'category', priority: 'medium' },
  ],

  /* ── The KOL persona fleet (surfaces only; AI drafting arrives in Phase 7) ── */
  personas: [
    { id: 'economist', name: 'The Agent Economist', channel: 'Farcaster + owned blog', cadence: 'daily', beat: 'agent-economy analysis; runs a public OPC on PayAgent (G8 demo)' },
    { id: 'builder', name: 'The PayAgent Builder', channel: 'X (labeled) + Telegram', cadence: 'weekly', beat: 'dev tutorials, MCP/x402 integration threads' },
    { id: 'scout', name: 'The Rails Scout', channel: 'Moltbook + Farcaster', cadence: 'as-it-happens', beat: 'rail/standard news, protocol-war commentary' },
  ],

  /* ── Source registry (graded; SourceChip resolves srcRefs against this) ── */
  sources: [
    { id: 's_payagent', grade: 'A', label: 'PayAgent — payagent.co', url: 'https://www.payagent.co/' },
    { id: 's_payagent_about', grade: 'A', label: 'PayAgent — About', url: 'https://www.payagent.co/about' },
    { id: 's_payagent_changelog', grade: 'A', label: 'PayAgent — Changelog', url: 'https://www.payagent.co/changelog' },
    { id: 's_x402', grade: 'A', label: 'x402 (x402 Foundation)', url: 'https://www.x402.org/' },
    { id: 's_x402_cdp', grade: 'A', label: 'Coinbase CDP — x402 docs', url: 'https://docs.cdp.coinbase.com/x402/welcome' },
    { id: 's_x402_bazaar', grade: 'A', label: 'x402 Bazaar (discovery layer)', url: 'https://docs.cdp.coinbase.com/x402/bazaar' },
    { id: 's_acp', grade: 'A', label: 'Agentic Commerce Protocol', url: 'https://www.agenticcommerce.dev/' },
    { id: 's_ap2', grade: 'A', label: 'Agent Payments Protocol (Google/FIDO)', url: 'https://github.com/google-agentic-commerce/AP2' },
    { id: 's_a2a', grade: 'A', label: 'A2A Protocol', url: 'https://a2a-protocol.org/latest/' },
    { id: 's_erc8004', grade: 'A', label: 'ERC-8004 Trustless Agents', url: 'https://eips.ethereum.org/EIPS/eip-8004' },
    { id: 's_visa', grade: 'B', label: 'Visa Intelligent Commerce (PR)', url: 'https://usa.visa.com/about-visa/newsroom.html' },
    { id: 's_protocols_cmp', grade: 'C', label: 'AP2/ACP/x402 comparison (OpenHermit, May 2026)', url: 'https://www.openhermit.com/blog/agent-payment-protocols-compared' },
    { id: 's_mcp_registry', grade: 'A', label: 'Official MCP registry', url: 'https://github.com/modelcontextprotocol/registry' },
    { id: 's_smithery', grade: 'A', label: 'Smithery', url: 'https://smithery.ai/' },
    { id: 's_mcpso', grade: 'A', label: 'mcp.so', url: 'https://mcp.so/' },
    { id: 's_chatgpt_apps', grade: 'A', label: 'OpenAI Apps SDK — monetization', url: 'https://developers.openai.com/apps-sdk/' },
    { id: 's_agentic_market', grade: 'A', label: 'Agentic Market (Coinbase)', url: 'https://agentic.market/' },
    { id: 's_okx_ai', grade: 'A', label: 'OKX AI', url: 'https://www.okx.ai/' },
    { id: 's_okx_learn', grade: 'B', label: 'OKX — "A Marketplace for the Agent Economy"', url: 'https://www.okx.com/learn/okx-ai' },
    { id: 's_virtuals', grade: 'A', label: 'Virtuals Protocol', url: 'https://whitepaper.virtuals.io/' },
    { id: 's_moltbook', grade: 'A', label: 'Moltbook', url: 'https://www.moltbook.com/' },
    { id: 's_moltbook_meta', grade: 'B', label: 'Meta acquires Moltbook (TechCrunch, Mar 2026)', url: 'https://techcrunch.com/' },
    { id: 's_galxe', grade: 'A', label: 'Galxe', url: 'https://www.galxe.com/' },
    { id: 's_layer3', grade: 'A', label: 'Layer3', url: 'https://layer3.xyz/' },
    { id: 's_kaito', grade: 'A', label: 'Kaito (InfoFi)', url: 'https://docs.kaito.ai/' },
    { id: 's_kaito_sunset', grade: 'B', label: 'Kaito sunsets Yaps → Studio (CoinGecko/Gate)', url: 'https://www.coingecko.com/learn/what-is-kaito-earn-yap-points' },
    { id: 's_x_ban', grade: 'B', label: 'X bans incentivized posting (Jan 2026)', url: 'https://unchainedcrypto.com/' },
    { id: 's_profound', grade: 'A', label: 'Profound — AEO/GEO', url: 'https://www.tryprofound.com/' },
    { id: 's_prava', grade: 'A', label: 'Prava — prava.space', url: 'https://www.prava.space/' },
    { id: 's_prava_tracxn', grade: 'B', label: 'Prava profile (Tracxn)', url: 'https://tracxn.com/' },
    { id: 's_natural', grade: 'A', label: 'Natural — natural.com', url: 'https://www.natural.com/' },
    { id: 's_natural_seriesa', grade: 'A', label: 'Natural $30M Series A', url: 'https://www.natural.com/blog/natural-series-a' },
    { id: 's_pay3', grade: 'A', label: 'pay3 — pay3.so', url: 'https://pay3.so/' },
    { id: 's_skyfire', grade: 'A', label: 'Skyfire', url: 'https://www.skyfire.xyz/' },
    { id: 's_crossmint', grade: 'A', label: 'Crossmint', url: 'https://www.crossmint.com/' },
    { id: 's_nevermined', grade: 'A', label: 'Nevermined', url: 'https://nevermined.io/' },
    { id: 's_payman', grade: 'A', label: 'Payman', url: 'https://paymanai.com/' },
    { id: 's_dossier', grade: 'C', label: 'LCX Agent Distribution Research dossier (internal)', url: null },
  ],
} as const;

export type DistributionDeepSeed = typeof DISTRIBUTION_DEEP_SEED;
