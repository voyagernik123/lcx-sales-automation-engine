/**
 * Derive a coarse region bucket from the free-text jurisdiction field.
 * Persisted to projects.region at import/backfill time so list filters hit an
 * index instead of dozens of ILIKE clauses.
 */

const EU_CODES = new Set([
  'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'IE', 'PT', 'GR',
  'FI', 'SE', 'DK', 'PL', 'CZ', 'HU', 'RO', 'SK', 'BG', 'HR',
  'LT', 'LV', 'EE', 'SI', 'LU', 'CY', 'MT', 'LI',
]);

const EU_NAMES = [
  'germany', 'france', 'italy', 'spain', 'netherlands', 'belgium', 'austria',
  'ireland', 'portugal', 'greece', 'finland', 'sweden', 'denmark', 'poland',
  'czech', 'hungary', 'romania', 'slovakia', 'bulgaria', 'croatia',
  'lithuania', 'latvia', 'estonia', 'slovenia', 'luxembourg', 'cyprus',
  'malta', 'liechtenstein', 'european union',
];

const US_NAMES = ['united states', 'usa', 'america'];

export type Region = 'eu' | 'us' | 'other';

export function deriveRegion(jurisdiction?: string | null): Region | null {
  if (!jurisdiction || jurisdiction.trim() === '') return null;
  const j = jurisdiction.trim();
  const upper = j.toUpperCase();
  const lower = j.toLowerCase();

  if (upper === 'US' || upper === 'USA' || /\bUS\b/.test(upper) || US_NAMES.some((n) => lower.includes(n))) {
    return 'us';
  }
  if (EU_CODES.has(upper) || EU_NAMES.some((n) => lower.includes(n))) {
    return 'eu';
  }
  // Two-letter code that isn't EU/US
  return 'other';
}
