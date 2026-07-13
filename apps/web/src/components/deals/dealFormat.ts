import { PACKAGES } from '@lcx/shared';

/** Compact money from cents: 2_000_000 → "$20K", 550_000_000 → "$5.5M". */
export function fmtMoneyCents(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return '—';
  const usd = cents / 100;
  if (usd >= 1e6) {
    const m = usd / 1e6;
    return `$${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (usd >= 1e3) {
    const k = usd / 1e3;
    return `$${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return `$${Math.round(usd).toLocaleString()}`;
}

/** "just now" / "5m ago" / "3h ago" / "12d ago" / "2mo ago". */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const diff = Math.max(0, Date.now() - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** "Nikhil Sharma" / "nikhil.sharma@lcx.com" → "NS". Null-safe. */
export function ownerInitials(owner: string | null | undefined): string | null {
  if (!owner?.trim()) return null;
  const parts = owner
    .split('@')[0]
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return null;
  const initials = parts
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
  return initials || null;
}

/** 3px left-border accent per package type (spec colors; neutral fallback). */
export function packageAccentClass(pkgType: string | null | undefined): string {
  switch (pkgType) {
    case 'listing':
      return 'border-l-blue-500';
    case 'marketing':
      return 'border-l-emerald-500';
    case 'liquidity':
      return 'border-l-amber-500';
    case 'dual':
      return 'border-l-purple-500';
    default:
      return 'border-l-slate-400 dark:border-l-slate-600';
  }
}

/** Human label for a package type ("listing" → "Standard Listing"). */
export function packageLabel(pkgType: string | null | undefined): string {
  if (!pkgType) return 'No package';
  return PACKAGES.find((p) => p.type === pkgType)?.label ?? pkgType;
}
