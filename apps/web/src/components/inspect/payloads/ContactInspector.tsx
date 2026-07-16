import { useEffect, useState } from 'react';
import { fetchLead } from '@/lib/api/bd';
import type { LeadPerson } from '@/types/bd';
import { CardSkeleton, EmptyState } from '@/components/shared';
import type { InspectorPayloadProps } from './ProjectInspector';

/**
 * Contact inspector — id format is `${projectId}:${personId}` since people
 * are only addressable through their project today.
 */
export function ContactInspector({ id }: InspectorPayloadProps) {
  const [person, setPerson] = useState<LeadPerson | null>(null);
  const [projectName, setProjectName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const [projectId, personId] = id.split(':');
    if (!projectId || !personId) {
      setError('Malformed contact reference');
      return;
    }
    let cancelled = false;
    setPerson(null);
    setError(null);
    fetchLead(projectId)
      .then(res => {
        if (cancelled) return;
        setProjectName(res.data.name);
        setPerson(res.data.people.find(p => p.id === personId) ?? null);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <EmptyState variant="error" title="Failed to load contact" description={error} />;
  if (person === null && !projectName) return <CardSkeleton count={2} />;
  if (!person) return <EmptyState variant="search" title="Contact not found" description={`Not on ${projectName}'s people list anymore.`} />;

  return (
    <div className="space-y-3">
      <div className="text-base font-bold text-navy">{person.name}</div>
      <div className="text-label text-grey">
        {person.title ?? person.role ?? 'Contact'} · {projectName}
      </div>
      <div className="space-y-1 text-label">
        {person.email && <div className="font-mono">{person.email} <span className="text-grey">({person.emailStatus})</span></div>}
        {person.linkedin && <a className="block text-cyan-600 hover:underline" href={person.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>}
        {person.telegram && <div className="font-mono">{person.telegram}</div>}
      </div>
    </div>
  );
}
