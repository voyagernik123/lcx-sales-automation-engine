import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Copy,
  Globe,
  Mail,
  MessageCircle,
  Plug,
  Plus,
  Radar,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import { request } from '@/lib/apiClient';
import { fetchIntegrationStatus, type IntegrationService } from '@/lib/api/bd';
import { PageTitle, Button } from '@/components/ui';
import { CardSkeleton, EmptyState, toast } from '@/components/shared';

type Meta = { timestamp: string; version: string };
type Wrapped<T> = { data: T; meta: Meta };

interface MeetingLink {
  id: string;
  slug: string;
  title: string;
  durationMin: number;
  createdAt: string;
}
interface Meeting {
  id: string;
  projectId: string | null;
  scheduledAt: string;
  status: string;
  attendeeEmail: string | null;
}
interface EmailThread {
  id: string;
  subject: string;
  snippet: string;
  direction: string;
  occurredAt: string;
}
interface SocialMention {
  id: string;
  platform: string;
  author: string;
  text: string;
  url: string;
  sentiment: string;
  occurredAt: string;
}
interface CalendarEvent {
  id: string;
  meetingId: string;
  externalId: string;
  startAt: string;
  endAt: string;
  status: string;
}
interface Preference {
  rule: string;
  enabled: boolean;
}

const card = 'rounded-lg border border-line/70 bg-card shadow-card p-5 space-y-3';
const heading = 'flex items-center gap-2 text-sm font-bold';
const label = 'text-micro font-bold uppercase tracking-wider text-grey';
const input = 'rounded border border-line px-2.5 py-1.5 text-label outline-none focus:border-cyan-500 transition-colors bg-transparent';

function sentimentTone(s: string): string {
  if (s === 'positive') return 'text-emerald-600 dark:text-emerald-400';
  if (s === 'negative') return 'text-red-600 dark:text-red-400';
  return 'text-grey';
}

/* ── Connection status cards ── */

function StatusPill({ mode }: { mode: 'live' | 'demo' }) {
  if (mode === 'live') {
    return (
      <span className="inline-flex h-[18px] items-center gap-1.5 rounded-full border border-line/70 bg-ice-soft/50 dark:bg-navy-deep/50 px-2 text-micro font-semibold text-grey-dark">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" /> Connected
      </span>
    );
  }
  return (
    <span className="inline-flex h-[18px] items-center gap-1.5 rounded-full border border-line/70 bg-ice-soft/50 dark:bg-navy-deep/50 px-2 text-micro font-semibold text-grey-dark">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" /> Demo Mode
    </span>
  );
}

function domainChip(status: string): string {
  if (status === 'verified') {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
  }
  if (status === 'pending' || status === 'not_started') {
    return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';
  }
  if (status === 'failed' || status === 'temporary_failure') {
    return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300';
  }
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
}

