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
| `/lcxos` | ![shipped](gallery-p0/lcxos-dark-on.webp) | ![GL off](gallery-p0/lcxos-dark-off.webp) | **0%** | 0.0 |
| `/portal` | ![shipped](gallery-p0/portal-dark-on.webp) | ![GL off](gallery-p0/portal-dark-off.webp) | **0%** | 0.0 |
| `/select` | ![shipped](gallery-p0/select-dark-on.webp) | ![GL off](gallery-p0/select-dark-off.webp) | **95%** | 25.5 |
| `/regulatory-dashboard` | ![shipped](gallery-p0/regulatory_dashboard-dark-on.webp) | ![GL off](gallery-p0/regulatory_dashboard-dark-off.webp) | **0%** | 26.4 |
| `/ontology` | ![shipped](gallery-p0/ontology-dark-on.webp) | ![GL off](gallery-p0/ontology-dark-off.webp) | **58%** | 13.8 |
| `/states` | ![shipped](gallery-p0/states-dark-on.webp) | ![GL off](gallery-p0/states-dark-off.webp) | **0%** | 28.1 |
| `/products` | ![shipped](gallery-p0/products-dark-on.webp) | ![GL off](gallery-p0/products-dark-off.webp) | **0%** | 24.7 |
| `/simulator` | ![shipped](gallery-p0/simulator-dark-on.webp) | ![GL off](gallery-p0/simulator-dark-off.webp) | **0%** | 27.0 |
| `/howey` | ![shipped](gallery-p0/howey-dark-on.webp) | ![GL off](gallery-p0/howey-dark-off.webp) | **0%** | 19.9 |
| `/scenario` | ![shipped](gallery-p0/scenario-dark-on.webp) | ![GL off](gallery-p0/scenario-dark-off.webp) | **0%** | 24.2 |
| `/readiness` | ![shipped](gallery-p0/readiness-dark-on.webp) | ![GL off](gallery-p0/readiness-dark-off.webp) | **0%** | 27.1 |
| `/brief-generator` | ![shipped](gallery-p0/brief_generator-dark-on.webp) | ![GL off](gallery-p0/brief_generator-dark-off.webp) | **0%** | 23.5 |
| `/capital-estimator` | ![shipped](gallery-p0/capital_estimator-dark-on.webp) | ![GL off](gallery-p0/capital_estimator-dark-off.webp) | **0%** | 25.7 |
| `/roadmap` | ![shipped](gallery-p0/roadmap-dark-on.webp) | ![GL off](gallery-p0/roadmap-dark-off.webp) | **0%** | 28.4 |
| `/red-flags` | ![shipped](gallery-p0/red_flags-dark-on.webp) | ![GL off](gallery-p0/red_flags-dark-off.webp) | **0%** | 23.1 |
| `/settings` | ![shipped](gallery-p0/settings-dark-on.webp) | ![GL off](gallery-p0/settings-dark-off.webp) | **0%** | 25.1 |
| `/competition` | ![shipped](gallery-p0/competition-dark-on.webp) | ![GL off](gallery-p0/competition-dark-off.webp) | **0%** | 51.9 |
| `/product-intel` | ![shipped](gallery-p0/product_intel-dark-on.webp) | ![GL off](gallery-p0/product_intel-dark-off.webp) | **0%** | 24.8 |
| `/bd-pipeline` | ![shipped](gallery-p0/bd_pipeline-dark-on.webp) | ![GL off](gallery-p0/bd_pipeline-dark-off.webp) | **16%** | 18.2 |
| `/bd-pipeline/:id` | ![shipped](gallery-p0/bd_pipeline_probe-dark-on.webp) | ![GL off](gallery-p0/bd_pipeline_probe-dark-off.webp) | **0%** | 24.8 |
| `/contacts/:id` | ![shipped](gallery-p0/contacts_probe-dark-on.webp) | ![GL off](gallery-p0/contacts_probe-dark-off.webp) | **0%** | 25.7 |
| `/claim-library` | ![shipped](gallery-p0/claim_library-dark-on.webp) | ![GL off](gallery-p0/claim_library-dark-off.webp) | **0%** | 24.6 |
| `/outreach` | ![shipped](gallery-p0/outreach-dark-on.webp) | ![GL off](gallery-p0/outreach-dark-off.webp) | **0%** | 26.1 |
| `/send-queue` | ![shipped](gallery-p0/send_queue-dark-on.webp) | ![GL off](gallery-p0/send_queue-dark-off.webp) | **0%** | 53.7 |
| `/exchange-gaps` | ![shipped](gallery-p0/exchange_gaps-dark-on.webp) | ![GL off](gallery-p0/exchange_gaps-dark-off.webp) | **0%** | 21.7 |
| `/deal-board` | ![shipped](gallery-p0/deal_board-dark-on.webp) | ![GL off](gallery-p0/deal_board-dark-off.webp) | **0%** | 53.1 |
| `/tasks` | ![shipped](gallery-p0/tasks-dark-on.webp) | ![GL off](gallery-p0/tasks-dark-off.webp) | **0%** | 28.1 |
| `/market-map` | ![shipped](gallery-p0/market_map-dark-on.webp) | ![GL off](gallery-p0/market_map-dark-off.webp) | **0%** | 22.2 |
| `/graph` | ![shipped](gallery-p0/graph-dark-on.webp) | ![GL off](gallery-p0/graph-dark-off.webp) | **0%** | 20.2 |
| `/monitors` | ![shipped](gallery-p0/monitors-dark-on.webp) | ![GL off](gallery-p0/monitors-dark-off.webp) | **0%** | 18.6 |
| `/targets` | ![shipped](gallery-p0/targets-dark-on.webp) | ![GL off](gallery-p0/targets-dark-off.webp) | **0%** | 27.6 |
| `/brief` | ![shipped](gallery-p0/brief-dark-on.webp) | ![GL off](gallery-p0/brief-dark-off.webp) | **0%** | 22.9 |
| `/forecast` | ![shipped](gallery-p0/forecast-dark-on.webp) | ![GL off](gallery-p0/forecast-dark-off.webp) | **0%** | 25.3 |
| `/command` | ![shipped](gallery-p0/command-dark-on.webp) | ![GL off](gallery-p0/command-dark-off.webp) | **0%** | 25.9 |
| `/scorecard` | ![shipped](gallery-p0/scorecard-dark-on.webp) | ![GL off](gallery-p0/scorecard-dark-off.webp) | **0%** | 22.6 |
| `/coverage/:id` | ![shipped](gallery-p0/coverage_probe-dark-on.webp) | ![GL off](gallery-p0/coverage_probe-dark-off.webp) | **0%** | 17.0 |
| `/customer/:id` | ![shipped](gallery-p0/customer_probe-dark-on.webp) | ![GL off](gallery-p0/customer_probe-dark-off.webp) | **0%** | 23.9 |
| `/notes` | ![shipped](gallery-p0/notes-dark-on.webp) | ![GL off](gallery-p0/notes-dark-off.webp) | **0%** | 24.8 |
| `/notes/:projectId` | ![shipped](gallery-p0/notes_probe-dark-on.webp) | ![GL off](gallery-p0/notes_probe-dark-off.webp) | **0%** | 21.2 |
| `/win-loss` | ![shipped](gallery-p0/win_loss-dark-on.webp) | ![GL off](gallery-p0/win_loss-dark-off.webp) | **0%** | 23.6 |
| `/ai-tools` | ![shipped](gallery-p0/ai_tools-dark-on.webp) | ![GL off](gallery-p0/ai_tools-dark-off.webp) | **0%** | 51.6 |
| `/outreach-ops` | ![shipped](gallery-p0/outreach_ops-dark-on.webp) | ![GL off](gallery-p0/outreach_ops-dark-off.webp) | **0%** | 25.0 |
| `/deal-desk` | ![shipped](gallery-p0/deal_desk-dark-on.webp) | ![GL off](gallery-p0/deal_desk-dark-off.webp) | **0%** | 23.4 |
| `/integrations` | ![shipped](gallery-p0/integrations-dark-on.webp) | ![GL off](gallery-p0/integrations-dark-off.webp) | **0%** | 24.9 |
| `/board-report` | ![shipped](gallery-p0/board_report-dark-on.webp) | ![GL off](gallery-p0/board_report-dark-off.webp) | **0%** | 24.9 |
| `/market-news` | ![shipped](gallery-p0/market_news-dark-on.webp) | ![GL off](gallery-p0/market_news-dark-off.webp) | **0%** | 29.7 |
| `/report-builder` | ![shipped](gallery-p0/report_builder-dark-on.webp) | ![GL off](gallery-p0/report_builder-dark-off.webp) | **0%** | 23.0 |
| `/bd-kpis` | ![shipped](gallery-p0/bd_kpis-dark-on.webp) | ![GL off](gallery-p0/bd_kpis-dark-off.webp) | **0%** | 20.1 |
| `/audit-log` | ![shipped](gallery-p0/audit_log-dark-on.webp) | ![GL off](gallery-p0/audit_log-dark-off.webp) | **0%** | 26.1 |
| `/ops` | ![shipped](gallery-p0/ops-dark-on.webp) | ![GL off](gallery-p0/ops-dark-off.webp) | **0%** | 0.0 |
| `/wbr` | ![shipped](gallery-p0/wbr-dark-on.webp) | ![GL off](gallery-p0/wbr-dark-off.webp) | **0%** | 21.5 |
| `/readout` | ![shipped](gallery-p0/readout-dark-on.webp) | ![GL off](gallery-p0/readout-dark-off.webp) | **0%** | 24.6 |
| `/access` | ![shipped](gallery-p0/access-dark-on.webp) | ![GL off](gallery-p0/access-dark-off.webp) | **0%** | 25.8 |
| `/distribution` | ![shipped](gallery-p0/distribution-dark-on.webp) | ![GL off](gallery-p0/distribution-dark-off.webp) | **0%** | 25.9 |
| `/distribution/atlas` | ![shipped](gallery-p0/distribution_atlas-dark-on.webp) | ![GL off](gallery-p0/distribution_atlas-dark-off.webp) | **0%** | 24.6 |
| `/distribution/listings` | ![shipped](gallery-p0/distribution_listings-dark-on.webp) | ![GL off](gallery-p0/distribution_listings-dark-off.webp) | **0%** | 26.2 |
| `/distribution/campaigns` | ![shipped](gallery-p0/distribution_campaigns-dark-on.webp) | ![GL off](gallery-p0/distribution_campaigns-dark-off.webp) | **0%** | 24.6 |
| `/distribution/geo` | ![shipped](gallery-p0/distribution_geo-dark-on.webp) | ![GL off](gallery-p0/distribution_geo-dark-off.webp) | **0%** | 26.3 |
| `/marketing` | ![shipped](gallery-p0/marketing-dark-on.webp) | ![GL off](gallery-p0/marketing-dark-off.webp) | **0%** | 24.4 |
| `/marketing/desk` | ![shipped](gallery-p0/marketing_desk-dark-on.webp) | ![GL off](gallery-p0/marketing_desk-dark-off.webp) | **0%** | 19.4 |
| `/marketing/record` | ![shipped](gallery-p0/marketing_record-dark-on.webp) | ![GL off](gallery-p0/marketing_record-dark-off.webp) | **0%** | 24.2 |
| `/marketing/crisis` | ![shipped](gallery-p0/marketing_crisis-dark-on.webp) | ![GL off](gallery-p0/marketing_crisis-dark-off.webp) | **0%** | 23.3 |
| `/marketing/holdings` | ![shipped](gallery-p0/marketing_holdings-dark-on.webp) | ![GL off](gallery-p0/marketing_holdings-dark-off.webp) | **0%** | 23.8 |
| `/gps` | ![shipped](gallery-p0/gps-dark-on.webp) | ![GL off](gallery-p0/gps-dark-off.webp) | **0%** | 26.4 |
| `/gps/book` | ![shipped](gallery-p0/gps_book-dark-on.webp) | ![GL off](gallery-p0/gps_book-dark-off.webp) | **0%** | 26.9 |
| `/gps/underwriting` | ![shipped](gallery-p0/gps_underwriting-dark-on.webp) | ![GL off](gallery-p0/gps_underwriting-dark-off.webp) | **0%** | 24.6 |
| `/gps/origination` | ![shipped](gallery-p0/gps_origination-dark-on.webp) | ![GL off](gallery-p0/gps_origination-dark-off.webp) | **0%** | 24.3 |
| `/gps/conflict` | ![shipped](gallery-p0/gps_conflict-dark-on.webp) | ![GL off](gallery-p0/gps_conflict-dark-off.webp) | **0%** | 24.8 |
| `/gps/delivery` | ![shipped](gallery-p0/gps_delivery-dark-on.webp) | ![GL off](gallery-p0/gps_delivery-dark-off.webp) | **0%** | 23.6 |
| `/gps/loop` | ![shipped](gallery-p0/gps_loop-dark-on.webp) | ![GL off](gallery-p0/gps_loop-dark-off.webp) | **0%** | 28.2 |
| `/gps/inputs` | ![shipped](gallery-p0/gps_inputs-dark-on.webp) | ![GL off](gallery-p0/gps_inputs-dark-off.webp) | **0%** | 22.2 |
| `/gps/partner-registry` | ![shipped](gallery-p0/gps_partner_registry-dark-on.webp) | ![GL off](gallery-p0/gps_partner_registry-dark-off.webp) | **0%** | 20.2 |
| `/governance/controls` | ![shipped](gallery-p0/governance_controls-dark-on.webp) | ![GL off](gallery-p0/governance_controls-dark-off.webp) | **0%** | 20.5 |
| `/decisions` | ![shipped](gallery-p0/decisions-dark-on.webp) | ![GL off](gallery-p0/decisions-dark-off.webp) | **0%** | 23.9 |
| `/command-deck` | ![shipped](gallery-p0/command_deck-dark-on.webp) | ![GL off](gallery-p0/command_deck-dark-off.webp) | **0%** | 25.1 |
| `/command-partners` | ![shipped](gallery-p0/command_partners-dark-on.webp) | ![GL off](gallery-p0/command_partners-dark-off.webp) | **0%** | 27.6 |
| `/command-ops` | ![shipped](gallery-p0/command_ops-dark-on.webp) | ![GL off](gallery-p0/command_ops-dark-off.webp) | **0%** | 51.8 |
| `/cheat-card` | ![shipped](gallery-p0/cheat_card-dark-on.webp) | ![GL off](gallery-p0/cheat_card-dark-off.webp) | **0%** | 25.4 |
| `/practice` | ![shipped](gallery-p0/practice-dark-on.webp) | ![GL off](gallery-p0/practice-dark-off.webp) | **0%** | 25.5 |

