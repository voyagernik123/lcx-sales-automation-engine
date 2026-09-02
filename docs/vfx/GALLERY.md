# THE PRODUCTION — GALLERY · P0 baseline · as shipped 2026-09-02 (HEAD 2c437c5, before THE PRODUCTION built anything)

> HEAD `2c437c5` · run 2026-09-02T07:23:16.121Z · 79 routes × 2 themes, captured as shipped and with every GL layer forced off
> (`window.__LCX_GL_OFF` → `createStage` refuses `FORCED_OFF_FOR_MEASUREMENT`; relief preferences seeded off).
> **GL coverage** = share of viewport pixels that differ between the two captures (any channel > 8/255). This is the
> number that says whether the 3D is VISIBLE on a route. The controls: a known 40% GL area reads 40% ± 1; identical
> captures read 0.

| | dark | light |
|---|---|---|
| routes where GL is visible (coverage > 5%) | **3** of 79 | **4** of 79 |
| median GL coverage of the viewport | **0%** | **0%** |

### dark

| route | as shipped | GL forced off | GL coverage | mean ΔE76 |
|---|---|---|---|---|
| `/lcxos` | ![shipped](gallery/lcxos-dark-on.webp) | ![GL off](gallery/lcxos-dark-off.webp) | **0%** | 0.0 |
| `/portal` | ![shipped](gallery/portal-dark-on.webp) | ![GL off](gallery/portal-dark-off.webp) | **0%** | 0.0 |
| `/select` | ![shipped](gallery/select-dark-on.webp) | ![GL off](gallery/select-dark-off.webp) | **95%** | 25.5 |
| `/regulatory-dashboard` | ![shipped](gallery/regulatory_dashboard-dark-on.webp) | ![GL off](gallery/regulatory_dashboard-dark-off.webp) | **0%** | 26.4 |
| `/ontology` | ![shipped](gallery/ontology-dark-on.webp) | ![GL off](gallery/ontology-dark-off.webp) | **58%** | 13.8 |
| `/states` | ![shipped](gallery/states-dark-on.webp) | ![GL off](gallery/states-dark-off.webp) | **0%** | 28.1 |
| `/products` | ![shipped](gallery/products-dark-on.webp) | ![GL off](gallery/products-dark-off.webp) | **0%** | 24.7 |
| `/simulator` | ![shipped](gallery/simulator-dark-on.webp) | ![GL off](gallery/simulator-dark-off.webp) | **0%** | 27.0 |
| `/howey` | ![shipped](gallery/howey-dark-on.webp) | ![GL off](gallery/howey-dark-off.webp) | **0%** | 19.9 |
| `/scenario` | ![shipped](gallery/scenario-dark-on.webp) | ![GL off](gallery/scenario-dark-off.webp) | **0%** | 24.2 |
| `/readiness` | ![shipped](gallery/readiness-dark-on.webp) | ![GL off](gallery/readiness-dark-off.webp) | **0%** | 27.1 |
| `/brief-generator` | ![shipped](gallery/brief_generator-dark-on.webp) | ![GL off](gallery/brief_generator-dark-off.webp) | **0%** | 23.5 |
| `/capital-estimator` | ![shipped](gallery/capital_estimator-dark-on.webp) | ![GL off](gallery/capital_estimator-dark-off.webp) | **0%** | 25.7 |
| `/roadmap` | ![shipped](gallery/roadmap-dark-on.webp) | ![GL off](gallery/roadmap-dark-off.webp) | **0%** | 28.4 |
| `/red-flags` | ![shipped](gallery/red_flags-dark-on.webp) | ![GL off](gallery/red_flags-dark-off.webp) | **0%** | 23.1 |
| `/settings` | ![shipped](gallery/settings-dark-on.webp) | ![GL off](gallery/settings-dark-off.webp) | **0%** | 25.1 |
| `/competition` | ![shipped](gallery/competition-dark-on.webp) | ![GL off](gallery/competition-dark-off.webp) | **0%** | 51.9 |
| `/product-intel` | ![shipped](gallery/product_intel-dark-on.webp) | ![GL off](gallery/product_intel-dark-off.webp) | **0%** | 24.8 |
| `/bd-pipeline` | ![shipped](gallery/bd_pipeline-dark-on.webp) | ![GL off](gallery/bd_pipeline-dark-off.webp) | **16%** | 18.2 |
| `/bd-pipeline/:id` | ![shipped](gallery/bd_pipeline_probe-dark-on.webp) | ![GL off](gallery/bd_pipeline_probe-dark-off.webp) | **0%** | 24.8 |
| `/contacts/:id` | ![shipped](gallery/contacts_probe-dark-on.webp) | ![GL off](gallery/contacts_probe-dark-off.webp) | **0%** | 25.7 |
| `/claim-library` | ![shipped](gallery/claim_library-dark-on.webp) | ![GL off](gallery/claim_library-dark-off.webp) | **0%** | 24.6 |
| `/outreach` | ![shipped](gallery/outreach-dark-on.webp) | ![GL off](gallery/outreach-dark-off.webp) | **0%** | 26.1 |
| `/send-queue` | ![shipped](gallery/send_queue-dark-on.webp) | ![GL off](gallery/send_queue-dark-off.webp) | **0%** | 53.7 |
| `/exchange-gaps` | ![shipped](gallery/exchange_gaps-dark-on.webp) | ![GL off](gallery/exchange_gaps-dark-off.webp) | **0%** | 21.7 |
| `/deal-board` | ![shipped](gallery/deal_board-dark-on.webp) | ![GL off](gallery/deal_board-dark-off.webp) | **0%** | 53.1 |
| `/tasks` | ![shipped](gallery/tasks-dark-on.webp) | ![GL off](gallery/tasks-dark-off.webp) | **0%** | 28.1 |
| `/market-map` | ![shipped](gallery/market_map-dark-on.webp) | ![GL off](gallery/market_map-dark-off.webp) | **0%** | 22.2 |
| `/graph` | ![shipped](gallery/graph-dark-on.webp) | ![GL off](gallery/graph-dark-off.webp) | **0%** | 20.2 |
| `/monitors` | ![shipped](gallery/monitors-dark-on.webp) | ![GL off](gallery/monitors-dark-off.webp) | **0%** | 18.6 |
| `/targets` | ![shipped](gallery/targets-dark-on.webp) | ![GL off](gallery/targets-dark-off.webp) | **0%** | 27.6 |
| `/brief` | ![shipped](gallery/brief-dark-on.webp) | ![GL off](gallery/brief-dark-off.webp) | **0%** | 22.9 |
| `/forecast` | ![shipped](gallery/forecast-dark-on.webp) | ![GL off](gallery/forecast-dark-off.webp) | **0%** | 25.3 |
| `/command` | ![shipped](gallery/command-dark-on.webp) | ![GL off](gallery/command-dark-off.webp) | **0%** | 25.9 |
| `/scorecard` | ![shipped](gallery/scorecard-dark-on.webp) | ![GL off](gallery/scorecard-dark-off.webp) | **0%** | 22.6 |
| `/coverage/:id` | ![shipped](gallery/coverage_probe-dark-on.webp) | ![GL off](gallery/coverage_probe-dark-off.webp) | **0%** | 17.0 |
| `/customer/:id` | ![shipped](gallery/customer_probe-dark-on.webp) | ![GL off](gallery/customer_probe-dark-off.webp) | **0%** | 23.9 |
| `/notes` | ![shipped](gallery/notes-dark-on.webp) | ![GL off](gallery/notes-dark-off.webp) | **0%** | 24.8 |
| `/notes/:projectId` | ![shipped](gallery/notes_probe-dark-on.webp) | ![GL off](gallery/notes_probe-dark-off.webp) | **0%** | 21.2 |
| `/win-loss` | ![shipped](gallery/win_loss-dark-on.webp) | ![GL off](gallery/win_loss-dark-off.webp) | **0%** | 23.6 |
| `/ai-tools` | ![shipped](gallery/ai_tools-dark-on.webp) | ![GL off](gallery/ai_tools-dark-off.webp) | **0%** | 51.6 |
| `/outreach-ops` | ![shipped](gallery/outreach_ops-dark-on.webp) | ![GL off](gallery/outreach_ops-dark-off.webp) | **0%** | 25.0 |
| `/deal-desk` | ![shipped](gallery/deal_desk-dark-on.webp) | ![GL off](gallery/deal_desk-dark-off.webp) | **0%** | 23.4 |
| `/integrations` | ![shipped](gallery/integrations-dark-on.webp) | ![GL off](gallery/integrations-dark-off.webp) | **0%** | 24.9 |
| `/board-report` | ![shipped](gallery/board_report-dark-on.webp) | ![GL off](gallery/board_report-dark-off.webp) | **0%** | 24.9 |
| `/market-news` | ![shipped](gallery/market_news-dark-on.webp) | ![GL off](gallery/market_news-dark-off.webp) | **0%** | 29.7 |
| `/report-builder` | ![shipped](gallery/report_builder-dark-on.webp) | ![GL off](gallery/report_builder-dark-off.webp) | **0%** | 23.0 |
| `/bd-kpis` | ![shipped](gallery/bd_kpis-dark-on.webp) | ![GL off](gallery/bd_kpis-dark-off.webp) | **0%** | 20.1 |
| `/audit-log` | ![shipped](gallery/audit_log-dark-on.webp) | ![GL off](gallery/audit_log-dark-off.webp) | **0%** | 26.1 |
| `/ops` | ![shipped](gallery/ops-dark-on.webp) | ![GL off](gallery/ops-dark-off.webp) | **0%** | 0.0 |
| `/wbr` | ![shipped](gallery/wbr-dark-on.webp) | ![GL off](gallery/wbr-dark-off.webp) | **0%** | 21.5 |
| `/readout` | ![shipped](gallery/readout-dark-on.webp) | ![GL off](gallery/readout-dark-off.webp) | **0%** | 24.6 |
| `/access` | ![shipped](gallery/access-dark-on.webp) | ![GL off](gallery/access-dark-off.webp) | **0%** | 25.8 |
| `/distribution` | ![shipped](gallery/distribution-dark-on.webp) | ![GL off](gallery/distribution-dark-off.webp) | **0%** | 25.9 |
| `/distribution/atlas` | ![shipped](gallery/distribution_atlas-dark-on.webp) | ![GL off](gallery/distribution_atlas-dark-off.webp) | **0%** | 24.6 |
| `/distribution/listings` | ![shipped](gallery/distribution_listings-dark-on.webp) | ![GL off](gallery/distribution_listings-dark-off.webp) | **0%** | 26.2 |
| `/distribution/campaigns` | ![shipped](gallery/distribution_campaigns-dark-on.webp) | ![GL off](gallery/distribution_campaigns-dark-off.webp) | **0%** | 24.6 |
| `/distribution/geo` | ![shipped](gallery/distribution_geo-dark-on.webp) | ![GL off](gallery/distribution_geo-dark-off.webp) | **0%** | 26.3 |
| `/marketing` | ![shipped](gallery/marketing-dark-on.webp) | ![GL off](gallery/marketing-dark-off.webp) | **0%** | 24.4 |
| `/marketing/desk` | ![shipped](gallery/marketing_desk-dark-on.webp) | ![GL off](gallery/marketing_desk-dark-off.webp) | **0%** | 19.4 |
| `/marketing/record` | ![shipped](gallery/marketing_record-dark-on.webp) | ![GL off](gallery/marketing_record-dark-off.webp) | **0%** | 24.2 |
| `/marketing/crisis` | ![shipped](gallery/marketing_crisis-dark-on.webp) | ![GL off](gallery/marketing_crisis-dark-off.webp) | **0%** | 23.3 |
| `/marketing/holdings` | ![shipped](gallery/marketing_holdings-dark-on.webp) | ![GL off](gallery/marketing_holdings-dark-off.webp) | **0%** | 23.8 |
| `/gps` | ![shipped](gallery/gps-dark-on.webp) | ![GL off](gallery/gps-dark-off.webp) | **0%** | 26.4 |
| `/gps/book` | ![shipped](gallery/gps_book-dark-on.webp) | ![GL off](gallery/gps_book-dark-off.webp) | **0%** | 26.9 |
| `/gps/underwriting` | ![shipped](gallery/gps_underwriting-dark-on.webp) | ![GL off](gallery/gps_underwriting-dark-off.webp) | **0%** | 24.6 |
| `/gps/origination` | ![shipped](gallery/gps_origination-dark-on.webp) | ![GL off](gallery/gps_origination-dark-off.webp) | **0%** | 24.3 |
| `/gps/conflict` | ![shipped](gallery/gps_conflict-dark-on.webp) | ![GL off](gallery/gps_conflict-dark-off.webp) | **0%** | 24.8 |
| `/gps/delivery` | ![shipped](gallery/gps_delivery-dark-on.webp) | ![GL off](gallery/gps_delivery-dark-off.webp) | **0%** | 23.6 |
| `/gps/loop` | ![shipped](gallery/gps_loop-dark-on.webp) | ![GL off](gallery/gps_loop-dark-off.webp) | **0%** | 28.2 |
| `/gps/inputs` | ![shipped](gallery/gps_inputs-dark-on.webp) | ![GL off](gallery/gps_inputs-dark-off.webp) | **0%** | 22.2 |
| `/gps/partner-registry` | ![shipped](gallery/gps_partner_registry-dark-on.webp) | ![GL off](gallery/gps_partner_registry-dark-off.webp) | **0%** | 20.2 |
| `/governance/controls` | ![shipped](gallery/governance_controls-dark-on.webp) | ![GL off](gallery/governance_controls-dark-off.webp) | **0%** | 20.5 |
| `/decisions` | ![shipped](gallery/decisions-dark-on.webp) | ![GL off](gallery/decisions-dark-off.webp) | **0%** | 23.9 |
| `/command-deck` | ![shipped](gallery/command_deck-dark-on.webp) | ![GL off](gallery/command_deck-dark-off.webp) | **0%** | 25.1 |
| `/command-partners` | ![shipped](gallery/command_partners-dark-on.webp) | ![GL off](gallery/command_partners-dark-off.webp) | **0%** | 27.6 |
| `/command-ops` | ![shipped](gallery/command_ops-dark-on.webp) | ![GL off](gallery/command_ops-dark-off.webp) | **0%** | 51.8 |
| `/cheat-card` | ![shipped](gallery/cheat_card-dark-on.webp) | ![GL off](gallery/cheat_card-dark-off.webp) | **0%** | 25.4 |
| `/practice` | ![shipped](gallery/practice-dark-on.webp) | ![GL off](gallery/practice-dark-off.webp) | **0%** | 25.5 |