function ConnectDisclosure({ setup }: { setup: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-label font-semibold text-cyan-700 hover:text-cyan-800 dark:text-cyan-400 dark:hover:text-cyan-300 transition-colors"
      >
        <Plug size={11} /> Connect {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </button>
      {open && (
        <p className="mt-1.5 rounded border border-line bg-ice-soft/40 p-2 text-label text-grey dark:bg-ice-soft/5">
          {setup}
        </p>
      )}
    </div>
  );
}

function ResendDetails({ svc }: { svc: IntegrationService }) {
  const stats = svc.stats;
  return (
    <div className="space-y-2">
      <div>
        {svc.webhookVerification ? (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <ShieldCheck size={10} /> Webhook verification on
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <ShieldOff size={10} /> Webhook unverified
          </span>
        )}
      </div>
      {stats && (
        <div className="grid grid-cols-4 gap-2">
          {(
            [
              ['Sent', stats.sent],
              ['Delivered', stats.delivered],
              ['Bounced', stats.bounced],
              ['Last 7d', stats.last7d],
            ] as const
          ).map(([name, value]) => (
            <div key={name} className="rounded border border-line/70 bg-ice-soft/30 dark:bg-navy-deep/30 p-1.5 text-center">
              <div className="text-sm font-bold num-tabular text-navy">{value}</div>
              <div className="text-micro font-medium uppercase tracking-wider text-grey">{name}</div>
            </div>
          ))}
        </div>
      )}
      {svc.error && <p className="text-label text-red-600 dark:text-red-400">Domain lookup failed: {svc.error}</p>}
      {svc.domains && svc.domains.length > 0 && (
        <div className="space-y-1">
          <span className={label}>Sending domains</span>
          {svc.domains.map((d) => (
            <div key={d.name} className="flex items-center justify-between rounded border border-line px-2 py-1 text-label">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <Globe size={11} className="text-grey" /> {d.name}
                {d.region && <span className="font-normal text-grey">({d.region})</span>}
              </span>
              <span className={`rounded px-1.5 py-0.5 text-micro font-semibold capitalize ${domainChip(d.status)}`}>
                {d.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceCard({ svc }: { svc: IntegrationService }) {
  return (
    <div className="space-y-2 rounded-lg border border-line/70 bg-card shadow-card p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-label font-bold">{svc.name}</h3>
        <StatusPill mode={svc.mode} />
      </div>
      {svc.maskedKey && (
        <p className="text-label text-grey">
          Key: <span className="font-mono">{svc.maskedKey}</span>
        </p>
      )}
      {svc.id === 'resend' && <ResendDetails svc={svc} />}
      {svc.mode === 'demo' && <ConnectDisclosure setup={svc.setup} />}
    </div>
  );
}

/** Amber banner shown on sections rendering sample data while a service is unconfigured. */
function DemoBanner({ svc }: { svc: IntegrationService | undefined }) {
  if (!svc || svc.mode !== 'demo') return null;
  return (
    <div className="flex items-start gap-2 rounded border border-amber-300/60 bg-amber-50 p-2 text-label text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-300">
      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
      <div>
        <span className="font-bold">Demo Mode — sample data.</span> {svc.setup}
      </div>
    </div>
  );
}

export function Integrations() {
  const [projectId, setProjectId] = useState('');

  // Connection status
  const [services, setServices] = useState<IntegrationService[] | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState('');

  // Meeting links
  const [links, setLinks] = useState<MeetingLink[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [slug, setSlug] = useState('');
  const [duration, setDuration] = useState(30);

  // Email
  const [threads, setThreads] = useState<EmailThread[]>([]);
  // Social
  const [mentions, setMentions] = useState<SocialMention[]>([]);
  // Calendar
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  // Push
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [pushConfigured, setPushConfigured] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  const note = (m: string) => toast('info', m);
  const onError = (err: unknown) => toast('error', err instanceof Error ? err.message : 'Request failed');

  const svc = (id: string) => services?.find((s) => s.id === id);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError('');
    try {
      setServices(await fetchIntegrationStatus());
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Failed to load integration status');
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadLinks = useCallback(async () => {
    try {
      const res = await request<Wrapped<MeetingLink[]>>('/v1/integrations/meeting-links');
      setLinks(res.data);
    } catch (err) {
      onError(err);
    }
  }, []);

  const loadMeetings = useCallback(async () => {
    try {
      const q = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
      const res = await request<Wrapped<Meeting[]>>(`/v1/integrations/meetings${q}`);
      setMeetings(res.data);
    } catch (err) {
      onError(err);
    }
  }, [projectId]);

  const loadPrefs = useCallback(async () => {
    try {
      const res = await request<Wrapped<{ preferences: Preference[]; configured: boolean }>>(
        '/v1/integrations/push/preferences',
      );
      setPrefs(res.data.preferences);
      setPushConfigured(res.data.configured);
    } catch (err) {
      onError(err);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const res = await request<Wrapped<CalendarEvent[]>>('/v1/integrations/calendar/events');
      setEvents(res.data);
    } catch (err) {
      onError(err);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    void loadLinks();
    void loadPrefs();
    void loadEvents();
  }, [loadStatus, loadLinks, loadPrefs, loadEvents]);

  const createLink = async () => {
    if (!slug.trim()) return;
    try {
      await request('/v1/integrations/meeting-links', {
        method: 'POST',
        body: { slug: slug.trim(), title: slug.trim(), durationMin: duration },
      });
      setSlug('');
      note('Meeting link created');
      void loadLinks();
    } catch (err) {
      onError(err);
    }
  };

  const copyLink = async (linkSlug: string) => {
    const url = `${window.location.origin}/book/${linkSlug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('success', `Booking link copied: ${url}`);
    } catch {
      toast('error', 'Copy failed');
    }
  };

  const runEmailSync = async () => {
    if (!projectId.trim()) return note('Enter a project ID first');
    try {
      const res = await request<Wrapped<{ synced: number; inserted: number; provider: string }>>(
        '/v1/integrations/email-sync/run',
        { method: 'POST', body: { projectId: projectId.trim() } },
      );
      note(`Synced ${res.data.synced} (${res.data.inserted} new) via ${res.data.provider}`);
      const t = await request<Wrapped<EmailThread[]>>(
        `/v1/integrations/email-threads/${encodeURIComponent(projectId.trim())}`,
      );
      setThreads(t.data);
    } catch (err) {
      onError(err);
    }
  };

  const scanTwitter = async () => {
    if (!projectId.trim()) return note('Enter a project ID first');
    try {
      await request('/v1/integrations/twitter/scan', {
        method: 'POST',
        body: { projectId: projectId.trim() },
      });
      const m = await request<Wrapped<SocialMention[]>>(
        `/v1/integrations/social-mentions/${encodeURIComponent(projectId.trim())}`,
      );
      setMentions(m.data);
      note('Twitter scan complete');
    } catch (err) {
      onError(err);
    }
  };

  const scanChat = async (platform: 'telegram' | 'discord') => {
    if (!projectId.trim()) return note('Enter a project ID first');
    try {
      const res = await request<Wrapped<{ matched: number; signalsCreated: number }>>(
        '/v1/integrations/chat/scan',
        { method: 'POST', body: { projectId: projectId.trim(), platform } },
      );
      note(`${platform}: ${res.data.matched} matched, ${res.data.signalsCreated} signals`);
      const m = await request<Wrapped<SocialMention[]>>(
        `/v1/integrations/social-mentions/${encodeURIComponent(projectId.trim())}`,
      );
      setMentions(m.data);
    } catch (err) {
      onError(err);
    }
  };

  const subscribePush = async () => {
    try {
      // Synthetic endpoint — real apps use the browser PushManager subscription.
      await request('/v1/integrations/push/subscribe', {
        method: 'POST',
        body: {
          endpoint: `https://push.local/sub/${crypto.randomUUID()}`,
          keys: { p256dh: 'mock-p256dh', auth: 'mock-auth' },
        },
      });
      setSubscribed(true);
      note('Subscribed to web push (mock endpoint)');
    } catch (err) {
      onError(err);
    }
  };

  const togglePref = async (rule: string, enabled: boolean) => {
    try {
      await request('/v1/integrations/push/preferences', {
        method: 'PATCH',
        body: { rule, enabled },
      });
      setPrefs((p) => p.map((x) => (x.rule === rule ? { ...x, enabled } : x)));
    } catch (err) {
      onError(err);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <PageTitle
        icon={<Radar size={20} />}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void loadStatus()}>
            <RefreshCw size={12} /> Refresh status
          </Button>
        }
      >
        Integrations
      </PageTitle>

      {/* Connection status */}
      <section className="space-y-2">
        <h2 className={label}>Connection status</h2>
        {statusLoading ? (
          <CardSkeleton count={8} />
        ) : statusError ? (
          <div className="rounded border border-line bg-card">
            <EmptyState
              icon={<Plug size={28} className="text-grey" />}
              title="Couldn't load integration status"
              description={statusError}
              action={
                <Button variant="primary" size="sm" onClick={() => void loadStatus()}>
                  <RefreshCw size={12} /> Retry
                </Button>
              }
            />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(services ?? []).map((s) => (
              <ServiceCard key={s.id} svc={s} />
            ))}
          </div>
        )}
      </section>

      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <span className={label}>Project ID (for sync / scan)</span>
          <input
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="project uuid…"
            className={`${input} w-80`}
          />
        </div>
        <Button variant="secondary" size="sm" onClick={() => void loadMeetings()}>
          <RefreshCw size={12} /> Load meetings
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Meeting Links */}
        <section className={card}>
          <h2 className={heading}>
            <CalendarClock size={15} /> Meeting Links
          </h2>
          <DemoBanner svc={svc('calendar')} />
          <div className="flex flex-wrap items-end gap-2">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="slug e.g. intro-call"
              className={`${input} flex-1 min-w-[140px]`}
            />
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) || 30)}
              className={`${input} w-20`}
              aria-label="Duration (minutes)"
            />
            <Button variant="primary" size="sm" onClick={() => void createLink()}>
              <Plus size={12} /> Create
            </Button>
          </div>
          <div className="space-y-1.5">
            {links.length === 0 && <p className="text-label text-grey">No meeting links yet.</p>}
            {links.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 rounded border border-line px-2 py-1.5 text-label">
                <span className="font-semibold">/{l.slug}</span>
                <span className="flex items-center gap-2">
                  <span className="text-grey num-tabular">{l.durationMin} min</span>
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => void copyLink(l.slug)}
                    aria-label={`Copy booking link for ${l.slug}`}
                  >
                    <Copy size={10} /> Copy link
                  </Button>
                </span>
              </div>
            ))}
          </div>
          {meetings.length > 0 && (
            <div className="space-y-1 pt-2">
              <span className={label}>Booked meetings</span>
              {meetings.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-label">
                  <span>{new Date(m.scheduledAt).toLocaleString()}</span>
                  <span className="text-grey">{m.attendeeEmail ?? m.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Email Sync */}
        <section className={card}>
          <h2 className={heading}>
            <Mail size={15} /> Email Sync
          </h2>
          <DemoBanner svc={svc('email-sync')} />
          <p className="text-label text-grey">
            Pulls recent threads for the project (Gmail/Outlook when configured, else mock).
          </p>
          <Button variant="primary" size="sm" onClick={() => void runEmailSync()}>
            <RefreshCw size={12} /> Run sync
          </Button>
          <div className="space-y-1.5">
            {threads.map((t) => (
              <div key={t.id} className="rounded border border-line px-2 py-1.5 text-label">
                <div className="flex items-center justify-between">
                  <span className="font-semibold truncate">{t.subject}</span>
                  <span className="ml-2 shrink-0 text-micro font-medium text-grey">{t.direction}</span>
                </div>
                <p className="text-grey truncate">{t.snippet}</p>
              </div>
            ))}
            {threads.length === 0 && <p className="text-label text-grey">No threads loaded.</p>}
          </div>
        </section>

        {/* Social Mentions */}
        <section className={card}>
          <h2 className={heading}>
            <MessageCircle size={15} /> Social Mentions
          </h2>
          <DemoBanner svc={svc('twitter')} />
          <DemoBanner svc={svc('chat-monitor')} />
          <p className="text-label text-grey">Monitoring only — no auto-DM / auto-message.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => void scanTwitter()}>
              Scan Twitter/X
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void scanChat('telegram')}>
              Scan Telegram
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void scanChat('discord')}>
              Scan Discord
            </Button>
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {mentions.map((m) => (
              <div key={m.id} className="rounded border border-line px-2 py-1.5 text-label">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{m.author}</span>
                  <span className={`text-micro font-medium ${sentimentTone(m.sentiment)}`}>
                    {m.platform} · {m.sentiment}
                  </span>
                </div>
                <p className="text-grey">{m.text}</p>
              </div>
            ))}
            {mentions.length === 0 && <p className="text-label text-grey">No mentions loaded.</p>}
          </div>
        </section>

        {/* Calendar */}
        <section className={card}>
          <h2 className={heading}>
            <CalendarDays size={15} /> Calendar
          </h2>
          <DemoBanner svc={svc('calendar')} />
          <Button variant="secondary" size="sm" onClick={() => void loadEvents()}>
            <RefreshCw size={12} /> Refresh events
          </Button>
          <div className="space-y-1.5">
            {events.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded border border-line px-2 py-1.5 text-label">
                <span>{new Date(e.startAt).toLocaleString()}</span>
                <span className="text-grey">{e.status}</span>
              </div>
            ))}
            {events.length === 0 && <p className="text-label text-grey">No calendar events recorded.</p>}
          </div>
        </section>

        {/* Push */}
        <section className={`${card} md:col-span-2`}>
          <h2 className={heading}>
            <Bell size={15} /> Web Push & Notification Preferences
          </h2>
          <div className="flex items-center gap-3">
            <Button variant="primary" size="sm" onClick={() => void subscribePush()} disabled={subscribed}>
              {subscribed ? 'Subscribed' : 'Enable web push'}
            </Button>
            <span className="text-label text-grey">
              {pushConfigured ? 'VAPID configured' : 'VAPID not set — sends are mocked (no-op)'}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {prefs.map((p) => (
              <label key={p.rule} className="flex items-center justify-between rounded border border-line px-2 py-1.5 text-label">
                <span className="font-semibold">{p.rule}</span>
                <input
                  type="checkbox"
                  checked={p.enabled}
                  onChange={(e) => void togglePref(p.rule, e.target.checked)}
                />
              </label>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