### light

| route | as shipped | GL forced off | GL coverage | mean ΔE76 |
|---|---|---|---|---|
| `/lcxos` | ![shipped](gallery-p0/lcxos-light-on.webp) | ![GL off](gallery-p0/lcxos-light-off.webp) | **0%** | 0.0 |
| `/portal` | ![shipped](gallery-p0/portal-light-on.webp) | ![GL off](gallery-p0/portal-light-off.webp) | **0%** | 0.0 |
| `/select` | ![shipped](gallery-p0/select-light-on.webp) | ![GL off](gallery-p0/select-light-off.webp) | **96%** | 22.7 |
| `/regulatory-dashboard` | ![shipped](gallery-p0/regulatory_dashboard-light-on.webp) | ![GL off](gallery-p0/regulatory_dashboard-light-off.webp) | **32%** | 23.8 |
| `/ontology` | ![shipped](gallery-p0/ontology-light-on.webp) | ![GL off](gallery-p0/ontology-light-off.webp) | **39%** | 9.6 |
| `/states` | ![shipped](gallery-p0/states-light-on.webp) | ![GL off](gallery-p0/states-light-off.webp) | **0%** | 24.7 |
| `/products` | ![shipped](gallery-p0/products-light-on.webp) | ![GL off](gallery-p0/products-light-off.webp) | **0%** | 23.8 |
| `/simulator` | ![shipped](gallery-p0/simulator-light-on.webp) | ![GL off](gallery-p0/simulator-light-off.webp) | **0%** | 24.7 |
| `/howey` | ![shipped](gallery-p0/howey-light-on.webp) | ![GL off](gallery-p0/howey-light-off.webp) | **0%** | 26.4 |
| `/scenario` | ![shipped](gallery-p0/scenario-light-on.webp) | ![GL off](gallery-p0/scenario-light-off.webp) | **0%** | 21.2 |
| `/readiness` | ![shipped](gallery-p0/readiness-light-on.webp) | ![GL off](gallery-p0/readiness-light-off.webp) | **0%** | 23.6 |
| `/brief-generator` | ![shipped](gallery-p0/brief_generator-light-on.webp) | ![GL off](gallery-p0/brief_generator-light-off.webp) | **0%** | 21.3 |
| `/capital-estimator` | ![shipped](gallery-p0/capital_estimator-light-on.webp) | ![GL off](gallery-p0/capital_estimator-light-off.webp) | **0%** | 18.0 |
| `/roadmap` | ![shipped](gallery-p0/roadmap-light-on.webp) | ![GL off](gallery-p0/roadmap-light-off.webp) | **0%** | 22.6 |
| `/red-flags` | ![shipped](gallery-p0/red_flags-light-on.webp) | ![GL off](gallery-p0/red_flags-light-off.webp) | **0%** | 23.9 |
| `/settings` | ![shipped](gallery-p0/settings-light-on.webp) | ![GL off](gallery-p0/settings-light-off.webp) | **0%** | 26.1 |
| `/competition` | ![shipped](gallery-p0/competition-light-on.webp) | ![GL off](gallery-p0/competition-light-off.webp) | **0%** | 44.1 |
| `/product-intel` | ![shipped](gallery-p0/product_intel-light-on.webp) | ![GL off](gallery-p0/product_intel-light-off.webp) | **0%** | 22.9 |
| `/bd-pipeline` | ![shipped](gallery-p0/bd_pipeline-light-on.webp) | ![GL off](gallery-p0/bd_pipeline-light-off.webp) | **33%** | 13.7 |
| `/bd-pipeline/:id` | ![shipped](gallery-p0/bd_pipeline_probe-light-on.webp) | ![GL off](gallery-p0/bd_pipeline_probe-light-off.webp) | **0%** | 43.8 |
| `/contacts/:id` | ![shipped](gallery-p0/contacts_probe-light-on.webp) | ![GL off](gallery-p0/contacts_probe-light-off.webp) | **0%** | 24.5 |
| `/claim-library` | ![shipped](gallery-p0/claim_library-light-on.webp) | ![GL off](gallery-p0/claim_library-light-off.webp) | **0%** | 22.7 |
| `/outreach` | ![shipped](gallery-p0/outreach-light-on.webp) | ![GL off](gallery-p0/outreach-light-off.webp) | **0%** | 46.3 |
| `/send-queue` | ![shipped](gallery-p0/send_queue-light-on.webp) | ![GL off](gallery-p0/send_queue-light-off.webp) | **0%** | 23.0 |
| `/exchange-gaps` | ![shipped](gallery-p0/exchange_gaps-light-on.webp) | ![GL off](gallery-p0/exchange_gaps-light-off.webp) | **0%** | 23.6 |
| `/deal-board` | ![shipped](gallery-p0/deal_board-light-on.webp) | ![GL off](gallery-p0/deal_board-light-off.webp) | **0%** | 23.6 |
| `/tasks` | ![shipped](gallery-p0/tasks-light-on.webp) | ![GL off](gallery-p0/tasks-light-off.webp) | **0%** | 26.2 |
| `/market-map` | ![shipped](gallery-p0/market_map-light-on.webp) | ![GL off](gallery-p0/market_map-light-off.webp) | **0%** | 26.2 |
| `/graph` | ![shipped](gallery-p0/graph-light-on.webp) | ![GL off](gallery-p0/graph-light-off.webp) | **0%** | 22.7 |
| `/monitors` | ![shipped](gallery-p0/monitors-light-on.webp) | ![GL off](gallery-p0/monitors-light-off.webp) | **0%** | 22.2 |
| `/targets` | ![shipped](gallery-p0/targets-light-on.webp) | ![GL off](gallery-p0/targets-light-off.webp) | **0%** | 22.7 |
| `/brief` | ![shipped](gallery-p0/brief-light-on.webp) | ![GL off](gallery-p0/brief-light-off.webp) | **0%** | 23.1 |
| `/forecast` | ![shipped](gallery-p0/forecast-light-on.webp) | ![GL off](gallery-p0/forecast-light-off.webp) | **0%** | 22.5 |
| `/command` | ![shipped](gallery-p0/command-light-on.webp) | ![GL off](gallery-p0/command-light-off.webp) | **0%** | 23.3 |
| `/scorecard` | ![shipped](gallery-p0/scorecard-light-on.webp) | ![GL off](gallery-p0/scorecard-light-off.webp) | **0%** | 18.9 |
| `/coverage/:id` | ![shipped](gallery-p0/coverage_probe-light-on.webp) | ![GL off](gallery-p0/coverage_probe-light-off.webp) | **0%** | 18.2 |
| `/customer/:id` | ![shipped](gallery-p0/customer_probe-light-on.webp) | ![GL off](gallery-p0/customer_probe-light-off.webp) | **0%** | 27.4 |
| `/notes` | ![shipped](gallery-p0/notes-light-on.webp) | ![GL off](gallery-p0/notes-light-off.webp) | **0%** | 23.8 |
| `/notes/:projectId` | ![shipped](gallery-p0/notes_probe-light-on.webp) | ![GL off](gallery-p0/notes_probe-light-off.webp) | **0%** | 25.5 |
| `/win-loss` | ![shipped](gallery-p0/win_loss-light-on.webp) | ![GL off](gallery-p0/win_loss-light-off.webp) | **0%** | 26.4 |
| `/ai-tools` | ![shipped](gallery-p0/ai_tools-light-on.webp) | ![GL off](gallery-p0/ai_tools-light-off.webp) | **0%** | 25.4 |
| `/outreach-ops` | ![shipped](gallery-p0/outreach_ops-light-on.webp) | ![GL off](gallery-p0/outreach_ops-light-off.webp) | **0%** | 18.2 |
| `/deal-desk` | ![shipped](gallery-p0/deal_desk-light-on.webp) | ![GL off](gallery-p0/deal_desk-light-off.webp) | **0%** | 18.2 |
| `/integrations` | ![shipped](gallery-p0/integrations-light-on.webp) | ![GL off](gallery-p0/integrations-light-off.webp) | **0%** | 21.5 |
| `/board-report` | ![shipped](gallery-p0/board_report-light-on.webp) | ![GL off](gallery-p0/board_report-light-off.webp) | **0%** | 24.8 |
| `/market-news` | ![shipped](gallery-p0/market_news-light-on.webp) | ![GL off](gallery-p0/market_news-light-off.webp) | **0%** | 23.1 |
| `/report-builder` | ![shipped](gallery-p0/report_builder-light-on.webp) | ![GL off](gallery-p0/report_builder-light-off.webp) | **0%** | 0.0 |
| `/bd-kpis` | ![shipped](gallery-p0/bd_kpis-light-on.webp) | ![GL off](gallery-p0/bd_kpis-light-off.webp) | **0%** | 18.8 |
| `/audit-log` | ![shipped](gallery-p0/audit_log-light-on.webp) | ![GL off](gallery-p0/audit_log-light-off.webp) | **0%** | 27.0 |
| `/ops` | ![shipped](gallery-p0/ops-light-on.webp) | ![GL off](gallery-p0/ops-light-off.webp) | **0%** | 22.3 |
| `/wbr` | ![shipped](gallery-p0/wbr-light-on.webp) | ![GL off](gallery-p0/wbr-light-off.webp) | **0%** | 24.4 |
| `/readout` | ![shipped](gallery-p0/readout-light-on.webp) | ![GL off](gallery-p0/readout-light-off.webp) | **0%** | 21.0 |
| `/access` | ![shipped](gallery-p0/access-light-on.webp) | ![GL off](gallery-p0/access-light-off.webp) | **0%** | 20.0 |
| `/distribution` | ![shipped](gallery-p0/distribution-light-on.webp) | ![GL off](gallery-p0/distribution-light-off.webp) | **0%** | 25.2 |
| `/distribution/atlas` | ![shipped](gallery-p0/distribution_atlas-light-on.webp) | ![GL off](gallery-p0/distribution_atlas-light-off.webp) | **0%** | 22.9 |
| `/distribution/listings` | ![shipped](gallery-p0/distribution_listings-light-on.webp) | ![GL off](gallery-p0/distribution_listings-light-off.webp) | **0%** | 22.0 |
| `/distribution/campaigns` | ![shipped](gallery-p0/distribution_campaigns-light-on.webp) | ![GL off](gallery-p0/distribution_campaigns-light-off.webp) | **0%** | 24.8 |
| `/distribution/geo` | ![shipped](gallery-p0/distribution_geo-light-on.webp) | ![GL off](gallery-p0/distribution_geo-light-off.webp) | **0%** | 24.0 |
| `/marketing` | ![shipped](gallery-p0/marketing-light-on.webp) | ![GL off](gallery-p0/marketing-light-off.webp) | **0%** | 19.4 |
| `/marketing/desk` | ![shipped](gallery-p0/marketing_desk-light-on.webp) | ![GL off](gallery-p0/marketing_desk-light-off.webp) | **0%** | 27.1 |
| `/marketing/record` | ![shipped](gallery-p0/marketing_record-light-on.webp) | ![GL off](gallery-p0/marketing_record-light-off.webp) | **0%** | 23.9 |
| `/marketing/crisis` | ![shipped](gallery-p0/marketing_crisis-light-on.webp) | ![GL off](gallery-p0/marketing_crisis-light-off.webp) | **0%** | 21.1 |
| `/marketing/holdings` | ![shipped](gallery-p0/marketing_holdings-light-on.webp) | ![GL off](gallery-p0/marketing_holdings-light-off.webp) | **0%** | 20.8 |
| `/gps` | ![shipped](gallery-p0/gps-light-on.webp) | ![GL off](gallery-p0/gps-light-off.webp) | **0%** | 20.3 |
| `/gps/book` | ![shipped](gallery-p0/gps_book-light-on.webp) | ![GL off](gallery-p0/gps_book-light-off.webp) | **0%** | 20.8 |
| `/gps/underwriting` | ![shipped](gallery-p0/gps_underwriting-light-on.webp) | ![GL off](gallery-p0/gps_underwriting-light-off.webp) | **0%** | 24.0 |
| `/gps/origination` | ![shipped](gallery-p0/gps_origination-light-on.webp) | ![GL off](gallery-p0/gps_origination-light-off.webp) | **0%** | 24.0 |
| `/gps/conflict` | ![shipped](gallery-p0/gps_conflict-light-on.webp) | ![GL off](gallery-p0/gps_conflict-light-off.webp) | **0%** | 24.0 |
| `/gps/delivery` | ![shipped](gallery-p0/gps_delivery-light-on.webp) | ![GL off](gallery-p0/gps_delivery-light-off.webp) | **0%** | 22.8 |
| `/gps/loop` | ![shipped](gallery-p0/gps_loop-light-on.webp) | ![GL off](gallery-p0/gps_loop-light-off.webp) | **0%** | 20.3 |
| `/gps/inputs` | ![shipped](gallery-p0/gps_inputs-light-on.webp) | ![GL off](gallery-p0/gps_inputs-light-off.webp) | **0%** | 21.6 |
| `/gps/partner-registry` | ![shipped](gallery-p0/gps_partner_registry-light-on.webp) | ![GL off](gallery-p0/gps_partner_registry-light-off.webp) | **0%** | 24.4 |
| `/governance/controls` | ![shipped](gallery-p0/governance_controls-light-on.webp) | ![GL off](gallery-p0/governance_controls-light-off.webp) | **0%** | 23.4 |
| `/decisions` | ![shipped](gallery-p0/decisions-light-on.webp) | ![GL off](gallery-p0/decisions-light-off.webp) | **0%** | 24.8 |
| `/command-deck` | ![shipped](gallery-p0/command_deck-light-on.webp) | ![GL off](gallery-p0/command_deck-light-off.webp) | **0%** | 24.8 |
| `/command-partners` | ![shipped](gallery-p0/command_partners-light-on.webp) | ![GL off](gallery-p0/command_partners-light-off.webp) | **0%** | 24.6 |
| `/command-ops` | ![shipped](gallery-p0/command_ops-light-on.webp) | ![GL off](gallery-p0/command_ops-light-off.webp) | **0%** | 27.4 |
| `/cheat-card` | ![shipped](gallery-p0/cheat_card-light-on.webp) | ![GL off](gallery-p0/cheat_card-light-off.webp) | **0%** | 22.6 |
| `/practice` | ![shipped](gallery-p0/practice-light-on.webp) | ![GL off](gallery-p0/practice-light-off.webp) | **0%** | 24.6 |
