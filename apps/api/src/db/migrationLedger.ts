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
 */
export const PENDING_MIGRATIONS: readonly string[] = [
  '0052_gps_underwriting.sql',
  '0053_gps_outcome.sql',
  '0054_gps_origination.sql',
  '0055_gps_perimeter_comment.sql',
  '0056_gps_delivery_gaps.sql',
];
