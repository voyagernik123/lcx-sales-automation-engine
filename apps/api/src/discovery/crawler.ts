/**
 * Polite contact crawler — fetches a project's own site (homepage + common
 * contact paths), extracts emails and social handles. Respects robots.txt,
 * identifies itself, hard budgets on pages/bytes/time.
 */
import { env } from '../lib/env.js';

export interface FoundEmail {
  email: string;
  sourceUrl: string;
  method: 'mailto' | 'regex';
}

export interface CrawlResult {
  pagesFetched: string[];
  emails: FoundEmail[];
  socials: { twitter?: string; telegram?: string; linkedin?: string };
  blockedByRobots: boolean;
}

const CANDIDATE_PATHS = ['/', '/contact', '/contact-us', '/about', '/about-us', '/team', '/docs', '/legal', '/imprint'];
const PAGE_TIMEOUT_MS = 10_000;
const TOTAL_BUDGET_MS = 30_000;
const MAX_PAGES = 6;
const MAX_BYTES = 1_000_000;
const PER_PAGE_DELAY_MS = 1_500;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JUNK_EMAIL_RE = /(noreply|no-reply|example\.|\.png$|\.jpg$|\.svg$|\.webp$|sentry|wixpress|@\d+x\.)/i;

function userAgent(): string {
  return `LCXSalesBot/1.0 (+mailto:${env.crawlerContactEmail})`;
}

async function fetchWithBudget(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent(), Accept: 'text/html' },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('text/html') && !type.includes('text/plain')) return null;
    const text = await res.text();
    return text.slice(0, MAX_BYTES);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Minimal robots.txt: User-agent: * Disallow prefixes. */
async function fetchDisallows(origin: string): Promise<string[] | 'all'> {
  const body = await fetchWithBudget(`${origin}/robots.txt`);
  if (!body) return [];
  const lines = body.split('\n').map((l) => l.trim());
  const disallows: string[] = [];
  let applies = false;
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith('user-agent:')) {
      applies = lower.slice(11).trim() === '*';
    } else if (applies && lower.startsWith('disallow:')) {
      const path = line.slice(9).trim();
      if (path === '/') return 'all';
      if (path) disallows.push(path);
    }
  }
  return disallows;
}

function extractEmails(html: string, sourceUrl: string): FoundEmail[] {
  const found = new Map<string, FoundEmail>();

  for (const m of html.matchAll(/href=["']mailto:([^"'?]+)/gi)) {
    const email = m[1].trim().toLowerCase();
    if (!JUNK_EMAIL_RE.test(email)) found.set(email, { email, sourceUrl, method: 'mailto' });
  }
  for (const m of html.matchAll(EMAIL_RE)) {
    const email = m[0].toLowerCase();
    if (!found.has(email) && !JUNK_EMAIL_RE.test(email)) {
      found.set(email, { email, sourceUrl, method: 'regex' });
    }
  }
  return [...found.values()];
}

function extractSocials(html: string): CrawlResult['socials'] {
  const socials: CrawlResult['socials'] = {};
  const twitter = html.match(/https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{2,15})(?![\w/])/);
  if (twitter && !['share', 'intent', 'home', 'search'].includes(twitter[1].toLowerCase())) {
    socials.twitter = `https://x.com/${twitter[1]}`;
  }
  const telegram = html.match(/https?:\/\/(?:t\.me|telegram\.me)\/([A-Za-z0-9_+]{3,64})/);
  if (telegram && !['share', 'joinchat'].includes(telegram[1].toLowerCase())) {
    socials.telegram = `@${telegram[1]}`;
  }
  const linkedin = html.match(/https?:\/\/(?:www\.)?linkedin\.com\/(company|in)\/([A-Za-z0-9\-_%]+)/);
  if (linkedin) {
    socials.linkedin = `https://www.linkedin.com/${linkedin[1]}/${linkedin[2]}`;
  }
  return socials;
}

export async function crawlProjectSite(websiteUrl: string): Promise<CrawlResult> {
  const result: CrawlResult = { pagesFetched: [], emails: [], socials: {}, blockedByRobots: false };

  let origin: string;
  try {
    origin = new URL(websiteUrl).origin;
  } catch {
    return result;
  }

  const disallows = await fetchDisallows(origin);
  if (disallows === 'all') {
    result.blockedByRobots = true;
    return result;
  }

  const started = Date.now();
  const seenEmails = new Set<string>();

  for (const path of CANDIDATE_PATHS) {
    if (result.pagesFetched.length >= MAX_PAGES) break;
    if (Date.now() - started > TOTAL_BUDGET_MS) break;
    if (disallows.some((d) => path.startsWith(d))) continue;

    const url = `${origin}${path === '/' ? '' : path}`;
    const html = await fetchWithBudget(url);
    if (html) {
      result.pagesFetched.push(url);
      for (const e of extractEmails(html, url)) {
        if (!seenEmails.has(e.email)) {
          seenEmails.add(e.email);
          result.emails.push(e);
        }
      }
      result.socials = { ...extractSocials(html), ...result.socials };
    }
    await new Promise((r) => setTimeout(r, PER_PAGE_DELAY_MS));
  }

  return result;
}
