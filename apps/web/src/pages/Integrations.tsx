import { useCallback, useEffect, useState } from 'react';
import {
  CalendarClock,
  Mail,
  MessageCircle,
  CalendarDays,
  Bell,
  Plus,
  RefreshCw,
  Radar,
} from 'lucide-react';
import { request } from '@/lib/apiClient';

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

const card = 'rounded border border-line bg-card p-4 space-y-3';
const heading = 'flex items-center gap-2 text-sm font-bold';
const label = 'text-[10px] font-bold uppercase tracking-wider text-grey';
const input = 'rounded border border-line px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-transparent';
const btn = 'inline-flex items-center gap-1 rounded bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50';
const ghostBtn = 'inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] font-semibold hover:bg-ice-soft dark:hover:bg-ice-soft/10';

function sentimentTone(s: string): string {
  if (s === 'positive') return 'text-emerald-600';
  if (s === 'negative') return 'text-red-600';
  return 'text-grey';
}

export function Integrations() {
  const [projectId, setProjectId] = useState('');
  const [banner, setBanner] = useState('');

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

  const note = (m: string) => {
    setBanner(m);
    window.setTimeout(() => setBanner(''), 3000);
  };
  const onError = (err: unknown) => note(err instanceof Error ? err.message : 'Request failed');

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
    void loadLinks();
    void loadPrefs();
    void loadEvents();
  }, [loadLinks, loadPrefs, loadEvents]);

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
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <Radar size={18} /> Integrations
        </h1>
      </div>
      {banner && (
        <div className="rounded border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/30 p-2 text-[11px] text-indigo-700 dark:text-indigo-300">
          {banner}
        </div>
      )}

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
        <button className={ghostBtn} onClick={() => void loadMeetings()}>
          <RefreshCw size={11} /> Load meetings
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Meeting Links */}
        <section className={card}>
          <h2 className={heading}>
            <CalendarClock size={15} /> Meeting Links
          </h2>
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
            <button className={btn} onClick={() => void createLink()}>
              <Plus size={12} /> Create
            </button>
          </div>
          <div className="space-y-1.5">
            {links.length === 0 && <p className="text-[11px] text-grey">No meeting links yet.</p>}
            {links.map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded border border-line px-2 py-1.5 text-[11px]">
                <span className="font-semibold">/{l.slug}</span>
                <span className="text-grey">{l.durationMin} min</span>
              </div>
            ))}
          </div>
          {meetings.length > 0 && (
            <div className="space-y-1 pt-2">
              <span className={label}>Booked meetings</span>
              {meetings.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-[11px]">
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
          <p className="text-[11px] text-grey">
            Pulls recent threads for the project (Gmail/Outlook when configured, else mock).
          </p>
          <button className={btn} onClick={() => void runEmailSync()}>
            <RefreshCw size={12} /> Run sync
          </button>
          <div className="space-y-1.5">
            {threads.map((t) => (
              <div key={t.id} className="rounded border border-line px-2 py-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold truncate">{t.subject}</span>
                  <span className={`ml-2 shrink-0 ${label}`}>{t.direction}</span>
                </div>
                <p className="text-grey truncate">{t.snippet}</p>
              </div>
            ))}
            {threads.length === 0 && <p className="text-[11px] text-grey">No threads loaded.</p>}
          </div>
        </section>

        {/* Social Mentions */}
        <section className={card}>
          <h2 className={heading}>
            <MessageCircle size={15} /> Social Mentions
          </h2>
          <p className="text-[11px] text-grey">Monitoring only — no auto-DM / auto-message.</p>
          <div className="flex flex-wrap gap-2">
            <button className={ghostBtn} onClick={() => void scanTwitter()}>
              Scan Twitter/X
            </button>
            <button className={ghostBtn} onClick={() => void scanChat('telegram')}>
              Scan Telegram
            </button>
            <button className={ghostBtn} onClick={() => void scanChat('discord')}>
              Scan Discord
            </button>
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {mentions.map((m) => (
              <div key={m.id} className="rounded border border-line px-2 py-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{m.author}</span>
                  <span className={`${label} ${sentimentTone(m.sentiment)}`}>
                    {m.platform} · {m.sentiment}
                  </span>
                </div>
                <p className="text-grey">{m.text}</p>
              </div>
            ))}
            {mentions.length === 0 && <p className="text-[11px] text-grey">No mentions loaded.</p>}
          </div>
        </section>

        {/* Calendar */}
        <section className={card}>
          <h2 className={heading}>
            <CalendarDays size={15} /> Calendar
          </h2>
          <button className={ghostBtn} onClick={() => void loadEvents()}>
            <RefreshCw size={11} /> Refresh events
          </button>
          <div className="space-y-1.5">
            {events.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded border border-line px-2 py-1.5 text-[11px]">
                <span>{new Date(e.startAt).toLocaleString()}</span>
                <span className="text-grey">{e.status}</span>
              </div>
            ))}
            {events.length === 0 && <p className="text-[11px] text-grey">No calendar events recorded.</p>}
          </div>
        </section>

        {/* Push */}
        <section className={`${card} md:col-span-2`}>
          <h2 className={heading}>
            <Bell size={15} /> Web Push & Notification Preferences
          </h2>
          <div className="flex items-center gap-3">
            <button className={btn} onClick={() => void subscribePush()} disabled={subscribed}>
              {subscribed ? 'Subscribed' : 'Enable web push'}
            </button>
            <span className="text-[11px] text-grey">
              {pushConfigured ? 'VAPID configured' : 'VAPID not set — sends are mocked (no-op)'}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {prefs.map((p) => (
              <label key={p.rule} className="flex items-center justify-between rounded border border-line px-2 py-1.5 text-[11px]">
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
