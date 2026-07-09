import { Product } from '@/types/ontology';

export const products: Product[] = [
  {
    id: 'NONCUSTODIAL_WALLET', name: 'Non-Custodial Wallet / API (Architecture Option A)',
    description: 'Software/API platform with third-party custody (e.g. Fireblocks, BitGo); user holds keys. Zero state licensing burden beyond federal MSB registration. Cannot offer fiat ramps under this model.',
    category: 'DeFi', status: 'Conditional', phase: 'Pre-launch',
    requirements: ['MSB_REG', 'SANCTIONS_SCREENING'], risks: ['Cannot offer fiat ramps while remaining non-custodial'], sourceAuthority: 1,
    howeyScore: 15,
    howeyAnalysis: {
      investmentOfMoney: 'No. Users purchase software access or license keys, but there is no capital pooling for investment.',
      commonEnterprise: 'No. Control points are decentralized; user maintains absolute custody of their private keys.',
      profitExpectation: 'No. Used purely as a software storage utility, not as an investment contract.',
      effortsOfOthers: 'No. Platform is self-operated; user manages their own security and wallet interactions.'
    }
  },
  {
    id: 'FIAT_RAMP', name: 'Fiat On/Off Ramp',
    description: 'Third-party custody payment rail. Requires a banking partner and, in most states, an MTL — routed model with no direct crypto custody by LCX USA.',
    category: 'Fiat', status: 'Conditional', phase: 'Phase 2',
    requirements: ['MSB_REG', 'STATE_MTL', 'BANKING_PARTNER'], risks: ['Bank de-risking of crypto-adjacent accounts'], sourceAuthority: 1,
    howeyScore: 20,
    howeyAnalysis: {
      investmentOfMoney: 'No. Fiat transactions represent a bilateral exchange of fiat for digital commodity tokens.',
      commonEnterprise: 'No. The relationship is transactional; no pooling of capital for business enterprise.',
      profitExpectation: 'No. Used for transactional liquidity, not capital appreciation from others’ efforts.',
      effortsOfOthers: 'No. Operation relies on mechanical routing and banking APIs, not management-driven profits.'
    }
  },
  {
    id: 'CUSTODY', name: 'Custody & Vault (Segregated, Architecture Option B)',
    description: 'Customer funds held in segregated accounts; LCX USA never pools funds. Enables fiat ramps and institutional trust. MTL required in most states except Wyoming (SPDI charter route).',
    category: 'Custody', status: 'Blocked', phase: 'Phase 2',
    requirements: ['STATE_MTL', 'CUSTODY_QUALIFIED'], risks: ['Segregated custody still requires state-by-state MTL'], sourceAuthority: 1,
    howeyScore: 25,
    howeyAnalysis: {
      investmentOfMoney: 'No. Customer deposits assets for safekeeping; funds are not invested or pooled to generate returns.',
      commonEnterprise: 'No. Segregated storage models separate customer property; no shared enterprise exists.',
      profitExpectation: 'No. Expectation is vault-like security, not investment yield or capital gains.',
      effortsOfOthers: 'No. Storage operations are passive; no active managerial efforts to increase asset value.'
    }
  },
  {
    id: 'EXCHANGE', name: 'Retail Spot Exchange (Omnibus Custody, Architecture Option C)',
    description: 'Full-service exchange with omnibus wallets; LCX USA controls all keys. Highest licensing burden — MTL + BitLicense (NY) + DFAL (CA) + WY SPDI where applicable — but maximum product flexibility.',
    category: 'Exchange', status: 'Blocked', phase: 'Phase 3',
    requirements: ['STATE_MTL', 'NY_BITLICENSE_REQ', 'CA_DFAL_REQ', 'CUSTODY_QUALIFIED', 'SAR_PROGRAM'], risks: ['Highest aggregate licensing burden', 'Custody concentration risk'], sourceAuthority: 1,
    howeyScore: 45,
    howeyAnalysis: {
      investmentOfMoney: 'No. Exchange enables bilateral spot trading of tokens; no direct capital pooling by the exchange.',
      commonEnterprise: 'No. Trade matching engine acts as an intermediary, although omnibus wallet consolidation requires careful segregation.',
      profitExpectation: 'No. Trading utility and speed are the expectations, not investment return from the exchange itself.',
      effortsOfOthers: 'No. Trade results depend on independent market forces, not the exchange management.'
    }
  },
  {
    id: 'STABLECOIN_RAILS', name: 'Stablecoin Payment Rails',
    description: 'USDC/USDT and similar fiat-backed stablecoins used for fiat ramps and fee payment. Not currently treated as a security by SEC/CFTC (no yield = no investment contract), but receiving/sending stablecoins can independently trigger MTL as fungible value transmission.',
    category: 'Stablecoin', status: 'Conditional', phase: 'Phase 2',
    requirements: ['STATE_MTL', 'TOKEN_LEGAL_OPINION'], risks: ['Reserve composition / redemption / issuer risk', 'De-peg risk'], sourceAuthority: 1,
    howeyScore: 30,
    howeyAnalysis: {
      investmentOfMoney: 'No. stablecoins are purchased for fiat parity (1:1), not as an investment of capital.',
      commonEnterprise: 'No. Reserves are held to maintain par value, not for joint enterprise expansion.',
      profitExpectation: 'No. Standard stablecoins do not offer yield, interest, or expectations of capital gains.',
      effortsOfOthers: 'No. Par value is maintained mechanically by asset reserves, not active management efforts.'
    }
  },
  {
    id: 'LCX_TOKEN', name: 'LCX Token',
    description: 'Exchange/utility token issued by an LCX-affiliated entity, used for fee discounts, platform access, rewards, and potential launchpad utility. Staking and burn mechanics increase investment-contract risk.',
    category: 'Token', status: 'Blocked', phase: 'Phase 3',
    requirements: ['TOKEN_LEGAL_OPINION', 'MARKETING_DISCLOSURE'], risks: [
      'Likely a security under Howey (investment of money, common enterprise, profit expectation from LCX’s efforts)',
      'Self-listing and affiliated market making create a material conflict-of-interest disclosure burden',
      'Staking/yield programs and burn mechanics increase investment-contract risk',
    ], sourceAuthority: 2,
    howeyScore: 75,
    howeyAnalysis: {
      investmentOfMoney: 'Yes. Token is purchased on platforms in exchange for fiat or other virtual currencies.',
      commonEnterprise: 'Yes. Funds are pooled in LCX smart contracts and treasury; value is tied to the expansion of the LCX ecosystem.',
      profitExpectation: 'Yes. Deflationary burn mechanics and yield/staking rewards create a clear expectation of financial returns.',
      effortsOfOthers: 'Yes. Token value relies directly on the managerial efforts of LCX to build out the exchange, tokenization rails, and marketing campaigns.'
    }
  },
  {
    id: 'BTC', name: 'Bitcoin (BTC)',
    description: 'Decentralized payment/store-of-value commodity with no issuer. Not a security per SEC/CFTC statements; NYDFS Greenlist-approved since 2015.',
    category: 'Token', status: 'Ready', phase: 'Phase 1',
    requirements: ['STATE_MTL'], risks: ['Standard MTL exposure on the transmission/custody side only'], sourceAuthority: 1,
    howeyScore: 5,
    howeyAnalysis: {
      investmentOfMoney: 'No. Decentralized launch; no capital pooling for a common enterprise.',
      commonEnterprise: 'No. Fully decentralized proof-of-work network with no central coordination group or issuer.',
      profitExpectation: 'No. Primarily used as a store of value or transactional medium; no investment contract.',
      effortsOfOthers: 'No. Network is maintained by a global pool of independent miners; no managerial efforts dictate price.'
    }
  },
  {
    id: 'ETH', name: 'Ethereum (ETH)',
    description: 'Payment/governance commodity post-merge. Not currently treated as a security by the SEC; NYDFS Greenlist-approved since 2022. Native/liquid staking requires additional disclosure.',
    category: 'Token', status: 'Ready', phase: 'Phase 1',
    requirements: ['STATE_MTL'], risks: ['Staking mechanics and validator risk require disclosure'], sourceAuthority: 1,
    howeyScore: 15,
    howeyAnalysis: {
      investmentOfMoney: 'No. Consistently categorized as a commodity post-merge by the CFTC and SEC.',
      commonEnterprise: 'No. Maintained by a decentralized validator network.',
      profitExpectation: 'No. Used primarily as gas for smart contract execution and native staking utility.',
      effortsOfOthers: 'No. Price fluctuations result from decentralized application utility and global supply/demand.'
    }
  },
];
