# THE PRODUCTION — GALLERY · P5 · GPU charts everywhere (to the resolution floor)

> HEAD `c95cef8` · run 2026-09-02T15:42:31.283Z · 80 routes × 2 themes, captured as shipped and with every GL layer forced off
> (`window.__LCX_GL_OFF` → `createStage` refuses `FORCED_OFF_FOR_MEASUREMENT`; relief preferences seeded off).
> **GL coverage** = share of viewport pixels that differ between the two captures (any channel > 8/255). This is the
> number that says whether the 3D is VISIBLE on a route. The controls: a known 40% GL area reads 40% ± 1; identical
> captures read 0.

| | dark | light |
|---|---|---|
| pairs excluded — the two captures showed different page text (†) | 0 | 0 |
| routes where GL is visible (coverage > 5%) | **72** of 80 | **77** of 80 |
| median GL coverage of the viewport | **33%** | **44%** |

### dark

| route | as shipped | GL forced off | GL coverage | mean ΔE76 |
|---|---|---|---|---|
| `/lcxos` | ![shipped](gallery/lcxos-dark-on.webp) | ![GL off](gallery/lcxos-dark-off.webp) | **0%** | 0.0 |
| `/portal` | ![shipped](gallery/portal-dark-on.webp) | ![GL off](gallery/portal-dark-off.webp) | **0%** | 0.0 |
| `/select` | ![shipped](gallery/select-dark-on.webp) | ![GL off](gallery/select-dark-off.webp) | **0%** | 0.0 |
| `/*` | ![shipped](gallery/root-dark-on.webp) | ![GL off](gallery/root-dark-off.webp) | **39%** | 8.7 |
| `/regulatory-dashboard` | ![shipped](gallery/regulatory_dashboard-dark-on.webp) | ![GL off](gallery/regulatory_dashboard-dark-off.webp) | **7%** | 12.2 |
| `/ontology` | ![shipped](gallery/ontology-dark-on.webp) | ![GL off](gallery/ontology-dark-off.webp) | **59%** · orrery 80% | 14.5 |
| `/states` | ![shipped](gallery/states-dark-on.webp) | ![GL off](gallery/states-dark-off.webp) | **5%** | 11.4 |
| `/products` | ![shipped](gallery/products-dark-on.webp) | ![GL off](gallery/products-dark-off.webp) | **4%** | 11.8 |
| `/simulator` | ![shipped](gallery/simulator-dark-on.webp) | ![GL off](gallery/simulator-dark-off.webp) | **5%** | 11.1 |
| `/howey` | ![shipped](gallery/howey-dark-on.webp) | ![GL off](gallery/howey-dark-off.webp) | **5%** | 11.5 |
| `/scenario` | ![shipped](gallery/scenario-dark-on.webp) | ![GL off](gallery/scenario-dark-off.webp) | **5%** | 11.2 |
| `/readiness` | ![shipped](gallery/readiness-dark-on.webp) | ![GL off](gallery/readiness-dark-off.webp) | **16%** | 9.6 |
| `/brief-generator` | ![shipped](gallery/brief_generator-dark-on.webp) | ![GL off](gallery/brief_generator-dark-off.webp) | **6%** | 10.8 |
| `/capital-estimator` | ![shipped](gallery/capital_estimator-dark-on.webp) | ![GL off](gallery/capital_estimator-dark-off.webp) | **5%** | 11.2 |
| `/roadmap` | ![shipped](gallery/roadmap-dark-on.webp) | ![GL off](gallery/roadmap-dark-off.webp) | **4%** | 11.8 |
| `/red-flags` | ![shipped](gallery/red_flags-dark-on.webp) | ![GL off](gallery/red_flags-dark-off.webp) | **6%** | 11.4 |
| `/settings` | ![shipped](gallery/settings-dark-on.webp) | ![GL off](gallery/settings-dark-off.webp) | **7%** | 14.5 |
| `/competition` | ![shipped](gallery/competition-dark-on.webp) | ![GL off](gallery/competition-dark-off.webp) | **5%** | 11.2 |
| `/product-intel` | ![shipped](gallery/product_intel-dark-on.webp) | ![GL off](gallery/product_intel-dark-off.webp) | **5%** | 10.8 |
| `/bd-pipeline` | ![shipped](gallery/bd_pipeline-dark-on.webp) | ![GL off](gallery/bd_pipeline-dark-off.webp) | **27%** · pipeline 43% | 15.3 |
| `/bd-pipeline/:id` | ![shipped](gallery/bd_pipeline_probe-dark-on.webp) | ![GL off](gallery/bd_pipeline_probe-dark-off.webp) | **36%** | 9.0 |
| `/contacts/:id` | ![shipped](gallery/contacts_probe-dark-on.webp) | ![GL off](gallery/contacts_probe-dark-off.webp) | **36%** | 9.0 |
| `/claim-library` | ![shipped](gallery/claim_library-dark-on.webp) | ![GL off](gallery/claim_library-dark-off.webp) | **36%** | 9.0 |
| `/outreach` | ![shipped](gallery/outreach-dark-on.webp) | ![GL off](gallery/outreach-dark-off.webp) | **6%** | 16.2 |
| `/send-queue` | ![shipped](gallery/send_queue-dark-on.webp) | ![GL off](gallery/send_queue-dark-off.webp) | **36%** | 9.0 |
| `/exchange-gaps` | ![shipped](gallery/exchange_gaps-dark-on.webp) | ![GL off](gallery/exchange_gaps-dark-off.webp) | **36%** | 9.0 |
| `/deal-board` | ![shipped](gallery/deal_board-dark-on.webp) | ![GL off](gallery/deal_board-dark-off.webp) | **36%** | 9.1 |
| `/tasks` | ![shipped](gallery/tasks-dark-on.webp) | ![GL off](gallery/tasks-dark-off.webp) | **39%** | 8.7 |
| `/market-map` | ![shipped](gallery/market_map-dark-on.webp) | ![GL off](gallery/market_map-dark-off.webp) | **29%** · globe 65% | 20.2 |
| `/graph` | ![shipped](gallery/graph-dark-on.webp) | ![GL off](gallery/graph-dark-off.webp) | **5%** | 10.7 |
| `/monitors` | ![shipped](gallery/monitors-dark-on.webp) | ![GL off](gallery/monitors-dark-off.webp) | **35%** | 8.4 |
| `/targets` | ![shipped](gallery/targets-dark-on.webp) | ![GL off](gallery/targets-dark-off.webp) | **36%** | 9.0 |
| `/brief` | ![shipped](gallery/brief-dark-on.webp) | ![GL off](gallery/brief-dark-off.webp) | **36%** | 8.2 |
| `/forecast` | ![shipped](gallery/forecast-dark-on.webp) | ![GL off](gallery/forecast-dark-off.webp) | **8%** | 11.8 |
| `/command` | ![shipped](gallery/command-dark-on.webp) | ![GL off](gallery/command-dark-off.webp) | **17%** | 7.9 |
| `/scorecard` | ![shipped](gallery/scorecard-dark-on.webp) | ![GL off](gallery/scorecard-dark-off.webp) | **22%** | 9.2 |
| `/coverage/:id` | ![shipped](gallery/coverage_probe-dark-on.webp) | ![GL off](gallery/coverage_probe-dark-off.webp) | **36%** | 9.0 |
| `/customer/:id` | ![shipped](gallery/customer_probe-dark-on.webp) | ![GL off](gallery/customer_probe-dark-off.webp) | **36%** | 9.0 |
| `/notes` | ![shipped](gallery/notes-dark-on.webp) | ![GL off](gallery/notes-dark-off.webp) | **39%** | 8.7 |
| `/notes/:projectId` | ![shipped](gallery/notes_probe-dark-on.webp) | ![GL off](gallery/notes_probe-dark-off.webp) | **30%** | 8.2 |
| `/win-loss` | ![shipped](gallery/win_loss-dark-on.webp) | ![GL off](gallery/win_loss-dark-off.webp) | **12%** | 9.6 |
| `/ai-tools` | ![shipped](gallery/ai_tools-dark-on.webp) | ![GL off](gallery/ai_tools-dark-off.webp) | **34%** | 8.4 |
| `/outreach-ops` | ![shipped](gallery/outreach_ops-dark-on.webp) | ![GL off](gallery/outreach_ops-dark-off.webp) | **36%** | 9.1 |
| `/deal-desk` | ![shipped](gallery/deal_desk-dark-on.webp) | ![GL off](gallery/deal_desk-dark-off.webp) | **17%** | 10.0 |
| `/integrations` | ![shipped](gallery/integrations-dark-on.webp) | ![GL off](gallery/integrations-dark-off.webp) | **16%** | 10.1 |
| `/board-report` | ![shipped](gallery/board_report-dark-on.webp) | ![GL off](gallery/board_report-dark-off.webp) | **36%** | 8.2 |
| `/market-news` | ![shipped](gallery/market_news-dark-on.webp) | ![GL off](gallery/market_news-dark-off.webp) | **33%** | 8.5 |
| `/report-builder` | ![shipped](gallery/report_builder-dark-on.webp) | ![GL off](gallery/report_builder-dark-off.webp) | **36%** | 8.2 |
| `/bd-kpis` | ![shipped](gallery/bd_kpis-dark-on.webp) | ![GL off](gallery/bd_kpis-dark-off.webp) | **11%** | 10.7 |
| `/audit-log` | ![shipped](gallery/audit_log-dark-on.webp) | ![GL off](gallery/audit_log-dark-off.webp) | **29%** · vault 31% | 15.4 |
| `/ops` | ![shipped](gallery/ops-dark-on.webp) | ![GL off](gallery/ops-dark-off.webp) | **44%** | 9.3 |
| `/wbr` | ![shipped](gallery/wbr-dark-on.webp) | ![GL off](gallery/wbr-dark-off.webp) | **17%** | 11.9 |
| `/readout` | ![shipped](gallery/readout-dark-on.webp) | ![GL off](gallery/readout-dark-off.webp) | **39%** | 8.8 |
| `/access` | ![shipped](gallery/access-dark-on.webp) | ![GL off](gallery/access-dark-off.webp) | **20%** | 10.5 |
| `/distribution` | ![shipped](gallery/distribution-dark-on.webp) | ![GL off](gallery/distribution-dark-off.webp) | **21%** | 10.1 |
| `/distribution/atlas` | ![shipped](gallery/distribution_atlas-dark-on.webp) | ![GL off](gallery/distribution_atlas-dark-off.webp) | **42%** | 9.3 |
| `/distribution/listings` | ![shipped](gallery/distribution_listings-dark-on.webp) | ![GL off](gallery/distribution_listings-dark-off.webp) | **42%** | 9.3 |
| `/distribution/campaigns` | ![shipped](gallery/distribution_campaigns-dark-on.webp) | ![GL off](gallery/distribution_campaigns-dark-off.webp) | **39%** | 9.6 |
| `/distribution/geo` | ![shipped](gallery/distribution_geo-dark-on.webp) | ![GL off](gallery/distribution_geo-dark-off.webp) | **42%** | 9.3 |
| `/marketing` | ![shipped](gallery/marketing-dark-on.webp) | ![GL off](gallery/marketing-dark-off.webp) | **30%** | 10.2 |
| `/marketing/desk` | ![shipped](gallery/marketing_desk-dark-on.webp) | ![GL off](gallery/marketing_desk-dark-off.webp) | **42%** | 9.3 |
| `/marketing/record` | ![shipped](gallery/marketing_record-dark-on.webp) | ![GL off](gallery/marketing_record-dark-off.webp) | **34%** | 10.3 |
| `/marketing/crisis` | ![shipped](gallery/marketing_crisis-dark-on.webp) | ![GL off](gallery/marketing_crisis-dark-off.webp) | **19%** · storm — | 10.0 |
| `/marketing/holdings` | ![shipped](gallery/marketing_holdings-dark-on.webp) | ![GL off](gallery/marketing_holdings-dark-off.webp) | **37%** | 9.6 |
| `/gps` | ![shipped](gallery/gps-dark-on.webp) | ![GL off](gallery/gps-dark-off.webp) | **14%** | 11.4 |
| `/gps/book` | ![shipped](gallery/gps_book-dark-on.webp) | ![GL off](gallery/gps_book-dark-off.webp) | **42%** | 9.2 |
| `/gps/underwriting` | ![shipped](gallery/gps_underwriting-dark-on.webp) | ![GL off](gallery/gps_underwriting-dark-off.webp) | **34%** | 9.8 |
| `/gps/origination` | ![shipped](gallery/gps_origination-dark-on.webp) | ![GL off](gallery/gps_origination-dark-off.webp) | **41%** | 9.2 |
| `/gps/conflict` | ![shipped](gallery/gps_conflict-dark-on.webp) | ![GL off](gallery/gps_conflict-dark-off.webp) | **35%** | 9.8 |
| `/gps/delivery` | ![shipped](gallery/gps_delivery-dark-on.webp) | ![GL off](gallery/gps_delivery-dark-off.webp) | **42%** | 9.2 |
| `/gps/loop` | ![shipped](gallery/gps_loop-dark-on.webp) | ![GL off](gallery/gps_loop-dark-off.webp) | **42%** | 9.2 |
| `/gps/inputs` | ![shipped](gallery/gps_inputs-dark-on.webp) | ![GL off](gallery/gps_inputs-dark-off.webp) | **40%** | 9.4 |
| `/gps/partner-registry` | ![shipped](gallery/gps_partner_registry-dark-on.webp) | ![GL off](gallery/gps_partner_registry-dark-off.webp) | **42%** | 9.2 |
| `/governance/controls` | ![shipped](gallery/governance_controls-dark-on.webp) | ![GL off](gallery/governance_controls-dark-off.webp) | **24%** | 9.6 |
| `/decisions` | ![shipped](gallery/decisions-dark-on.webp) | ![GL off](gallery/decisions-dark-off.webp) | **44%** | 9.3 |
| `/command-deck` | ![shipped](gallery/command_deck-dark-on.webp) | ![GL off](gallery/command_deck-dark-off.webp) | **29%** · surface 85% | 16.3 |
| `/command-partners` | ![shipped](gallery/command_partners-dark-on.webp) | ![GL off](gallery/command_partners-dark-off.webp) | **38%** | 9.3 |
| `/command-ops` | ![shipped](gallery/command_ops-dark-on.webp) | ![GL off](gallery/command_ops-dark-off.webp) | **38%** | 9.3 |
| `/cheat-card` | ![shipped](gallery/cheat_card-dark-on.webp) | ![GL off](gallery/cheat_card-dark-off.webp) | **17%** | 9.9 |
| `/practice` | ![shipped](gallery/practice-dark-on.webp) | ![GL off](gallery/practice-dark-off.webp) | **17%** | 9.0 |

