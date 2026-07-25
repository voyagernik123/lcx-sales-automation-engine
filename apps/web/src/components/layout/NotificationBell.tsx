import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead, type AppNotification } from '@/lib/api/bd';
import { request } from '@/lib/apiClient';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api';

/**
 * Live notifications over SSE. Exchanges the operator key for a short-lived
 * stream token (EventSource can't send headers), reconnects on token expiry,
 * and reports whether the live channel is up so the caller can relax polling.
 */
function useNotificationStream(onEvent: () => void): boolean {
  const [live, setLive] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout>;
    let stopped = false;

    const connect = async () => {
      try {
        const res = await request<{ data: { token: string } }>('/v1/notifications/stream-token', { method: 'POST' });
        if (stopped) return;
        source = new EventSource(`${API_BASE}/v1/notifications/stream?token=${encodeURIComponent(res.data.token)}`);
        source.addEventListener('connected', () => setLive(true));
        source.addEventListener('notification', () => onEventRef.current());
        source.onerror = () => {
          setLive(false);
          source?.close();
          source = null;
          if (!stopped) retryTimer = setTimeout(connect, 15_000);
        };
      } catch {
        setLive(false);
        if (!stopped) retryTimer = setTimeout(connect, 30_000);
      }
    };

    void connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      source?.close();
    };
  }, []);

  return live;
}

const RULE_ICON: Record<string, string> = {
  reply_received: '💬',
  deal_stalled: '🐌',
  competitor_listing: '⚔️',
  discovery_found: '📧',
};

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchNotifications();
      setItems(res.items);
      setUnread(res.unread);
    } catch {
      // API offline — bell stays quiet
    }
  }, []);

  const live = useNotificationStream(load);

  useEffect(() => {
    void load();
    // SSE connected → polling is just a slow safety net; otherwise poll normally.
    const interval = setInterval(() => void load(), live ? 300_000 : 60_000);
    return () => clearInterval(interval);
  }, [load, live]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const openItem = async (n: AppNotification) => {
    setOpen(false);
    if (!n.readAt) {
      void markNotificationRead(n.id).then(load);
    }
    if (n.href) navigate(n.href);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-1.5 text-grey transition-colors hover:bg-ice-soft hover:text-navy dark:hover:bg-ice-soft/10"
        aria-label="Notifications"
        title={live ? 'Notifications: live' : 'Notifications: polling'}
      >
        <Bell size={18} />
        {live && <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-emerald-400" />}
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-line bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-wide">Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => void markAllNotificationsRead().then(load)}
                className="text-[10px] font-semibold text-cyan-700 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <p className="p-4 text-center text-[11px] text-grey">Nothing yet</p>}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => void openItem(n)}
                className={`block w-full border-b border-line/50 px-3 py-2 text-left last:border-none hover:bg-ice-soft dark:hover:bg-ice-soft/10 ${
                  n.readAt ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-sm">{RULE_ICON[n.rule] ?? '🔔'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold">{n.title}</p>
                    {n.detail && <p className="truncate text-[10px] text-grey">{n.detail}</p>}
                    <p className="text-[9px] text-grey">
                      {new Date(n.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {!n.readAt && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" />}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
