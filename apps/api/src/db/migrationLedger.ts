/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE MIGRATION LEDGER — which files have reached a database, and which have not.
 * ══════════════════════════════════════════════════════════════════════════════
 *  ONE list, because there were nearly three. Two independent ratchets need to know
 *  the same fact — `db/__tests__/migrationImmutability.test.ts` freezes the bytes of
 *  what has shipped, and `gps/__tests__/deploySafety.test.ts` checks that the file a
 *  503 tells an operator to run is a file they can actually run. Both answers come
 *  from here, so the two cannot drift into disagreeing about whether 0053 is applied.
 *
 *  This is a MANIFEST, not logic: nothing at runtime reads it, and it is deliberately
 *  not derived from the directory. A list computed from `readdirSync` would say a new
 *  file is shipped the moment it appears, which is the opposite of the point.
 *
 *  WHEN A PENDING MIGRATION IS APPLIED: move its name out of `PENDING_MIGRATIONS`,
 *  add its digest to `SHIPPED_MIGRATIONS`
 *  (`shasum -a 256 apps/api/src/db/migrations/NNNN_*.sql`), and from that moment it is
 *  frozen like the rest.
 */

export const SHIPPED_MIGRATIONS: Readonly<Record<string, string>> = {
  '0000_equal_beyonder.sql': '8c34d9552f5cec1f8648b96ee16c9ddf5408ae07d25c2f38480522bcb6f09890',
  '0001_people_enrichment.sql': 'dc96ac2b179cd1ce270ea7ca8d1e7cf4a045169c1b4db8498e77a0c2652fc89a',
  '0002_drafts.sql': 'beb062d254a4c0f23ddf5bd3698365e086b26108d6348db03ef8e9ab94ce35f9',
  '0003_outreach.sql': 'ad686050c3245f0a291acf56fc5a34f04e9892b62735039597fcc0bef35005bb',
  '0004_linkedin.sql': '550e51c8e5037d04ff8c33d603808c13b11453fb4f7ff9521ea7f1979c264c26',
  '0005_handoffs.sql': '8615ce6ab6ea7ead2a90941a56346592e43d4d8baeeae027236f8289a6a34817',
  '0006_deals.sql': '55d9daf0d7b8002bf4c5ee703f26d158564b15fc49a9eb3705b1f1e47175cb28',
  '0007_us_intel.sql': '0c87ed7a5828b5a4df607fcc97516f9ce2e0953b9de86320503ac91a2083385b',
  '0008_kpi_triggers.sql': 'a30801b947564bc17c58ab02ade0a4512d66c76d85d7eca53178a7b860c084a5',
  '0009_market_columns.sql': '33051d7bb8c1a5e50546cfb89ead0a00f8867e824e49e62106fdb6422d53ee50',
  '0010_outreach_tasks.sql': '21ac2b48662f295cbeab8554c33a5ab9996413f5d7efb79d1cf8009139336500',
  '0011_ingestion.sql': '1d71df133f15b01eb9dda2ec5879bd01a650828608c8c0b619e9a3c692cabfbb',
  '0012_external_ids.sql': 'ff323521d7f214f9be532f798cdab3d470dabdc36f1fe0613d1cce00335cc3c8',
  '0013_propensity.sql': '696007f6b4bc71a0fca95bd109ab6346e428ed2341d13bf9eb53a62d559752bc',
  '0014_discovery.sql': 'ee4c0523c8d09907fcb35facb983f9e1ccdf47b8ded9d5cfaa5279c4286fa97a',
  '0015_exchanges.sql': 'fc5376d54d54b3670d3452159e133a16d3b4e31e888ff82394c8a7b6f38b7dc9',
  '0016_tasks_notifications.sql': '34547dfd961f52aca8577a17b048c7b188f0e977465336a6f29934dc501461c3',
  '0017_sequence_templates.sql': '727329b5a1c3655be9f476770560bde2cc3eff66894c0aabda543deb02e2959c',
  '0018_launchpad_dedup.sql': '1615c67f07537529e288a1b4098308b210717e16888b9152443a2cb9e58f5960',
  '0019_team.sql': '527646e97cafdfac502201fad1342b48fa1badaccbe730e31cab4e3436415efe',
  '0020_notes_docs.sql': '6513d80f23761910a79125162ef946d6a6321a78e6960d8685dd7e6a126b3934',
  '0021_ai.sql': 'fe405b6759387a473ef0bf5b51e25c7edd3e436640956695800aeb59905b178d',
  '0022_outreach_ops.sql': 'ebcac2f3ba382337d4eeb67620f3bcd14e75130a70e9d4bd60508e89df29eaee',
  '0023_dealdesk_core.sql': '7e7f0304dbeb8e1ff5b1725ddfa3f87cf7c28b3b433deb64da3936cdf0cee17b',
  '0024_dealdesk_ext.sql': 'c9fbcac43da29c29df1cae2b4773d188fb7e727276c75ee861c0e2ac8b8e7c55',
  '0025_analytics.sql': 'bbf64a656ad72c05248b9761dc06ad7a0293db027b26359d2a863ec402af0652',
  '0026_integrations.sql': '554af02b509e62b713f2960349632bebf5e9fcc346b33d06c687061e85d34447',
  '0027_push.sql': '4fe2d0d1e16285de40b8da04f85a1122ca3b1a3465341345a9b5028408b0f284',
  '0028_intel.sql': '2b55dad5234b5cd288cd5d7cc4010ae53117d3fa837c8a0d6b3947d7af4a7b20',
  '0029_spine.sql': '7775d02ecc6c19430eb0f9a3082fa982f71f37b4d93cbb506e10455f4963ea8d',
  '0030_sensors.sql': 'e6474146b00563220ff6e4d075e6849a6081becf696babe7cb285abfe27765be',
  '0031_calibration.sql': '58987453b07f866a7b02eaf62cff74f276da42c8dbb9c04d7ed83c70ef67682f',
  '0032_obs_perf.sql': '4ec0518b79966e66ffb505e17e2e9a2bb3fb82fc2ad2552faa82306b67e0166c',
  '0033_deals_unique_project.sql': '2080e976ea9b99ff8c458245347fb46e71d51ac4108308787ed4b9a09af41856',
  '0034_universe_tier.sql': '45c05c9960425b6e262dc15103f12885130b94af15e1cf2426697d7bc41793cf',
  '0035_graph_search.sql': 'c355ab1a9666ebee793705429f5e1c1086fd4fdefc408a78166aeab1a9375208',
  '0036_analytic_reviews.sql': '3fb55984d51580e76600e08fee2eb3dd2efd61630793cb15f56a074bafd7ef43',
  '0037_monitors.sql': '2002db0e15bba5702fc78cceb957a6f9a3e185146a825d3e062c28986ed0ac5a',
  '0038_scenarios_pirs.sql': '0289388c8de9ddc301cbe8c3d74b438f18276d143e32336081c37bcd3714a3f9',
  '0039_operating_system.sql': '445beb05a250fb600f8c099096114b7e135c8edec23dc3b50c3e343c9e2f1f2f',
  '0040_command.sql': 'c4971268976602728d17e86cb84ce73d12557f72133fd2faec631522a87ae689',
  '0041_command_deep.sql': 'dc5818284107fb4919eac61b9f200a5884673dfd51a4aecef77bd4c8bd3224c6',
  '0042_lcx_os_access.sql': 'fa3fc2eba7e75c9dccbb7f00211d37e5a7c9bbee26b568da2e36c8b6f1b982ef',
  '0043_distribution.sql': '3939c839823135ec0fc5dfb9c78395eef4c57d15fe51dca116ad9b8918161589',
  '0044_projects_website_trgm.sql': '6f6b95f66361a1a1fa1995732934d1d70a32d90cb02a8494ffdeab3658f49a9d',
  '0045_action_idempotency.sql': '8fcc83e8e0639df818d29c681a972557521d0e2eca1c57d1cdce32bba2187e01',
  '0046_marketing.sql': 'c3cdb9ba9009182655efd828fc2973a202d16740ad7c1e8e5b42d72be2a4294b',
  '0047_gps.sql': '82a973a1f7e47fd00af0fab98bb1109bce60ee2800ccf54700680b9a5efee16f',
  '0049_gps_delivery.sql': 'b835a2d60ad25bc1bca17747adc48ed20f3a00e4d00ad2fe80d4cc9d2057f953',
  // THE ONE THIS FILE EXISTS FOR. Applied on production; edited in a working tree;
  // the correction now lives in 0055_gps_perimeter_comment.sql, where it can actually
  // reach the database.
  '0050_gps_perimeter.sql': '7b665d098e5a98abed6943506be08eabc69686c1ae4fffc171ee06445d338fe9',
  '0051_gps_evidence_refusal.sql': '71659dc82324b023ef73d6ce02806bff2e2e095cc58fe7b5ef7944400c3b32ec',

  /* ── 0052–0067: MOVED FROM PENDING 2026-08-04, and the reason is the point ──
   *
   * All sixteen sat in PENDING_MIGRATIONS, which `migrationImmutability.test.ts`
   * treats as "legitimately editable — it has reached no environment, so nothing
   * can be out of step with it". They HAD reached an environment: a read-only
   * probe of production returned APPLIED for fifteen of the sixteen (the
   * sixteenth, 0055, is a bare COMMENT ON TABLE and leaves no table or column to
   * detect). So fifteen live migrations were unpinned and CI would have said
   * nothing about an edit to any of them.
   *
   * That is the ratchet's own failure mode: a hand-written manifest drifted from
   * the database and the drift was invisible, because nothing compared the two.
   * The probe that found it is recorded in docs/phases/P1_CLAIM.md.
   *
   * 0055 is pinned on an INFERENCE, labelled as one: every neighbour 0052-0067 is
   * confirmed applied and they were run as a block. Pinning is the safer error —
   * if it is somehow unapplied it still applies later unchanged. To settle it:
   *   SELECT obj_description('gps_jurisdiction_profile'::regclass) LIKE
   *          '%a screen that refuses is not an act that was prevented%';
   */
  '0052_gps_underwriting.sql': '6f983846cebded92e20577313f879674e23ddf45d158997b34642c0e2ffd4d95',
  '0053_gps_outcome.sql': '65a928070c291d08897ce9154f833b70cbe722036351a262abfc3bafe6edcc0b',
  '0054_gps_origination.sql': '08979a3f3bab3e8968897ccba6e6ac4c84cf54cafbf41e3fcbd74a1c023f0dad',
  '0055_gps_perimeter_comment.sql': '6b42b83c992f494d0fd453b43403553e460222c70048779fda344aaa8cf7fc19',
  '0056_gps_delivery_gaps.sql': 'c5cda012df953affee66d7fa9be94157ee3f31385e8851ef3cc14448d7cd4888',
  '0057_gps_artifact.sql': '9ec59451c9555d48646bc29fbf063687248eb2877fb0ae2fbf86282eda00b529',
  '0058_gps_artifact_custody.sql': '03a9213883026b78d0955d8614feae499b71ed579918c64c53259d6610dd8e5f',
  '0059_marketing_m0.sql': '9b854ca66d38677128579cd116be14f0b79d2e4412c44e8c8e416aeed42accd2',
  '0060_marketing_abuse.sql': '1d7c3566e7cd54025c222dd05e3c53029a1131525997760d5360d0b3107cbfb8',
  '0061_marketing_record.sql': '80cb64d076ecb9537c0b1c360e817bf368c062d084e49fe653ecedfd776b0feb',
  '0062_marketing_gate_decisions.sql': '82870bccb42da1a29ef2132b815c67f8b0fefc384f8b0f5af54f1c4276f09986',
  '0063_marketing_memory.sql': 'acd7b37c4992b7b0935a59950095aad5461f72ff33c0fab856980a600e96e8fd',
  '0064_marketing_retention.sql': '32d5f94df56fe926af5029449cf0a075d15d11154f40cac3a5d9ec0621fe897d',
  '0065_marketing_holdings_position.sql': 'cca1ae645be2225c35b7d6797ede32463efa0674af7d94b5945261410a98ab19',
  '0066_gps_price_band.sql': 'f84d8fd51ca476bc6fbdd6b58dd5488f5953a5d8371668c026e5ca2e80407697',
  '0067_notifications_workspace.sql': 'b4040abc3a82502f7da1a1e1914a383db8172023c5c75ae8efd3989a06dfa0fb',
  '0075_gps_partner_registry.sql': 'bde64f17d3746800f97256c0d8716b71b7c076575c08a725b55452e2de846673',
  '0076_gps_packets.sql': 'a9bd09d2dd4318409bc1b4425ecfea44b129d5badcf7ce9e4e904234c8f23bb4',
  '0077_gps_demand.sql': 'b5ccb344e9d54433cb22f741edbbf8f6f07179a80e4cecd0db42294b588d24a9',
  '0078_gps_dossier.sql': '3990975010002b1f9bbb69926db65090d6261a4800f422fbe4c58bc62632afe1',
  '0079_gps_pricing_policy.sql': '67dc613082d7fdccd7fcba794854d1f4b21d975a0b9043f27c1b612dbd46e01b',
  '0080_gps_portal.sql': '20397ad9fbfcf63c5131de20266a339f0b3f91cd85f83f5f1f659f2148a3a62f',
  '0081_gps_factory.sql': '21b51a07987e5f79eab27ad7f101a2ba77de2d28acef8f13ac0447f153d57086',
  '0082_gps_invoice.sql': '4a2d85fecff5d7a1ba8d0434c06ea628349499e7b5880c866dc03a00fdae0279',
  '0068_listing_labels_dedupe.sql': '0230e2db15df3ea348bb94afe7eebb9a3f486c251e47614e00108a82e84d6518',
  '0069_audit_control_markers.sql': 'a12fabe5ef35125aed1db50a0bc0b8606fa423e43598f7c1d1e76bf4b717be9b',
  '0070_audit_seal.sql': '3b9d556d9127a7442d33ec65f2c2cc1764c12c0b928722f4d010334e907496ff',
  '0071_grant_ledger.sql': 'd24427e6a3f1ebc62f2842a1ae87213a7af01dc1bc652aa0c4f85ae58d3504a6',
  '0072_verdict_broker.sql': '4e922bf300a3235015c430ef241c8095b36c210b97be4459e90a43562dd5fa0f',
  '0073_one_mouth_shadow.sql': '40515bd01a104ba5316714a121f4d80ee01e42fb3d443ae913ab51f0425863f6',
  '0074_platform_forecast.sql': '2122715b1fdcc5f2fd603383bf991a604e8522845940665beba2a51937bdbfda',
};

