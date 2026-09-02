export { states } from './states';
export { licenses } from './licenses';
export { requirements } from './requirements';
export { products } from './products';
export { domains } from './domains';
export { phases } from './phases';
export { ontologyGraph } from './ontology';
export { readinessItems } from './readiness';
export { redFlags } from './redFlags';
export { competitors } from './competitors';
export { productCatalog } from './productCatalog';
export { competitorProductMap, competitorsOfferingProduct, findWhiteSpaceProducts } from './competitorProducts';

/**
 * WHEN THIS RECORD WAS LAST REVISED (INSTRUMENT S6 finding, closed 2026-09-02).
 *
 * The regulatory figures on `/regulatory-dashboard` read UNDATED because the compiled dataset
 * carried no instant. It has one: the day this directory was last revised. A day, not a second —
 * the record moves by commit, and the test `dataRevision.test.ts` holds this constant to the
 * last commit touching `apps/web/src/data` (skipped on a shallow checkout, where git has no
 * history to compare against). Bump it in the same commit that changes the data.
 */
export const DATA_REVISED_AT = '2026-09-02T00:00:00.000Z';
