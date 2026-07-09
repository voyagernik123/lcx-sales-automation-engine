export type ProductCategory =
  | 'exchange'
  | 'custody'
  | 'payments'
  | 'token'
  | 'earn'
  | 'defi'
  | 'institutional'
  | 'advisory'
  | 'infrastructure'
  | 'data';

export type ProductAudience = 'retail' | 'institutional' | 'both';
export type FeasibilityStatus = 'feasible' | 'partial' | 'prohibited' | 'uncertain';
export type ProductStatus = 'live' | 'building' | 'planned' | 'not_started';
export type RevenuePotential = 'low' | 'medium' | 'high' | 'transformative';

export interface ProductEntry {
  id: string;
  name: string;
  category: ProductCategory;
  subcategory: string;
  audience: ProductAudience;
  description: string;
  targetCustomer: string;
  painPoint: string;
  valueProposition: string;
  revenueModel: string;
  priorityTier: 1 | 2 | 3 | 4;

  usPreClarity: FeasibilityStatus;
  usPostClarity: FeasibilityStatus;
  usLicensingRequired: string[];
  usTimelineMonths: number;

  inCSSFDocument: boolean;
  inDashboard: boolean;
  currentStatus: ProductStatus;

  topCompetitors: string[];

  implementationComplexity: number;
  estRevenuePotential: RevenuePotential;
  strategicImportance: number;
  dependencies: string[];
  notes: string;
}

export interface CompetitorProductMatrix {
  competitorId: string;
  products: Record<string, boolean>;
}

export interface ProductCategoryMeta {
  id: ProductCategory;
  label: string;
  color: string;
  icon: string;
  productCount: number;
}

export const CATEGORY_META: Record<ProductCategory, ProductCategoryMeta> = {
  exchange:    { id: 'exchange', label: 'Exchange', color: '#06b6d4', icon: 'BarChart3', productCount: 0 },
  custody:     { id: 'custody', label: 'Custody', color: '#10b981', icon: 'Shield', productCount: 0 },
  payments:    { id: 'payments', label: 'Payments', color: '#f59e0b', icon: 'ArrowRightLeft', productCount: 0 },
  token:       { id: 'token', label: 'Token', color: '#8b5cf6', icon: 'Coins', productCount: 0 },
  earn:        { id: 'earn', label: 'Earn & Staking', color: '#ec4899', icon: 'TrendingUp', productCount: 0 },
  defi:        { id: 'defi', label: 'DeFi', color: '#6366f1', icon: 'Network', productCount: 0 },
  institutional: { id: 'institutional', label: 'Institutional', color: '#0ea5e9', icon: 'Building2', productCount: 0 },
  advisory:    { id: 'advisory', label: 'Advisory', color: '#a855f7', icon: 'Scale', productCount: 0 },
  infrastructure: { id: 'infrastructure', label: 'Infrastructure', color: '#14b8a6', icon: 'Server', productCount: 0 },
  data:        { id: 'data', label: 'Data & Tools', color: '#64748b', icon: 'Database', productCount: 0 },
};

export type ProductSortField =
  | 'name'
  | 'category'
  | 'priorityTier'
  | 'implementationComplexity'
  | 'strategicImportance'
  | 'usTimelineMonths'
  | 'currentStatus';

export interface ProductFeasibilityMapPoint {
  id: string;
  name: string;
  category: ProductCategory;
  x: number;
  y: number;
  preClarityRadius: number;
  postClarityRadius: number;
  status: FeasibilityStatus;
  revenue: RevenuePotential;
}
