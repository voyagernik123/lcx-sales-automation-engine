import { describe, it, expect } from 'vitest';
import { productCatalog, competitorProductMap, competitors } from '@/data';
import { FeasibilityStatus, ProductStatus, ProductCategory } from '@/types/productIntel';

describe('product intelligence data integrity', () => {
  const validCategories: ProductCategory[] = ['exchange','custody','payments','token','earn','defi','institutional','advisory','infrastructure','data'];
  const validFeasibility: FeasibilityStatus[] = ['feasible','partial','prohibited','uncertain'];
  const validStatus: ProductStatus[] = ['live','building','planned','not_started'];
  const validTiers = [1, 2, 3, 4];
  const validRevenue = ['low','medium','high','transformative'];
  const validProducts = new Set(productCatalog.map(p => p.id));

  it('has 52 product entries with unique IDs', () => {
    expect(productCatalog).toHaveLength(52);
    const ids = new Set(productCatalog.map(p => p.id));
    expect(ids.size).toBe(52);
  });

  it('every product has a valid category', () => {
    for (const p of productCatalog) {
      expect(validCategories).toContain(p.category);
    }
  });

  it('every product has valid priority tier, feasibility, and status', () => {
    for (const p of productCatalog) {
      expect(validTiers).toContain(p.priorityTier);
      expect(validFeasibility).toContain(p.usPreClarity);
      expect(validFeasibility).toContain(p.usPostClarity);
      expect(validStatus).toContain(p.currentStatus);
      expect(validRevenue).toContain(p.estRevenuePotential);
    }
  });

  it('every product has populated key fields', () => {
    for (const p of productCatalog) {
      expect(p.name.length).toBeGreaterThan(2);
      expect(p.description.length).toBeGreaterThan(10);
      expect(p.targetCustomer.length).toBeGreaterThan(5);
      expect(p.painPoint.length).toBeGreaterThan(5);
      expect(p.valueProposition.length).toBeGreaterThan(10);
      expect(p.revenueModel.length).toBeGreaterThan(5);
      expect(p.strategicImportance).toBeGreaterThanOrEqual(1);
      expect(p.strategicImportance).toBeLessThanOrEqual(10);
      expect(p.implementationComplexity).toBeGreaterThanOrEqual(1);
      expect(p.implementationComplexity).toBeLessThanOrEqual(10);
    }
  });

  it('competitor product map references valid product and competitor IDs', () => {
    const compIds = new Set(competitors.map(c => c.id));
    for (const [cid, pids] of Object.entries(competitorProductMap)) {
      expect(compIds.has(cid), `Unknown competitor ${cid}`).toBe(true);
      for (const pid of pids) {
        expect(validProducts.has(pid), `Competitor ${cid} references unknown product ${pid}`).toBe(true);
      }
    }
  });

  it('no product has self-referencing dependencies', () => {
    for (const p of productCatalog) {
      expect(p.dependencies, `${p.id} depends on itself`).not.toContain(p.id);
    }
  });
});
