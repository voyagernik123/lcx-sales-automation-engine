import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, CardBody, CardHeader, Input } from '@/components/ui';
import { ApiError, request } from '@/lib/apiClient';

/**
 * G4, DESK SIDE — mint, watch and kill the client's portal links.
 *
 * The one rule this panel exists to make unmistakable: THE LINK APPEARS ONCE.
 * The server stores a digest; there is no "show it again". The panel renders the
 * freshly minted URL inside a copy-it-now block with that sentence attached, and
 * the sessions list below shows metadata only — who it was cut for, by whom,
 * until when, last seen — which is everything an audit needs and nothing a thief
 * can use.
 */

interface SessionRow {
  id: string; label: string; mintedBy: string; mintedAt: string; expiresAt: string;
  revokedAt: string | null; revokedBy: string | null; lastSeenAt: string | null;
}

interface Minted { url: string; expiresAt: string; label: string }

export function PortalInvitePanel({ engagementId }: { engagementId: string }) {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [registerPresent, setRegisterPresent] = useState<boolean | null>(true);
  const [label, setLabel] = useState('');
  const [minted, setMinted] = useState<Minted | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await request<{ data: { sessions: SessionRow[]; registerPresent: boolean | null } }>(
        `/v1/gps/portal-admin/engagements/${engagementId}/sessions`,
      );
      setSessions(res.data.sessions);
      setRegisterPresent(res.data.registerPresent);
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code ?? 'ERROR'}: ${err.message}` : String(err));
    }
  }, [engagementId]);

  useEffect(() => { void load(); }, [load]);

  const mint = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await request<{ data: { url: string; expiresAt: string } }>(
        `/v1/gps/portal-admin/engagements/${engagementId}/invite`,
        { method: 'POST', body: { label: label.trim() } },
      );
      setMinted({ url: `${window.location.origin}${res.data.url}`, expiresAt: res.data.expiresAt, label: label.trim() });
      setLabel('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code ?? 'ERROR'}: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await request(`/v1/gps/portal-admin/sessions/${id}/revoke`, { method: 'POST', body: {} });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code ?? 'ERROR'}: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>Client portal — links this engagement answers to</CardHeader>
      <CardBody className="space-y-3 text-xs">
        {registerPresent === false && (
          <p className="font-mono text-grey-dark" data-testid="portal-admin-register-absent">
            The portal does not exist on this environment yet — apply 0080_gps_portal.sql.
            Minting will refuse with the same sentence until then.
          </p>
        )}
        {error !== null && (
          <p role="alert" className="font-mono text-status-blocked" data-testid="portal-admin-error">{error}</p>
        )}

        {minted !== null && (
          <div className="border border-status-conditional p-2" data-testid="portal-minted">
            <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-status-conditional">
              Copy this now — it will not be shown again
            </p>
            <p className="mt-1 break-all font-mono text-[11px] text-navy" data-testid="portal-minted-url">{minted.url}</p>
            <p className="mt-1 text-grey-dark">
              For {minted.label}, valid until {minted.expiresAt.slice(0, 10)}. The server keeps a
              digest only; you carry the link to the client yourself. Anyone holding it speaks as
              them — send it through a channel you trust.
            </p>
            <Button variant="secondary" onClick={() => setMinted(null)}>I have copied it</Button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <Input
            aria-label="invite label"
            label="Who is this link for (recorded on every act they take)"
            placeholder="e.g. founder@sable.example"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Button onClick={() => void mint()} disabled={busy || label.trim() === '' || registerPresent !== true}>
            {busy ? 'Minting…' : 'Mint portal link'}
          </Button>
        </div>

        {sessions !== null && sessions.length > 0 && (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-line text-left font-mono uppercase tracking-wider text-grey">
                <th className="py-1 pr-2">for</th><th className="pr-2">minted</th>
                <th className="pr-2">expires</th><th className="pr-2">last seen</th>
                <th className="pr-2">state</th><th />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-line/50" data-testid={`portal-session-${s.id}`}>
                  <td className="py-1 pr-2 text-navy">{s.label}</td>
                  <td className="pr-2 text-grey">{s.mintedAt.slice(0, 10)} by {s.mintedBy}</td>
                  <td className="pr-2 text-grey">{s.expiresAt.slice(0, 10)}</td>
                  <td className="pr-2 text-grey">{s.lastSeenAt ? s.lastSeenAt.slice(0, 16).replace('T', ' ') : 'never'}</td>
                  <td className="pr-2">
                    <Badge status={s.revokedAt !== null ? 'blocked' : 'ready'}>
                      {s.revokedAt !== null ? `revoked by ${s.revokedBy}` : 'live'}
                    </Badge>
                  </td>
                  <td>
                    {s.revokedAt === null && (
                      <Button variant="secondary" onClick={() => void revoke(s.id)} disabled={busy}>
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardBody>
    </Card>
  );
}
