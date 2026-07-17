import { useEffect, useState } from 'react';
import { Boxes } from 'lucide-react';
import { fetchLead } from '@/lib/api/bd';
import type { LeadPerson } from '@/types/bd';
import { CardSkeleton, EmptyState } from '@/components/shared';
import { useInspectorStore } from '@/stores';
import { RelationRail } from '../RelationRail';
import type { InspectorPayloadProps } from './ProjectInspector';

/**
 * Contact inspector — id format is `${projectId}:${personId}` since people
 * are only addressable through their project today.
 */
export function ContactInspector({ id }: InspectorPayloadProps) {
  const push = useInspectorStore(s => s.push);
  const [person, setPerson] = useState<LeadPerson | null>(null);
  const [projectName, setProjectName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const projectId = id.split(':')[0];

  useEffect(() => {
    const [pid, personId] = id.split(':');
    if (!pid || !personId) {
      setError('Malformed contact reference');
      return;
    }
    let cancelled = false;
    setPerson(null);
    setError(null);
    fetchLead(pid)
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
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-navy">{person.name}</span>
          {person.verified && (
            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              verified
            </span>
          )}
        </div>
        <div className="mt-0.5 text-label text-grey">
          {person.title ?? person.role ?? 'Contact'} · {projectName}
        </div>
      </div>

      {/* Relation pivots — the graph is the navigation */}
      <RelationRail
        items={[{ label: 'project', count: 1, icon: Boxes, onClick: () => push('project', projectId) }]}
      />

      <div className="space-y-1 text-label">
        {person.email && (
          <div className="font-mono">
            {person.email} <span className="text-grey">({person.emailStatus})</span>
          </div>
        )}
        {person.linkedin && (
          <a className="block text-cyan-600 hover:underline" href={person.linkedin} target="_blank" rel="noreferrer">
            LinkedIn
          </a>
        )}
        {person.telegram && <div className="font-mono">{person.telegram}</div>}
        {typeof person.contactabilityScore === 'number' && (
          <div className="text-micro text-grey">
            Contactability <span className="num-tabular font-semibold text-navy">{person.contactabilityScore}</span>/100
          </div>
        )}
      </div>
    </div>
  );
}