/**
 * Written, not yet applied anywhere, and therefore still editable. Each of these is
 * named by a `MIGRATION_PENDING` constant in the API and has to be run BY HAND in the
 * Supabase SQL editor before the surface it belongs to stops refusing:
 *   0052 → gps/underwrite.ts UNDERWRITING_MIGRATION      (rate cards, effort triples)
 *   0053 → gps/loop.ts OUTCOME_MIGRATION                 (outcome capture)
 *   0054 → routes/gpsOrigination.ts ORIGINATION_MIGRATION (targets, openings)
 *   0055 → the COMMENT correction 0050 could not deliver
 *   0056 → the four DELIVERY_SCHEMA_GAPS columns and the milestone unique index
 *   0057 → gps_artifact plus the private `gps-artifacts` bucket and its policies.
 *          THE ONE MIGRATION THAT ALSO WRITES OUTSIDE `public`: it upserts a row into
 *          `storage.buckets` and creates a restrictive policy on `storage.objects`, so
 *          applying it is the moment client-file intake becomes physically possible.
 *          Until a human pastes it into the Supabase SQL editor there is no bucket, no
 *          policy and no table — an upload route would fail with 42P01, not store a
 *          document somewhere unprotected.
 *   0058 → gps_artifact_blob (the bytes) and gps_artifact_grant (one download link).
 *          MUST BE APPLIED AFTER 0057 — it references gps_artifact(id). The intake
 *          surface probes for all THREE tables (`gps/artifact.ts isArtifactMigrated`),
 *          so 0057 alone leaves it inert rather than half-working: reads answer empty
 *          and writes answer 503 until both files have been run.
 *
 * MARKETING (LCX_MARKETING_100X_PLAN.md). Apply IN ORDER; each is additive, none
 * contains a destructive verb, and the surfaces refuse honestly until they land:
 *   0059 → M0, the eight live defects. Sender-authentication columns on the inbound
 *          row so a forged email is QUARANTINED rather than graded C3, the real
 *          `posted_at` from oEmbed, a `raw_email` field clock, and the
 *          id-collision-with-differing-content lane. Also carries a
 *          `COMMENT ON COLUMN` that corrects a false sentence in 0046, which could
 *          not be edited in place: 0046 is applied and frozen, and
 *          `db/__tests__/migrationImmutability.test.ts` correctly rejected the edit.
 *          Until this is applied, marketing ingest still grades unauthenticated mail.
 *   0060 → M2, the market-abuse perimeter: `marketing_asset_embargo` and
 *          `marketing_holdings_declaration`. Named by
 *          `marketing/abuseRegister.ts ABUSE_MIGRATION`. THE TWO TABLES THAT MAKE THE
 *          INVISIBLE AXIS LOAD-BEARING (Art 90, Art 91(3)(c)); with neither present
 *          the perimeter refuses and says so rather than passing a draft it could not
 *          check. An empty table is also a refusal, not a clean bill.
 *   0061 → M7, the record. Named by `marketing/record.ts RECORD_MIGRATION`. Art 8(2)
 *          is produce-on-demand and Art 7(3) means the asking authority need not be
 *          the FMA, so the export bundle is a feature and this is its storage.
 *   0062 → THE WIRING PASS. `marketing_outbound_gate_decision` (every verdict from
 *          `marketing/outboundGate.ts`, cleared and refused alike — a ledger holding
 *          only refusals cannot tell "cleared" from "never checked");
 *          `marketing_reply_corroboration`, which is where the provenance ladder's
 *          reasoning finally persists — 0059 already covers DKIM/ARC evidence and the
 *          quarantine lane, but the per-channel agreement list is a table, not a
 *          column; and a value migration renaming `source_kind = 'manual_paste'` to
 *          `operator_paste`, because that column held a third spelling of a concept
 *          `types.ts` and `provenanceLadder.ts` each named differently.
 *          MUST BE APPLIED AFTER 0059 — the corroboration table references
 *          `marketing_x_reply(id)`, and the UPDATE targets a column 0046 created.
 *   0063 → THE DESK'S MEMORY AND THE CRISIS ROOM'S RECORD. Named by
 *          `routes/marketingMemory.ts MEMORY_MIGRATION`. Four tables:
 *          `marketing_own_statement` (the precedent corpus — LCX's own words only, with
 *          no handle, inbound-body or permalink column, which IS the retention argument
 *          for keeping it past the 90-day sweep), plus `marketing_crisis_incident`,
 *          `marketing_crisis_statement_instance` and `marketing_crisis_clearance`.
 *          INDEPENDENT OF 0059-0062 — it references only its own tables, so its position
 *          in this list is chronological rather than a dependency. Until it lands the
 *          precedent index is permanently empty (`GET /precedent` answers
 *          `corpus_empty`/`index_absent`, which are different states and stay apart) and
 *          the crisis room's clearances vanish on reload.
 *   0064 → THE FIVE-YEAR CLOCK, and the sweeper that honours the split 0061 designed.
 *          `marketing_retention_run` plus `body_hash`, `body_minimised_at` and
 *          `retention_hold_reason` on the inbound row, the jeopardy index, and a
 *          `to_regclass`-guarded `marketing_record` DDL. MUST BE APPLIED AFTER 0059 AND
 *          0061 — it adds columns to `marketing_x_reply` as 0059 leaves it and its
 *          jeopardy anti-join reads `marketing_record`. Until it lands, nothing places an
 *          LCX statement on the long clock and the 90-day sweep is the only clock
 *          running, so on day 91 the record MiCA requires for five years is gone.
 *   0065 → THE SHORT LIMB of the holdings declaration. One column,
 *          `marketing_holdings_declaration.short_position`, its CHECK and a partial
 *          index. Named by `marketing/abuseRegister.ts SHORT_LIMB_MIGRATION`. MUST BE
 *          APPLIED AFTER 0060 — it alters the table 0060 creates. `holds` is a boolean,
 *          so a short seller's row reads `holds = false`, which reads as "no position",
 *          and a bearish draft clears; Art 91(3)(c) is direction-neutral. Until this
 *          lands the API reports `shortLimbMigrated: false` and REFUSES to record any
 *          short answer rather than storing one in a column that does not exist.
 *          IT ASKS NOBODY ANYTHING: whether the question is put at all is
 *          `SHORT_QUESTION_POLICY` (`marketing/abuseRegister.ts:610`), an HR/legal
 *          decision that ships set to `not_asked`.
 *   0066 → THE GPS PRICE BAND REGISTER, the SELL side. `gps_price_band`, RLS on with no
 *          policy. The COST side (`gps_rate_card`) and the effort triples already have
 *          tables in 0052; the sell side had none, so every price in the system was the
 *          compiled placeholder (`packages/shared/src/gps/catalogue.ts:61`) and there
 *          was nowhere to put a real one. INDEPENDENT of 0052-0065 — it creates one
 *          table and references nothing. It is byte-for-byte the DDL
 *          `routes/gpsInputs.ts:674` hands an operator in the `meta` of its
 *          register-absent refusal, held so by
 *          `db/__tests__/gpsPriceBandMigration.test.ts`. Until it lands, price-band
 *          writes refuse `PRICE_BAND_REGISTER_ABSENT` and every band renders badged
 *          `PLACEHOLDER` with the number struck through — which is the true state.
 */