### light

| route | as shipped | GL forced off | GL coverage | mean ΔE76 |
|---|---|---|---|---|
| `/lcxos` | ![shipped](gallery/lcxos-light-on.webp) | ![GL off](gallery/lcxos-light-off.webp) | **0%** | 0.0 |
| `/portal` | ![shipped](gallery/portal-light-on.webp) | ![GL off](gallery/portal-light-off.webp) | **0%** | 0.0 |
| `/select` | ![shipped](gallery/select-light-on.webp) | ![GL off](gallery/select-light-off.webp) | **96%** | 22.7 |
| `/regulatory-dashboard` | ![shipped](gallery/regulatory_dashboard-light-on.webp) | ![GL off](gallery/regulatory_dashboard-light-off.webp) | **32%** | 23.8 |
| `/ontology` | ![shipped](gallery/ontology-light-on.webp) | ![GL off](gallery/ontology-light-off.webp) | **39%** | 9.6 |
| `/states` | ![shipped](gallery/states-light-on.webp) | ![GL off](gallery/states-light-off.webp) | **0%** | 24.7 |
| `/products` | ![shipped](gallery/products-light-on.webp) | ![GL off](gallery/products-light-off.webp) | **0%** | 23.8 |
| `/simulator` | ![shipped](gallery/simulator-light-on.webp) | ![GL off](gallery/simulator-light-off.webp) | **0%** | 24.7 |
| `/howey` | ![shipped](gallery/howey-light-on.webp) | ![GL off](gallery/howey-light-off.webp) | **0%** | 26.4 |
| `/scenario` | ![shipped](gallery/scenario-light-on.webp) | ![GL off](gallery/scenario-light-off.webp) | **0%** | 21.2 |
| `/readiness` | ![shipped](gallery/readiness-light-on.webp) | ![GL off](gallery/readiness-light-off.webp) | **0%** | 23.6 |
| `/brief-generator` | ![shipped](gallery/brief_generator-light-on.webp) | ![GL off](gallery/brief_generator-light-off.webp) | **0%** | 21.3 |
| `/capital-estimator` | ![shipped](gallery/capital_estimator-light-on.webp) | ![GL off](gallery/capital_estimator-light-off.webp) | **0%** | 18.0 |
| `/roadmap` | ![shipped](gallery/roadmap-light-on.webp) | ![GL off](gallery/roadmap-light-off.webp) | **0%** | 22.6 |
| `/red-flags` | ![shipped](gallery/red_flags-light-on.webp) | ![GL off](gallery/red_flags-light-off.webp) | **0%** | 23.9 |
| `/settings` | ![shipped](gallery/settings-light-on.webp) | ![GL off](gallery/settings-light-off.webp) | **0%** | 26.1 |
| `/competition` | ![shipped](gallery/competition-light-on.webp) | ![GL off](gallery/competition-light-off.webp) | **0%** | 44.1 |
| `/product-intel` | ![shipped](gallery/product_intel-light-on.webp) | ![GL off](gallery/product_intel-light-off.webp) | **0%** | 22.9 |
| `/bd-pipeline` | ![shipped](gallery/bd_pipeline-light-on.webp) | ![GL off](gallery/bd_pipeline-light-off.webp) | **33%** | 13.7 |
| `/bd-pipeline/:id` | ![shipped](gallery/bd_pipeline_probe-light-on.webp) | ![GL off](gallery/bd_pipeline_probe-light-off.webp) | **0%** | 43.8 |
| `/contacts/:id` | ![shipped](gallery/contacts_probe-light-on.webp) | ![GL off](gallery/contacts_probe-light-off.webp) | **0%** | 24.5 |
| `/claim-library` | ![shipped](gallery/claim_library-light-on.webp) | ![GL off](gallery/claim_library-light-off.webp) | **0%** | 22.7 |
| `/outreach` | ![shipped](gallery/outreach-light-on.webp) | ![GL off](gallery/outreach-light-off.webp) | **0%** | 46.3 |
| `/send-queue` | ![shipped](gallery/send_queue-light-on.webp) | ![GL off](gallery/send_queue-light-off.webp) | **0%** | 23.0 |
| `/exchange-gaps` | ![shipped](gallery/exchange_gaps-light-on.webp) | ![GL off](gallery/exchange_gaps-light-off.webp) | **0%** | 23.6 |
| `/deal-board` | ![shipped](gallery/deal_board-light-on.webp) | ![GL off](gallery/deal_board-light-off.webp) | **0%** | 23.6 |
| `/tasks` | ![shipped](gallery/tasks-light-on.webp) | ![GL off](gallery/tasks-light-off.webp) | **0%** | 26.2 |
| `/market-map` | ![shipped](gallery/market_map-light-on.webp) | ![GL off](gallery/market_map-light-off.webp) | **0%** | 26.2 |
| `/graph` | ![shipped](gallery/graph-light-on.webp) | ![GL off](gallery/graph-light-off.webp) | **0%** | 22.7 |
| `/monitors` | ![shipped](gallery/monitors-light-on.webp) | ![GL off](gallery/monitors-light-off.webp) | **0%** | 22.2 |
| `/targets` | ![shipped](gallery/targets-light-on.webp) | ![GL off](gallery/targets-light-off.webp) | **0%** | 22.7 |
| `/brief` | ![shipped](gallery/brief-light-on.webp) | ![GL off](gallery/brief-light-off.webp) | **0%** | 23.1 |
| `/forecast` | ![shipped](gallery/forecast-light-on.webp) | ![GL off](gallery/forecast-light-off.webp) | **0%** | 22.5 |
| `/command` | ![shipped](gallery/command-light-on.webp) | ![GL off](gallery/command-light-off.webp) | **0%** | 23.3 |
| `/scorecard` | ![shipped](gallery/scorecard-light-on.webp) | ![GL off](gallery/scorecard-light-off.webp) | **0%** | 18.9 |
| `/coverage/:id` | ![shipped](gallery/coverage_probe-light-on.webp) | ![GL off](gallery/coverage_probe-light-off.webp) | **0%** | 18.2 |
| `/customer/:id` | ![shipped](gallery/customer_probe-light-on.webp) | ![GL off](gallery/customer_probe-light-off.webp) | **0%** | 27.4 |
| `/notes` | ![shipped](gallery/notes-light-on.webp) | ![GL off](gallery/notes-light-off.webp) | **0%** | 23.8 |
| `/notes/:projectId` | ![shipped](gallery/notes_probe-light-on.webp) | ![GL off](gallery/notes_probe-light-off.webp) | **0%** | 25.5 |
| `/win-loss` | ![shipped](gallery/win_loss-light-on.webp) | ![GL off](gallery/win_loss-light-off.webp) | **0%** | 26.4 |
| `/ai-tools` | ![shipped](gallery/ai_tools-light-on.webp) | ![GL off](gallery/ai_tools-light-off.webp) | **0%** | 25.4 |
| `/outreach-ops` | ![shipped](gallery/outreach_ops-light-on.webp) | ![GL off](gallery/outreach_ops-light-off.webp) | **0%** | 18.2 |
| `/deal-desk` | ![shipped](gallery/deal_desk-light-on.webp) | ![GL off](gallery/deal_desk-light-off.webp) | **0%** | 18.2 |
| `/integrations` | ![shipped](gallery/integrations-light-on.webp) | ![GL off](gallery/integrations-light-off.webp) | **0%** | 21.5 |
| `/board-report` | ![shipped](gallery/board_report-light-on.webp) | ![GL off](gallery/board_report-light-off.webp) | **0%** | 24.8 |
| `/market-news` | ![shipped](gallery/market_news-light-on.webp) | ![GL off](gallery/market_news-light-off.webp) | **0%** | 23.1 |
| `/report-builder` | ![shipped](gallery/report_builder-light-on.webp) | ![GL off](gallery/report_builder-light-off.webp) | **0%** | 0.0 |
| `/bd-kpis` | ![shipped](gallery/bd_kpis-light-on.webp) | ![GL off](gallery/bd_kpis-light-off.webp) | **0%** | 18.8 |
| `/audit-log` | ![shipped](gallery/audit_log-light-on.webp) | ![GL off](gallery/audit_log-light-off.webp) | **0%** | 27.0 |
| `/ops` | ![shipped](gallery/ops-light-on.webp) | ![GL off](gallery/ops-light-off.webp) | **0%** | 22.3 |
| `/wbr` | ![shipped](gallery/wbr-light-on.webp) | ![GL off](gallery/wbr-light-off.webp) | **0%** | 24.4 |
| `/readout` | ![shipped](gallery/readout-light-on.webp) | ![GL off](gallery/readout-light-off.webp) | **0%** | 21.0 |
| `/access` | ![shipped](gallery/access-light-on.webp) | ![GL off](gallery/access-light-off.webp) | **0%** | 20.0 |
| `/distribution` | ![shipped](gallery/distribution-light-on.webp) | ![GL off](gallery/distribution-light-off.webp) | **0%** | 25.2 |
| `/distribution/atlas` | ![shipped](gallery/distribution_atlas-light-on.webp) | ![GL off](gallery/distribution_atlas-light-off.webp) | **0%** | 22.9 |
| `/distribution/listings` | ![shipped](gallery/distribution_listings-light-on.webp) | ![GL off](gallery/distribution_listings-light-off.webp) | **0%** | 22.0 |
| `/distribution/campaigns` | ![shipped](gallery/distribution_campaigns-light-on.webp) | ![GL off](gallery/distribution_campaigns-light-off.webp) | **0%** | 24.8 |
| `/distribution/geo` | ![shipped](gallery/distribution_geo-light-on.webp) | ![GL off](gallery/distribution_geo-light-off.webp) | **0%** | 24.0 |
| `/marketing` | ![shipped](gallery/marketing-light-on.webp) | ![GL off](gallery/marketing-light-off.webp) | **0%** | 19.4 |
| `/marketing/desk` | ![shipped](gallery/marketing_desk-light-on.webp) | ![GL off](gallery/marketing_desk-light-off.webp) | **0%** | 27.1 |
| `/marketing/record` | ![shipped](gallery/marketing_record-light-on.webp) | ![GL off](gallery/marketing_record-light-off.webp) | **0%** | 23.9 |
| `/marketing/crisis` | ![shipped](gallery/marketing_crisis-light-on.webp) | ![GL off](gallery/marketing_crisis-light-off.webp) | **0%** | 21.1 |
| `/marketing/holdings` | ![shipped](gallery/marketing_holdings-light-on.webp) | ![GL off](gallery/marketing_holdings-light-off.webp) | **0%** | 20.8 |
| `/gps` | ![shipped](gallery/gps-light-on.webp) | ![GL off](gallery/gps-light-off.webp) | **0%** | 20.3 |
| `/gps/book` | ![shipped](gallery/gps_book-light-on.webp) | ![GL off](gallery/gps_book-light-off.webp) | **0%** | 20.8 |
| `/gps/underwriting` | ![shipped](gallery/gps_underwriting-light-on.webp) | ![GL off](gallery/gps_underwriting-light-off.webp) | **0%** | 24.0 |
| `/gps/origination` | ![shipped](gallery/gps_origination-light-on.webp) | ![GL off](gallery/gps_origination-light-off.webp) | **0%** | 24.0 |
| `/gps/conflict` | ![shipped](gallery/gps_conflict-light-on.webp) | ![GL off](gallery/gps_conflict-light-off.webp) | **0%** | 24.0 |
| `/gps/delivery` | ![shipped](gallery/gps_delivery-light-on.webp) | ![GL off](gallery/gps_delivery-light-off.webp) | **0%** | 22.8 |
| `/gps/loop` | ![shipped](gallery/gps_loop-light-on.webp) | ![GL off](gallery/gps_loop-light-off.webp) | **0%** | 20.3 |
| `/gps/inputs` | ![shipped](gallery/gps_inputs-light-on.webp) | ![GL off](gallery/gps_inputs-light-off.webp) | **0%** | 21.6 |
| `/gps/partner-registry` | ![shipped](gallery/gps_partner_registry-light-on.webp) | ![GL off](gallery/gps_partner_registry-light-off.webp) | **0%** | 24.4 |
| `/governance/controls` | ![shipped](gallery/governance_controls-light-on.webp) | ![GL off](gallery/governance_controls-light-off.webp) | **0%** | 23.4 |
| `/decisions` | ![shipped](gallery/decisions-light-on.webp) | ![GL off](gallery/decisions-light-off.webp) | **0%** | 24.8 |
| `/command-deck` | ![shipped](gallery/command_deck-light-on.webp) | ![GL off](gallery/command_deck-light-off.webp) | **0%** | 24.8 |
| `/command-partners` | ![shipped](gallery/command_partners-light-on.webp) | ![GL off](gallery/command_partners-light-off.webp) | **0%** | 24.6 |
| `/command-ops` | ![shipped](gallery/command_ops-light-on.webp) | ![GL off](gallery/command_ops-light-off.webp) | **0%** | 27.4 |
| `/cheat-card` | ![shipped](gallery/cheat_card-light-on.webp) | ![GL off](gallery/cheat_card-light-off.webp) | **0%** | 22.6 |
| `/practice` | ![shipped](gallery/practice-light-on.webp) | ![GL off](gallery/practice-light-off.webp) | **0%** | 24.6 |
