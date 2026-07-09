// Competitive product matrix: which competitor offers which LCX product.
// Key: competitor ID. Value: array of product IDs they offer.
// Based on comprehensive competitive intelligence research (July 2026).

export const competitorProductMap: Record<string, string[]> = {
  coinbase: [
    'spot_exchange', 'advanced_terminal', 'mobile_app', 'api_websocket', 'token_listings',
    'recurring_buys', 'qualified_custody', 'cold_storage', 'insured_custody',
    'fiat_ramp_usd', 'fiat_ramp_eur', 'card_products', 'merchant_gateway',
    'btc_eth_listing', 'staking', 'liquid_staking', 'earn_vaults', 'prime_brokerage',
    'institutional_staking', 'market_making', 'collateralized_lending', 'corporate_treasury',
    'institutional_reporting', 'fund_admin', 'defi_gateway', 'web3_wallet', 'portfolio_tracker',
    'tax_reporting', 'ai_trading_assistant',
  ],
  kraken: [
    'spot_exchange', 'advanced_terminal', 'mobile_app', 'api_websocket', 'token_listings',
    'qualified_custody', 'cold_storage', 'fiat_ramp_usd', 'fiat_ramp_eur',
    'btc_eth_listing', 'staking', 'liquid_staking', 'otc_rfq_desk', 'prime_brokerage',
    'institutional_staking', 'market_making', 'portfolio_tracker', 'tax_reporting',
  ],
  gemini: [
    'spot_exchange', 'api_websocket', 'qualified_custody', 'cold_storage', 'insured_custody',
    'fiat_ramp_usd', 'card_products', 'btc_eth_listing', 'staking', 'earn_vaults',
    'corporate_treasury',
  ],
  binance_us: [],
  robinhood: [
    'spot_exchange', 'mobile_app', 'recurring_buys', 'fiat_ramp_usd', 'card_products',
    'btc_eth_listing', 'web3_wallet', 'portfolio_tracker', 'tax_reporting',
  ],
  crypto_com: [
    'spot_exchange', 'advanced_terminal', 'mobile_app', 'api_websocket', 'token_listings',
    'recurring_buys', 'fiat_ramp_usd', 'fiat_ramp_eur', 'card_products', 'merchant_gateway',
    'btc_eth_listing', 'staking', 'liquid_staking', 'earn_vaults', 'web3_wallet',
    'portfolio_tracker', 'tax_reporting', 'copy_trading', 'lcx_token',
  ],
  okx: [
    'spot_exchange', 'advanced_terminal', 'mobile_app', 'api_websocket', 'token_listings',
    'btc_eth_listing', 'staking', 'liquid_staking', 'earn_vaults', 'copy_trading',
    'dual_investment', 'web3_wallet', 'defi_gateway', 'cross_chain_swaps', 'portfolio_tracker',
  ],
  bitstamp: ['spot_exchange', 'api_websocket', 'fiat_ramp_eur', 'fiat_ramp_usd', 'btc_eth_listing', 'staking'],
  kucoin: ['spot_exchange', 'btc_eth_listing', 'copy_trading', 'web3_wallet'],
  bybit: ['spot_exchange', 'advanced_terminal', 'api_websocket', 'btc_eth_listing', 'staking', 'liquid_staking', 'copy_trading', 'dual_investment'],
  anchorage: [
    'qualified_custody', 'cold_storage', 'insured_custody', 'mpc_wallets',
    'institutional_staking', 'collateralized_lending', 'prime_brokerage',
    'corporate_treasury', 'institutional_reporting', 'fund_admin', 'otc_rfq_desk',
  ],
  fireblocks: [
    'mpc_wallets', 'tokenization_platform', 'travel_rule_solution', 'defi_gateway',
    'white_label_exchange', 'corporate_treasury', 'mpc_wallets',
  ],
  circle: [
    'stablecoin_issuance', 'fiat_ramp_usd', 'fiat_ramp_eur', 'merchant_gateway',
    'cross_chain_swaps', 'compliance_as_a_service',
  ],
  ripple: [
    'qualified_custody', 'cold_storage', 'mpc_wallets', 'stablecoin_issuance',
    'cross_chain_swaps', 'fiat_ramp_usd', 'fiat_ramp_eur', 'institutional_staking',
    'corporate_treasury',
  ],
  figure: [
    'spot_exchange', 'collateralized_lending', 'prime_brokerage',
    'rwa_tokenization', 'btc_eth_listing',
  ],
  securitize: [
    'rwa_tokenization', 'token_lifecycle', 'launchpad', 'mica_white_papers',
    'tokenization_platform', 'btc_eth_listing',
  ],
  ondo: [
    'rwa_tokenization', 'earn_vaults', 'token_lifecycle', 'launchpad',
  ],
  franklin_templeton: ['rwa_tokenization', 'btc_eth_listing'],
  superstate: ['rwa_tokenization', 'earn_vaults'],
  taurus: [
    'qualified_custody', 'tokenization_platform', 'mpc_wallets', 'cold_storage',
    'white_label_exchange',
  ],
  bitgo: [
    'qualified_custody', 'cold_storage', 'insured_custody', 'mpc_wallets',
    'institutional_staking', 'defi_gateway', 'corporate_treasury', 'prime_brokerage',
    'institutional_reporting',
  ],
};

// Convenience: get competitors that DO offer a product
export function competitorsOfferingProduct(productId: string, allIds: string[]): string[] {
  return allIds.filter(id => (competitorProductMap[id] || []).includes(productId));
}

// Convenience: get products that NO competitor offers (white space opportunities)
export function findWhiteSpaceProducts(productIds: string[], allCompetitorIds: string[]): string[] {
  const covered = new Set<string>();
  allCompetitorIds.forEach(cid => {
    (competitorProductMap[cid] || []).forEach(pid => covered.add(pid));
  });
  return productIds.filter(pid => !covered.has(pid));
}