export const PENDING_MIGRATIONS: readonly string[] = [
  /* EMPTY SINCE 2026-08-26, and for the first time since early August: the owner ran
   * APPLY_0068_0074.sql (verification 6/6 present) after APPLY_GPS_0075_0082.sql
   * (14/14) the day before, and every name moved to SHIPPED with its digest. The list
   * stays because the DISCIPLINE stays — the next migration lands here first, and the
   * two times this program found applied-but-unpinned files (0052-0067 on 2026-08-04,
   * 0068-0074 on 2026-08-25) it was THIS list being read that surfaced them. */
];

/**
 * Every migration this repo accounts for, shipped or not.
 *
 * ADDED 2026-08-04 because nine assertions across six test files were written as
 * `expect(PENDING_MIGRATIONS).toContain(f)` when what they meant was "the ledger
 * knows about this file". Those two were the same thing while every recent
 * migration was pending; they stopped being the same thing the moment a
 * production probe showed all sixteen applied (docs/phases/P1_CLAIM.md), and nine
 * tests failed for a fact about the DATABASE rather than a defect in the code.
 *
 * A test that wants "is this registered" should ask that. A test that genuinely
 * needs "is this still editable" should read PENDING_MIGRATIONS directly and will
 * then be correct for the right reason.
 */
export const REGISTERED_MIGRATIONS: readonly string[] = [
  ...Object.keys(SHIPPED_MIGRATIONS),
  ...PENDING_MIGRATIONS,
];
