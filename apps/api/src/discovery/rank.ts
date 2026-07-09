import type { FoundEmail } from './crawler.js';

/**
 * Rank discovered emails for outreach usefulness:
 *   1. same-domain address matching a known person's name
 *   2. BD-intent inboxes (partnerships@, bd@, listings@…)
 *   3. generic inboxes (hello@, info@…)
 *   4. everything else on-domain
 * Dropped outright: support/press/jobs/abuse, off-domain addresses.
 */
const BD_PREFIXES = ['partnerships', 'partnership', 'bd', 'listing', 'listings', 'business', 'sales', 'growth'];
const GENERIC_PREFIXES = ['hello', 'info', 'contact', 'team', 'admin', 'office', 'gm'];
const DROP_PREFIXES = ['support', 'press', 'media', 'jobs', 'careers', 'abuse', 'security', 'privacy', 'legal', 'dmca'];

export interface RankedEmail extends FoundEmail {
  rank: number; // lower = better
  reason: string;
}

export function rankEmails(
  emails: FoundEmail[],
  peopleNames: string[],
  projectDomain: string | null,
): RankedEmail[] {
  const nameTokens = peopleNames
    .flatMap((n) => n.toLowerCase().split(/[^a-z]+/))
    .filter((t) => t.length >= 3);

  const ranked: RankedEmail[] = [];
  for (const e of emails) {
    const [local, domain] = e.email.split('@');
    if (!local || !domain) continue;
    const prefix = local.toLowerCase().replace(/[^a-z]/g, '');

    if (DROP_PREFIXES.some((p) => prefix === p || prefix.startsWith(p))) continue;

    const onDomain =
      !projectDomain ||
      domain === projectDomain ||
      domain.endsWith(`.${projectDomain}`) ||
      projectDomain.endsWith(`.${domain}`);
    if (!onDomain) continue;

    if (nameTokens.some((t) => prefix.includes(t))) {
      ranked.push({ ...e, rank: 1, reason: 'matches a known contact name' });
    } else if (BD_PREFIXES.some((p) => prefix === p || prefix.startsWith(p))) {
      ranked.push({ ...e, rank: 2, reason: 'BD-intent inbox' });
    } else if (GENERIC_PREFIXES.includes(prefix)) {
      ranked.push({ ...e, rank: 3, reason: 'generic inbox' });
    } else {
      ranked.push({ ...e, rank: 4, reason: 'on-domain address' });
    }
  }

  return ranked.sort((a, b) => a.rank - b.rank);
}