### light

| route | as shipped | GL forced off | GL coverage | mean ΔE76 |
|---|---|---|---|---|
| `/lcxos` | ![shipped](gallery/lcxos-light-on.webp) | ![GL off](gallery/lcxos-light-off.webp) | **0%** | 0.0 |
| `/portal` | ![shipped](gallery/portal-light-on.webp) | ![GL off](gallery/portal-light-off.webp) | **0%** | 0.0 |
| `/select` | ![shipped](gallery/select-light-on.webp) | ![GL off](gallery/select-light-off.webp) | **0%** | 0.0 |
| `/*` | ![shipped](gallery/root-light-on.webp) | ![GL off](gallery/root-light-off.webp) | **57%** | 5.5 |
| `/regulatory-dashboard` | ![shipped](gallery/regulatory_dashboard-light-on.webp) | ![GL off](gallery/regulatory_dashboard-light-off.webp) | **14%** | 8.0 |
| `/ontology` | ![shipped](gallery/ontology-light-on.webp) | ![GL off](gallery/ontology-light-off.webp) | **63%** · orrery 83% | 14.8 |
| `/states` | ![shipped](gallery/states-light-on.webp) | ![GL off](gallery/states-light-off.webp) | **9%** | 9.4 |
| `/products` | ![shipped](gallery/products-light-on.webp) | ![GL off](gallery/products-light-off.webp) | **8%** | 9.8 |
| `/simulator` | ![shipped](gallery/simulator-light-on.webp) | ![GL off](gallery/simulator-light-off.webp) | **9%** | 8.9 |
| `/howey` | ![shipped](gallery/howey-light-on.webp) | ![GL off](gallery/howey-light-off.webp) | **9%** | 9.3 |
| `/scenario` | ![shipped](gallery/scenario-light-on.webp) | ![GL off](gallery/scenario-light-off.webp) | **9%** | 9.0 |
| `/readiness` | ![shipped](gallery/readiness-light-on.webp) | ![GL off](gallery/readiness-light-off.webp) | **16%** | 6.6 |
| `/brief-generator` | ![shipped](gallery/brief_generator-light-on.webp) | ![GL off](gallery/brief_generator-light-off.webp) | **9%** | 9.4 |
| `/capital-estimator` | ![shipped](gallery/capital_estimator-light-on.webp) | ![GL off](gallery/capital_estimator-light-off.webp) | **11%** | 8.3 |
| `/roadmap` | ![shipped](gallery/roadmap-light-on.webp) | ![GL off](gallery/roadmap-light-off.webp) | **8%** | 9.8 |
| `/red-flags` | ![shipped](gallery/red_flags-light-on.webp) | ![GL off](gallery/red_flags-light-off.webp) | **10%** | 8.5 |
| `/settings` | ![shipped](gallery/settings-light-on.webp) | ![GL off](gallery/settings-light-off.webp) | **10%** | 11.0 |
| `/competition` | ![shipped](gallery/competition-light-on.webp) | ![GL off](gallery/competition-light-off.webp) | **13%** | 7.6 |
| `/product-intel` | ![shipped](gallery/product_intel-light-on.webp) | ![GL off](gallery/product_intel-light-off.webp) | **10%** | 8.6 |
| `/bd-pipeline` | ![shipped](gallery/bd_pipeline-light-on.webp) | ![GL off](gallery/bd_pipeline-light-off.webp) | **53%** · pipeline 91% | 11.6 |
| `/bd-pipeline/:id` | ![shipped](gallery/bd_pipeline_probe-light-on.webp) | ![GL off](gallery/bd_pipeline_probe-light-off.webp) | **57%** | 5.4 |
| `/contacts/:id` | ![shipped](gallery/contacts_probe-light-on.webp) | ![GL off](gallery/contacts_probe-light-off.webp) | **57%** | 5.4 |
| `/claim-library` | ![shipped](gallery/claim_library-light-on.webp) | ![GL off](gallery/claim_library-light-off.webp) | **57%** | 5.4 |
| `/outreach` | ![shipped](gallery/outreach-light-on.webp) | ![GL off](gallery/outreach-light-off.webp) | **10%** | 11.3 |
| `/send-queue` | ![shipped](gallery/send_queue-light-on.webp) | ![GL off](gallery/send_queue-light-off.webp) | **57%** | 5.4 |
| `/exchange-gaps` | ![shipped](gallery/exchange_gaps-light-on.webp) | ![GL off](gallery/exchange_gaps-light-off.webp) | **57%** | 5.4 |
| `/deal-board` | ![shipped](gallery/deal_board-light-on.webp) | ![GL off](gallery/deal_board-light-off.webp) | **55%** | 5.5 |
| `/tasks` | ![shipped](gallery/tasks-light-on.webp) | ![GL off](gallery/tasks-light-off.webp) | **56%** | 5.5 |
| `/market-map` | ![shipped](gallery/market_map-light-on.webp) | ![GL off](gallery/market_map-light-off.webp) | **38%** · globe 81% | 48.7 |
| `/graph` | ![shipped](gallery/graph-light-on.webp) | ![GL off](gallery/graph-light-off.webp) | **9%** | 8.9 |
| `/monitors` | ![shipped](gallery/monitors-light-on.webp) | ![GL off](gallery/monitors-light-off.webp) | **44%** | 5.2 |
| `/targets` | ![shipped](gallery/targets-light-on.webp) | ![GL off](gallery/targets-light-off.webp) | **57%** | 5.4 |
| `/brief` | ![shipped](gallery/brief-light-on.webp) | ![GL off](gallery/brief-light-off.webp) | **55%** | 5.0 |
| `/forecast` | ![shipped](gallery/forecast-light-on.webp) | ![GL off](gallery/forecast-light-off.webp) | **14%** | 8.0 |
| `/command` | ![shipped](gallery/command-light-on.webp) | ![GL off](gallery/command-light-off.webp) | **36%** | 5.6 |
| `/scorecard` | ![shipped](gallery/scorecard-light-on.webp) | ![GL off](gallery/scorecard-light-off.webp) | **30%** | 5.7 |
| `/coverage/:id` | ![shipped](gallery/coverage_probe-light-on.webp) | ![GL off](gallery/coverage_probe-light-off.webp) | **57%** | 5.4 |
| `/customer/:id` | ![shipped](gallery/customer_probe-light-on.webp) | ![GL off](gallery/customer_probe-light-off.webp) | **57%** | 5.4 |
| `/notes` | ![shipped](gallery/notes-light-on.webp) | ![GL off](gallery/notes-light-off.webp) | **57%** | 5.5 |
| `/notes/:projectId` | ![shipped](gallery/notes_probe-light-on.webp) | ![GL off](gallery/notes_probe-light-off.webp) | **47%** | 5.7 |
| `/win-loss` | ![shipped](gallery/win_loss-light-on.webp) | ![GL off](gallery/win_loss-light-off.webp) | **19%** | 6.9 |
| `/ai-tools` | ![shipped](gallery/ai_tools-light-on.webp) | ![GL off](gallery/ai_tools-light-off.webp) | **45%** | 5.1 |
| `/outreach-ops` | ![shipped](gallery/outreach_ops-light-on.webp) | ![GL off](gallery/outreach_ops-light-off.webp) | **50%** | 5.6 |
| `/deal-desk` | ![shipped](gallery/deal_desk-light-on.webp) | ![GL off](gallery/deal_desk-light-off.webp) | **25%** | 6.7 |
| `/integrations` | ![shipped](gallery/integrations-light-on.webp) | ![GL off](gallery/integrations-light-off.webp) | **23%** | 7.4 |
| `/board-report` | ![shipped](gallery/board_report-light-on.webp) | ![GL off](gallery/board_report-light-off.webp) | **55%** | 5.0 |
| `/market-news` | ![shipped](gallery/market_news-light-on.webp) | ![GL off](gallery/market_news-light-off.webp) | **43%** | 5.2 |
| `/report-builder` | ![shipped](gallery/report_builder-light-on.webp) | ![GL off](gallery/report_builder-light-off.webp) | **53%** | 5.0 |
| `/bd-kpis` | ![shipped](gallery/bd_kpis-light-on.webp) | ![GL off](gallery/bd_kpis-light-off.webp) | **21%** | 6.8 |
| `/audit-log` | ![shipped](gallery/audit_log-light-on.webp) | ![GL off](gallery/audit_log-light-off.webp) | **59%** · vault 88% | 18.5 |
| `/ops` | ![shipped](gallery/ops-light-on.webp) | ![GL off](gallery/ops-light-off.webp) | **59%** | 6.0 |
| `/wbr` | ![shipped](gallery/wbr-light-on.webp) | ![GL off](gallery/wbr-light-off.webp) | **25%** | 8.7 |
| `/readout` | ![shipped](gallery/readout-light-on.webp) | ![GL off](gallery/readout-light-off.webp) | **51%** | 5.6 |
| `/access` | ![shipped](gallery/access-light-on.webp) | ![GL off](gallery/access-light-off.webp) | **27%** | 8.0 |
| `/distribution` | ![shipped](gallery/distribution-light-on.webp) | ![GL off](gallery/distribution-light-off.webp) | **35%** | 7.3 |
| `/distribution/atlas` | ![shipped](gallery/distribution_atlas-light-on.webp) | ![GL off](gallery/distribution_atlas-light-off.webp) | **59%** | 6.0 |
| `/distribution/listings` | ![shipped](gallery/distribution_listings-light-on.webp) | ![GL off](gallery/distribution_listings-light-off.webp) | **59%** | 6.0 |
| `/distribution/campaigns` | ![shipped](gallery/distribution_campaigns-light-on.webp) | ![GL off](gallery/distribution_campaigns-light-off.webp) | **53%** | 6.2 |
| `/distribution/geo` | ![shipped](gallery/distribution_geo-light-on.webp) | ![GL off](gallery/distribution_geo-light-off.webp) | **59%** | 6.0 |
| `/marketing` | ![shipped](gallery/marketing-light-on.webp) | ![GL off](gallery/marketing-light-off.webp) | **45%** | 6.6 |
| `/marketing/desk` | ![shipped](gallery/marketing_desk-light-on.webp) | ![GL off](gallery/marketing_desk-light-off.webp) | **59%** | 6.0 |
| `/marketing/record` | ![shipped](gallery/marketing_record-light-on.webp) | ![GL off](gallery/marketing_record-light-off.webp) | **43%** | 6.5 |
| `/marketing/crisis` | ![shipped](gallery/marketing_crisis-light-on.webp) | ![GL off](gallery/marketing_crisis-light-off.webp) | **25%** · storm — | 8.4 |
| `/marketing/holdings` | ![shipped](gallery/marketing_holdings-light-on.webp) | ![GL off](gallery/marketing_holdings-light-off.webp) | **53%** | 6.1 |
| `/gps` | ![shipped](gallery/gps-light-on.webp) | ![GL off](gallery/gps-light-off.webp) | **27%** | 7.7 |
| `/gps/book` | ![shipped](gallery/gps_book-light-on.webp) | ![GL off](gallery/gps_book-light-off.webp) | **57%** | 5.7 |
| `/gps/underwriting` | ![shipped](gallery/gps_underwriting-light-on.webp) | ![GL off](gallery/gps_underwriting-light-off.webp) | **40%** | 6.2 |
| `/gps/origination` | ![shipped](gallery/gps_origination-light-on.webp) | ![GL off](gallery/gps_origination-light-off.webp) | **53%** | 5.8 |
| `/gps/conflict` | ![shipped](gallery/gps_conflict-light-on.webp) | ![GL off](gallery/gps_conflict-light-off.webp) | **40%** | 6.3 |
| `/gps/delivery` | ![shipped](gallery/gps_delivery-light-on.webp) | ![GL off](gallery/gps_delivery-light-off.webp) | **57%** | 5.7 |
| `/gps/loop` | ![shipped](gallery/gps_loop-light-on.webp) | ![GL off](gallery/gps_loop-light-off.webp) | **57%** | 5.7 |
| `/gps/inputs` | ![shipped](gallery/gps_inputs-light-on.webp) | ![GL off](gallery/gps_inputs-light-off.webp) | **50%** | 5.9 |
| `/gps/partner-registry` | ![shipped](gallery/gps_partner_registry-light-on.webp) | ![GL off](gallery/gps_partner_registry-light-off.webp) | **57%** | 5.7 |
| `/governance/controls` | ![shipped](gallery/governance_controls-light-on.webp) | ![GL off](gallery/governance_controls-light-off.webp) | **31%** | 6.3 |
| `/decisions` | ![shipped](gallery/decisions-light-on.webp) | ![GL off](gallery/decisions-light-off.webp) | **59%** | 6.0 |
| `/command-deck` | ![shipped](gallery/command_deck-light-on.webp) | ![GL off](gallery/command_deck-light-off.webp) | **36%** · surface 92% | 16.3 |
| `/command-partners` | ![shipped](gallery/command_partners-light-on.webp) | ![GL off](gallery/command_partners-light-off.webp) | **60%** | 6.2 |
| `/command-ops` | ![shipped](gallery/command_ops-light-on.webp) | ![GL off](gallery/command_ops-light-off.webp) | **60%** | 6.2 |
| `/cheat-card` | ![shipped](gallery/cheat_card-light-on.webp) | ![GL off](gallery/cheat_card-light-off.webp) | **25%** | 7.0 |
| `/practice` | ![shipped](gallery/practice-light-on.webp) | ![GL off](gallery/practice-light-off.webp) | **22%** | 7.1 |
