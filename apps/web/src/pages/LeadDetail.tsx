import { useEffect, useCallback, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Globe, FileText, ExternalLink, ChevronDown, ChevronRight, CheckCircle, XCircle, RefreshCw, Search, Users, Activity, Database, Award, Plus, Pencil, X, Mail, Send, ThumbsUp, ThumbsDown, FileOutput, Zap } from 'lucide-react';
import { clsx } from 'clsx';
import { useFilterStore } from '@/stores';
import { fetchLead, approveLead, suppressLead, triggerRescore, triggerEnrich, trackProject, enqueueContactDiscovery, runDiscoveryTick, fetchProjectTimeline, type TimelineEntry, addPerson, updatePerson, generateDraft as apiGenerateDraft, saveDraft, fetchDrafts, updateDraft, enrollProject, pauseSequence, resumeSequence, fetchProjectSequences, fetchProjectMessages, fetchProjectDeal, createDeal, generateProposal, fetchDealEvents, fetchDealObjections, addDealObjection, fetchSequenceTemplates, type SequenceTemplate } from '@/lib/api/bd';
import { transitionDealWithGate } from '@/lib/dealGate';
import { scrollToId } from '@/lib/motion';
import { toast } from '@/components/shared/Toast';
import { EmptyState, CardSkeleton } from '@/components/shared';
import { EntityChip } from '@/components/entity';
import { SectionLabel, Button } from '@/components/ui';
import { ScoreBadge, BandBadge, MarketTag } from '@/components/bd';
import { PropensityTrail } from '@/components/bd/PropensityTrail';
import { UsIntelGauges } from '@/components/bd/UsIntelGauges';
import { GateBanner, useGateCheck } from '@/components/bd/GateBanner';
import { PriorityEquation } from '@/components/bd/PriorityEquation';
import { RegulatoryPosture } from '@/components/bd/RegulatoryPosture';
import { StructuredPayload } from '@/components/bd/StructuredPayload';
import { deriveMarketTag, CHANNEL_LABELS, TOUCH_LABELS, STAGE_COLORS, STAGE_LABELS } from '@/types/bd';
import type { LeadDetail, LeadSignal, LeadPerson, DraftOutput, SavedDraft, Channel, SequenceRecord, MessageRecord } from '@/types/bd';
import { SEQUENCE_STATUS_COLORS, MESSAGE_STATUS_COLORS, LINKEDIN_STATUS_COLORS } from '@/types/bd';
import type { ReasonTrail, ScoreBand } from '@lcx/shared';
import { parseLink } from '@/lib/url';
import { safeHref } from '@/lib/safeHref';


const TIMELINE_KIND_STYLE: Record<string, string> = {
  message: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  handoff: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  deal: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  signal: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  discovery: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300',
  audit: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

function UnifiedTimeline({ projectId }: { projectId: string }) {
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchProjectTimeline(projectId)
      .then((e) => alive && setEntries(e))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [projectId]);

  if (failed) return <p className="text-micro text-grey italic">Timeline unavailable</p>;
  if (entries === null) return <p className="text-micro text-grey italic">Loading timeline…</p>;
  if (entries.length === 0) return <p className="text-micro text-grey italic">No activity yet</p>;

  return (
    <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
      {entries.map((e, i) => (
        <div key={i} className="flex items-start gap-2 border-b border-line/50 pb-1.5 last:border-none text-micro">
          <span className={`rounded px-1.5 py-0.5 text-micro font-semibold shrink-0 ${TIMELINE_KIND_STYLE[e.kind] ?? ''}`}>{e.kind}</span>
          <div className="flex-1 min-w-0">
            <span className="font-semibold">{e.title}</span>
            {e.detail && <span className="text-grey"> — {e.detail}</span>}
            {e.badge && <span className="ml-1 rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-micro font-semibold">{e.badge}</span>}
          </div>
          <span className="text-grey shrink-0 num-tabular">{new Date(e.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      ))}
    </div>
  );
}

export function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { clarityEnacted } = useFilterStore();
  const gateState = useGateCheck(id);

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [editPerson, setEditPerson] = useState<LeadPerson | null>(null);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [personForm, setPersonForm] = useState({
    name: '', title: '', role: 'other', linkedin: '', email: '', telegram: '',
  });
  const [personSaving, setPersonSaving] = useState(false);

  const [draftTouch, setDraftTouch] = useState(1);
  const [draftChannel, setDraftChannel] = useState<Channel>('email');
  const [draftContact, setDraftContact] = useState('');
  const [generatedDraft, setGeneratedDraft] = useState<DraftOutput | null>(null);
  const [draftWarnings, setDraftWarnings] = useState<string[]>([]);
  const [draftGenerating, setDraftGenerating] = useState(false);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [draftSaving, setDraftSaving] = useState(false);
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([]);
  const [showSavedDrafts, setShowSavedDrafts] = useState(false);
  const [draftsLoading, setDraftsLoading] = useState(false);

  const [sequences, setSequences] = useState<SequenceRecord[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [sequencesLoading, setSequencesLoading] = useState(false);
  const [showMessageLog, setShowMessageLog] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollChannel, setEnrollChannel] = useState<'email' | 'linkedin'>('email');
  const [templates, setTemplates] = useState<SequenceTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLead(id, controller.signal);
      if (!controller.signal.aborted) setLead(res.data);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load lead');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const handleAction = useCallback(async (
    action: string,
    fn: () => Promise<void>,
    successMsg: string,
  ) => {
    setActionLoading(action);
    try {
      await fn();
      toast('success', successMsg);
      load();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : `${action} failed`);
    } finally {
      setActionLoading(null);
    }
  }, [load]);

  const handleSavePerson = useCallback(async () => {
    if (!id) return;
    if (!personForm.name.trim()) { toast('error', 'Name is required'); return; }
    setPersonSaving(true);
    try {
      if (editPerson) {
        await updatePerson(id, editPerson.id, personForm);
        toast('success', 'Contact updated');
      } else {
        await addPerson(id, personForm);
        toast('success', 'Contact added');
      }
      setEditPerson(null);
      setShowAddPerson(false);
      setPersonForm({ name: '', title: '', role: 'other', linkedin: '', email: '', telegram: '' });
      load();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to save contact');
    } finally {
      setPersonSaving(false);
    }
  }, [id, editPerson, personForm, load]);

  const handleEditClick = useCallback((person: LeadPerson) => {
    setEditPerson(person);
    setPersonForm({
      name: person.name,
      title: person.title ?? '',
      role: person.role,
      linkedin: person.linkedin ?? '',
      email: person.email ?? '',
      telegram: person.telegram ?? '',
    });
    setShowAddPerson(true);
  }, []);

  const handleAddClick = useCallback(() => {
    setEditPerson(null);
    setPersonForm({ name: '', title: '', role: 'other', linkedin: '', email: '', telegram: '' });
    setShowAddPerson(true);
  }, []);

  const toggleSource = (sourceId: string) => {
    setExpandedSources(prev => {
      const next = new Set(prev);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
  };

  const loadDrafts = useCallback(async () => {
    if (!id) return;
    setDraftsLoading(true);
    try {
      const res = await fetchDrafts(id);
      setSavedDrafts(res.data);
    } catch {
      // silently fail
    } finally {
      setDraftsLoading(false);
    }
  }, [id]);

  const handleGenerateDraft = useCallback(async () => {
    if (!id || !draftContact) { toast('error', 'Select a contact first'); return; }
    setDraftGenerating(true);
    setGeneratedDraft(null);
    setDraftWarnings([]);
    try {
      const res = await apiGenerateDraft(id, {
        contactName: draftContact,
        touchIndex: draftTouch,
        channel: draftChannel,
        jurisdiction: (lead?.jurisdiction?.toLowerCase() === 'us' ? 'us' : 'eu') as 'eu' | 'us',
        clarityEnacted: clarityEnacted,
        market: lead?.jurisdiction ?? undefined,
      });
      setGeneratedDraft(res.data);
      setDraftWarnings(res.warnings ?? []);
      setEditSubject(res.data.subject);
      setEditBody(res.data.body);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to generate draft');
    } finally {
      setDraftGenerating(false);
    }
  }, [id, draftContact, draftTouch, draftChannel, lead, clarityEnacted]);

  const handleSaveDraft = useCallback(async () => {
    if (!id || !generatedDraft) return;
    setDraftSaving(true);
    try {
      const edited = editSubject !== generatedDraft.subject || editBody !== generatedDraft.body;
      await saveDraft(id, {
        contactName: draftContact,
        subject: editSubject,
        body: editBody,
        channel: draftChannel,
        touchIndex: draftTouch,
        claimsUsed: generatedDraft.claimsUsed,
        requiresHumanReview: generatedDraft.requiresHumanReview,
        operatorEdited: edited,
      });
      toast('success', 'Draft saved');
      loadDrafts();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to save draft');
    } finally {
      setDraftSaving(false);
    }
  }, [id, generatedDraft, draftContact, draftChannel, draftTouch, editSubject, editBody, loadDrafts]);

  const handleApproveDraft = useCallback(async (draftId: string) => {
    if (!id) return;
    try {
      await updateDraft(id, draftId, { approved: true });
      toast('success', 'Draft approved');
      loadDrafts();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to approve draft');
    }
  }, [id, loadDrafts]);

  const loadSequences = useCallback(async () => {
    if (!id) return;
    setSequencesLoading(true);
    try {
      const [seqRes, msgRes] = await Promise.all([
        fetchProjectSequences(id),
        fetchProjectMessages(id),
      ]);
      setSequences(seqRes.data);
      setMessages(msgRes.data);
    } catch {
      // silently fail
    } finally {
      setSequencesLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) loadSequences();
  }, [id, loadSequences]);

  const handleEnroll = useCallback(async () => {
    if (!id || !lead) return;
    const isLinkedIn = enrollChannel === 'linkedin';
    const contact = isLinkedIn
      ? lead.people.find(p => p.linkedin)
      : lead.people.find(p => p.email && p.emailStatus !== 'invalid');
    if (!contact) {
      const msg = isLinkedIn ? 'No contact with LinkedIn URL. Add one first.' : 'No contact with valid email. Add one first.';
      toast('error', msg);
      return;
    }
    setEnrolling(true);
    try {
      const res = await enrollProject(id, { personId: contact.id, channel: enrollChannel, templateId: templateId || undefined });
      toast('success', `Enrolled ${res.data.contactName} via ${isLinkedIn ? 'LinkedIn' : 'email'} — ${res.data.steps} steps`);
      loadSequences();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Enrollment failed';
      toast('error', msg);
    } finally {
      setEnrolling(false);
    }
  }, [id, lead, enrollChannel, templateId, loadSequences]);

  useEffect(() => {
    fetchSequenceTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  const handlePauseSequence = useCallback(async (seqId: string) => {
    try {
      await pauseSequence(seqId);
      toast('success', 'Sequence paused');
      loadSequences();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to pause');
    }
  }, [loadSequences]);

  const handleResumeSequence = useCallback(async (seqId: string) => {
    try {
      await resumeSequence(seqId);
      toast('success', 'Sequence resumed');
      loadSequences();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to resume');
    }
  }, [loadSequences]);

  if (loading) {
    return (
      <div className="h-[calc(100vh-6.5rem)] overflow-hidden p-4">
        <div className="max-w-[1200px] mx-auto">
          <CardSkeleton count={4} />
        </div>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="flex h-[calc(100vh-6.5rem)] items-center justify-center">
        <EmptyState
          variant="error"
          title="Failed to load lead"
          description={error || 'Not found'}
          action={<Button variant="secondary" size="sm" onClick={load}>Retry</Button>}
        />
      </div>
    );
  }

  // Parsed once, defensively: the website column is ingested and unvalidated, so
  // this can legitimately be null for a lead that still has a website string.
  const websiteLink = parseLink(lead.website);

  const outreachStatus = (lead.raw._outreach as { approved?: boolean; suppressed?: boolean } | undefined) ?? {};
  const isApproved = outreachStatus.approved === true;
  const isSuppressed = outreachStatus.suppressed === true;
  const band: ScoreBand = (lead.score?.band as ScoreBand) || 'unscored';
  const marketTag = deriveMarketTag({
    id: lead.id, name: lead.name, ticker: lead.ticker, website: lead.website,
    source: lead.source, chain: lead.chain, jurisdiction: lead.jurisdiction,
    category: lead.category, listedOnLcx: lead.listedOnLcx,
    euScore: lead.score?.euScore ?? 0, usPreScore: lead.score?.usPreScore ?? 0,
    usPostScore: lead.score?.usPostScore ?? 0, band, peopleCount: lead.people.length,
    hasContact: lead.people.length > 0, marketTag: null, createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  } as any);

  const usScore = clarityEnacted && lead.score ? lead.score.usPostScore : lead.score?.usPreScore ?? 0;
  const usLabel = clarityEnacted ? 'US (Post-CLARITY)' : 'US (Pre-CLARITY)';

  // Guided workflow: the single next action that moves this lead forward.
  // The outreach gate (checkGate) feeds in: a blocked gate outranks
  // approve/enroll because the API would reject the enrollment anyway.
  const hasContact = lead.people.some(p => p.email);
  const hasActiveSequence = sequences.some(s => s.status === 'active');
  const gateBlocked = gateState.gate != null && !gateState.gate.pass;
  //
  // `anchor` used to hold the button's LABEL text ('Find Contact Email',
  // 'Approve for Outreach', 'Sequences'). Nothing consumed it: only the 'gate'
  // case was ever wired, via scrollToEl('lead-gate-banner'), and no element in
  // the page carried an id matching any of the other three — so the page
  // computed the operator's next action and then had no way to point at it.
  // These are now stable keys, and each one resolves to something real below.
  const nextStep: { label: string; anchor: 'discover' | 'gate' | 'approve' | 'sequences' | null } | null = isSuppressed
    ? null
    : !hasContact
      ? { label: 'Next: find a contact email', anchor: 'discover' }
      : gateBlocked
        ? {
            label: `Next: clear outreach gate (${gateState.gate!.reasons.length} blocker${gateState.gate!.reasons.length === 1 ? '' : 's'})`,
            anchor: 'gate',
          }
        : !isApproved
          ? { label: 'Next: approve for outreach', anchor: 'approve' }
          : !hasActiveSequence
            ? { label: 'Next: enroll in a sequence', anchor: 'sequences' }
            : { label: 'Sequence running — watch for replies', anchor: null };

  const scrollToEl = (elId: string) => scrollToId(elId);

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col text-navy overflow-hidden">
      {/* Back + Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-line bg-card">
        <button
          onClick={() => navigate('/bd-pipeline')}
          className="rounded p-1 hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors"
          aria-label="Back to pipeline"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* ONE CAMERA (INSTRUMENT S3): the same name the pipeline row carries — see LeadTable. */}
          <h1 className="text-lg font-bold truncate text-navy" style={{ viewTransitionName: `lead-${lead.id}` }}>{lead.name}</h1>
          {lead.ticker && <span className="text-micro font-mono text-grey bg-ice-soft dark:bg-navy-deep px-1.5 py-0.5 rounded">{lead.ticker}</span>}
          <BandBadge band={band} />
          <MarketTag market={marketTag} />
        </div>
        <div className="flex items-center gap-1.5">
          {isApproved && <span className="text-micro flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold"><CheckCircle size={12} /> Approved</span>}
          {isSuppressed && <span className="text-micro flex items-center gap-1 text-red-500 font-bold"><XCircle size={12} /> Suppressed</span>}
          <button
            onClick={() => navigate(`/customer/${lead.id}`)}
            className="flex items-center gap-1.5 rounded border border-line px-3 py-1 text-micro font-bold text-navy hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors"
          >
            <Users size={12} />
            360 View
          </button>
          <button
            onClick={() => navigate(`/notes/${lead.id}`)}
            className="flex items-center gap-1.5 rounded border border-line px-3 py-1 text-micro font-bold text-navy hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors"
          >
            <Database size={12} />
            Notes &amp; Docs
          </button>
        </div>
      </div>

      {/* Actions Bar — three tiers, not seven equals.
          Before: six hand-rolled buttons sharing one class string
          (`rounded border border-line px-3 py-1 text-micro font-bold`), so
          "Force Re-score" carried the same visual authority as the approval
          that gates all outreach, and the loudest control on the bar was
          "Track / Refresh Live" — a cache warm — because it alone was tinted
          cyan. Now: ONE `primary`, whichever action `nextStep` has computed;
          the other workflow decisions `secondary`; the three re-run-a-pipeline
          actions `ghost`. Variants come from <Button>, so the hierarchy is the
          design system's, not this file's. */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-line bg-card flex-wrap">
        {/* Spent state decisions are not re-rendered as disabled buttons
            restating themselves: the header strip 40px above already shows
            "Approved" / "Suppressed". */}
        {!isApproved && (
          <Button
            size="xs"
            variant={nextStep?.anchor === 'approve' ? 'primary' : 'secondary'}
            onClick={() => handleAction('approve', () => approveLead(lead.id), 'Lead approved for outreach')}
            disabled={actionLoading === 'approve'}
          >
            <CheckCircle size={12} />
            {actionLoading === 'approve' ? 'Approving...' : 'Approve for Outreach'}
          </Button>
        )}

        {!isSuppressed && (
          <Button
            size="xs"
            variant="secondary"
            onClick={() => handleAction('suppress', () => suppressLead(lead.id), 'Lead suppressed')}
            disabled={actionLoading === 'suppress'}
          >
            <XCircle size={12} />
            {actionLoading === 'suppress' ? 'Suppressing...' : 'Mark Suppress'}
          </Button>
        )}

        {/* A workflow step, not maintenance — it is the first thing `nextStep`
            asks for on a lead with no contact, so it sits with the decisions. */}
        <Button
          size="xs"
          variant={nextStep?.anchor === 'discover' ? 'primary' : 'secondary'}
          onClick={() =>
            handleAction(
              'discover',
              async () => {
                await enqueueContactDiscovery(lead.id);
                await runDiscoveryTick();
              },
              'Contact discovery finished — check People',
            )
          }
          disabled={actionLoading === 'discover'}
        >
          <Search size={12} className={clsx(actionLoading === 'discover' && 'animate-spin motion-essential')} />
          {actionLoading === 'discover' ? 'Crawling site...' : 'Find Contact Email'}
        </Button>

        <div className="w-px h-4 bg-line mx-1" />

        {/* Maintenance: re-run a pipeline stage by hand. Useful, never the
            reason anyone opened this lead. */}
        <Button
          size="xs"
          variant="ghost"
          onClick={() => handleAction('rescore', () => triggerRescore(lead.id), 'Re-scoring complete')}
          disabled={actionLoading === 'rescore'}
        >
          <RefreshCw size={12} className={clsx(actionLoading === 'rescore' && 'animate-spin motion-essential')} />
          {actionLoading === 'rescore' ? 'Re-scoring...' : 'Force Re-score'}
        </Button>

        <Button
          size="xs"
          variant="ghost"
          onClick={() => handleAction('enrich', () => triggerEnrich(lead.id), 'Enrichment complete')}
          disabled={actionLoading === 'enrich'}
        >
          <Search size={12} className={clsx(actionLoading === 'enrich' && 'animate-spin motion-essential')} />
          {actionLoading === 'enrich' ? 'Enriching...' : 'Force Enrich'}
        </Button>

        <Button
          size="xs"
          variant="ghost"
          onClick={() => handleAction('track', async () => { await trackProject(lead.id); }, 'Tracking on — live market data pulled')}
          disabled={actionLoading === 'track'}
          title="Promote into the tracked tier and pull live market data now"
        >
          <Zap size={12} className={clsx(actionLoading === 'track' && 'animate-spin motion-essential')} />
          {actionLoading === 'track' ? 'Tracking...' : 'Track / Refresh Live'}
        </Button>

        {/* The narration pill stays a pill — it explains WHY that primary is
            primary, it is not a second copy of it. It becomes interactive only
            when the action it names is off-screen (the gate banner, the
            Sequences section); when the target is the primary button 40px to
            the left, a jump-to-it button would be noise. */}
        {nextStep && (nextStep.anchor === 'gate' || nextStep.anchor === 'sequences' ? (
          <button
            type="button"
            onClick={() => scrollToEl(nextStep.anchor === 'gate' ? 'lead-gate-banner' : 'lead-sequences')}
            className={clsx(
              'ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1 text-micro font-bold transition-colors',
              nextStep.anchor === 'gate'
                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:border-amber-400'
                : 'bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300 hover:border-cyan-400',
            )}
            title={nextStep.anchor === 'gate' ? 'Jump to the gate banner for the exact blockers' : 'Jump to Sequences to enroll this lead'}
          >
            <span className={clsx('h-1.5 w-1.5 rounded-full animate-pulse', nextStep.anchor === 'gate' ? 'bg-amber-500' : 'bg-cyan-500')} />
            {nextStep.label}
          </button>
        ) : (
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 px-3 py-1 text-micro font-bold text-cyan-700 dark:text-cyan-300">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
            {nextStep.label}
          </span>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto p-4 space-y-4">
          {/* Outreach gate — why outreach is (or isn't) allowed right now */}
          <GateBanner check={gateState} id="lead-gate-banner" />

          {/* Regulatory posture — LCX's moat, front and center */}
          {lead.regulatoryPosture && <RegulatoryPosture posture={lead.regulatoryPosture} />}

          {/* Identity */}
          <Section icon={<Globe size={14} />} title="Identity">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-label">
              <Field label="Website" value={lead.website}>
                {websiteLink ? <a href={safeHref(websiteLink.href)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-cyan-700 dark:text-cyan-400 hover:underline"><ExternalLink size={10} /> {websiteLink.host}</a> : lead.website ? <span className="text-grey" title="This website could not be parsed as a URL, so it is shown as plain text rather than a link.">{lead.website}</span> : null}
              </Field>
              <Field label="Jurisdiction" value={lead.jurisdiction ?? '—'} />
              <Field label="Chain" value={lead.chain ?? '—'} />
              <Field label="Category" value={lead.category ?? '—'} />
              <Field label="Source" value={lead.source} />
              <Field label="Market Cap" value={lead.marketCap ?? '—'} />
              <Field label="ESMA Token ID" value={lead.esmaTokenId ?? '—'} />
              <Field label="DTI" value={lead.dti ?? '—'} />
              <Field label="Listed on LCX" value={lead.listedOnLcx ? 'Yes' : 'No'} />
              <Field label="Whitepaper" value={lead.whitepaperUrl ? (
                <a href={safeHref(lead.whitepaperUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-cyan-700 dark:text-cyan-400 hover:underline">
                  <FileText size={10} /> View Whitepaper
                </a>
              ) : '—'} />
            </div>
          </Section>

          {/* Dual Score Breakdown */}
          <Section icon={<Award size={14} />} title="Scoring">
            <div className="space-y-4">
              {/* Priority = propensity × gate, with click-to-why on each term */}
              <PriorityEquation
                propensity={lead.score?.propensityScore}
                priority={lead.score?.priorityScore}
                euScore={lead.score?.euScore}
                usPostScore={lead.score?.usPostScore}
                onExplainPropensity={() => scrollToEl('lead-propensity')}
                onExplainGate={() => scrollToEl('lead-gate-banner')}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <PropensityTrail
                  id="lead-propensity"
                  score={lead.score?.propensityScore}
                  reasons={lead.score?.propensityReasons}
                />
                <UsIntelGauges signals={lead.score?.usIntelSignals} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ScoreCard
                  title="EU / MiCA"
                  score={lead.score?.euScore ?? 0}
                  band={band}
                  reasons={lead.score?.reasons ?? []}
                  clarityEnacted={clarityEnacted}
                />
                <ScoreCard
                  title={usLabel}
                  score={usScore}
                  band={band}
                  reasons={lead.score?.reasons ?? []}
                  clarityEnacted={clarityEnacted}
                  isUs
                />
              </div>
            </div>
          </Section>

          {/* People */}
          <Section icon={<Users size={14} />} title={`People (${lead.people.length})`}>
            {showAddPerson && (
              <div className="mb-3 rounded border border-cyan-200 dark:border-cyan-800 bg-cyan-50/50 dark:bg-cyan-950/10 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-micro font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
                    {editPerson ? 'Edit Contact' : 'Add Contact'}
                  </span>
                  <button onClick={() => { setShowAddPerson(false); setEditPerson(null); }} className="rounded p-0.5 hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors">
                    <X size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input value={personForm.name} onChange={(e) => setPersonForm(p => ({ ...p, name: e.target.value }))} placeholder="Name *" className="rounded border border-line bg-card px-2 py-1 text-label outline-none focus:border-cyan-500 col-span-2" />
                  <input value={personForm.title} onChange={(e) => setPersonForm(p => ({ ...p, title: e.target.value }))} placeholder="Title" className="rounded border border-line bg-card px-2 py-1 text-label outline-none focus:border-cyan-500" />
                  <select value={personForm.role} onChange={(e) => setPersonForm(p => ({ ...p, role: e.target.value }))} className="rounded border border-line bg-card px-2 py-1 text-label outline-none focus:border-cyan-500">
                    <option value="other">Other</option>
                    <option value="founder">Founder</option>
                    <option value="ceo">CEO</option>
                    <option value="bd">BD</option>
                    <option value="listings">Listings</option>
                  </select>
                  <input value={personForm.email} onChange={(e) => setPersonForm(p => ({ ...p, email: e.target.value }))} placeholder="Email" className="rounded border border-line bg-card px-2 py-1 text-label outline-none focus:border-cyan-500" />
                  <input value={personForm.linkedin} onChange={(e) => setPersonForm(p => ({ ...p, linkedin: e.target.value }))} placeholder="LinkedIn URL" className="rounded border border-line bg-card px-2 py-1 text-label outline-none focus:border-cyan-500" />
                  <input value={personForm.telegram} onChange={(e) => setPersonForm(p => ({ ...p, telegram: e.target.value }))} placeholder="Telegram" className="rounded border border-line bg-card px-2 py-1 text-label outline-none focus:border-cyan-500" />
                </div>
                <button
                  onClick={handleSavePerson}
                  disabled={personSaving}
                  className="rounded bg-cyan-600 text-white px-3 py-1 text-micro font-bold hover:bg-cyan-700 transition-colors disabled:opacity-50"
                >
                  {personSaving ? 'Saving...' : editPerson ? 'Update Contact' : 'Add Contact'}
                </button>
              </div>
            )}

            {lead.people.length === 0 && !showAddPerson ? (
              <p className="text-label text-grey italic">No contacts recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-label">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="text-left py-2 px-2 text-micro font-medium uppercase tracking-wider text-grey">Name</th>
                      <th className="text-left py-2 px-2 text-micro font-medium uppercase tracking-wider text-grey">Role</th>
                      <th className="text-left py-2 px-2 text-micro font-medium uppercase tracking-wider text-grey">Title</th>
                      <th className="text-left py-2 px-2 text-micro font-medium uppercase tracking-wider text-grey">Email</th>
                      <th className="text-left py-2 px-2 text-micro font-medium uppercase tracking-wider text-grey">Email Status</th>
                      <th className="text-left py-2 px-2 text-micro font-medium uppercase tracking-wider text-grey">LinkedIn</th>
                      <th className="text-left py-2 px-2 text-micro font-medium uppercase tracking-wider text-grey">LI Status</th>
                      <th className="text-left py-2 px-2 text-micro font-medium uppercase tracking-wider text-grey">Telegram</th>
                      <th className="text-left py-2 px-2 text-micro font-medium uppercase tracking-wider text-grey">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/50">
                    {lead.people.map((person) => (
                      <tr key={person.id} className="hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10">
                        <td className="py-1.5 px-2">
                          <EntityChip
                            type="contact"
                            id={`${lead.id}:${person.id}`}
                            name={person.name}
                            stateLine={person.title ? `${person.title} at ${lead.name}` : `at ${lead.name}`}
                            className="font-medium"
                          />
                        </td>
                        <td className="py-1.5 px-2"><RoleBadge role={person.role} /></td>
                        <td className="py-1.5 px-2 text-grey">{person.title ?? '—'}</td>
                        <td className="py-1.5 px-2">
                          {person.email ? (
                            <a href={`mailto:${person.email}`} className="text-cyan-700 dark:text-cyan-400 hover:underline">{person.email}</a>
                          ) : '—'}
                        </td>
                        <td className="py-1.5 px-2"><EmailStatusBadge status={person.emailStatus} /></td>
                        <td className="py-1.5 px-2">
                          {person.linkedin ? (
                            <a href={safeHref(person.linkedin)} target="_blank" rel="noopener noreferrer" className="text-cyan-700 dark:text-cyan-400 hover:underline inline-flex items-center gap-1">
                              <ExternalLink size={9} /> Profile
                            </a>
                          ) : '—'}
                        </td>
                        <td className="py-1.5 px-2">
                          <span className={`inline-flex rounded px-1.5 py-0.5 text-micro font-bold leading-none ${LINKEDIN_STATUS_COLORS[person.linkedinStatus ?? 'none']}`}>
                            {person.linkedinStatus ?? 'none'}
                          </span>
                        </td>
                        <td className="py-1.5 px-2">{person.telegram ?? '—'}</td>
                        <td className="py-1.5 px-2">
                          <button
                            onClick={() => handleEditClick(person)}
                            className="rounded p-1 text-grey hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors"
                            aria-label="Edit contact"
                          >
                            <Pencil size={11} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!showAddPerson && (
              <button onClick={handleAddClick} className="mt-2 flex items-center gap-1 text-micro font-bold text-cyan-700 dark:text-cyan-400 hover:underline">
                <Plus size={11} /> Add Contact
              </button>
            )}
          </Section>

          {/* Unified activity timeline */}
          <Section icon={<Activity size={14} />} title="Activity Timeline">
            <UnifiedTimeline projectId={lead.id} />
          </Section>

          {/* Signals Timeline */}
          <Section icon={<Activity size={14} />} title={`Signals (${lead.signals.length})`}>
            {lead.signals.length === 0 ? (
              <p className="text-label text-grey italic">No signals recorded.</p>
            ) : (
              <div className="space-y-2">
                {lead.signals.map((signal) => (
                  <SignalItem key={signal.id} signal={signal} />
                ))}
              </div>
            )}
          </Section>

          {/* Source Payloads (collapsible) */}
          <Section icon={<Database size={14} />} title={`Source Payloads (${lead.sources.length})`}>
            {lead.sources.length === 0 ? (
              <p className="text-label text-grey italic">No source payloads.</p>
            ) : (
              <div className="space-y-2">
                {lead.sources.map((src) => {
                  const isOpen = expandedSources.has(src.id);
                  return (
                    <div key={src.id} className="rounded border border-line overflow-hidden">
                      <button
                        onClick={() => toggleSource(src.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-label font-semibold hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10 transition-colors text-left"
                      >
                        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <span className="font-mono">{src.source}</span>
                        {src.externalId && <span className="text-micro text-grey font-mono">#{src.externalId}</span>}
                        <span className="ml-auto text-micro text-grey">{new Date(src.createdAt).toLocaleDateString()}</span>
                      </button>
                      {isOpen && (
                        <div className="border-t border-line/50 px-3 py-2 max-h-72 overflow-y-auto">
                          <StructuredPayload payload={src.payload} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Sequences */}
          <Section icon={<Send size={14} />} title="Sequences" id="lead-sequences">
            <div className="space-y-3">
              <button
                onClick={() => navigate('/outreach-ops')}
                className="flex items-center gap-1.5 rounded border border-line px-3 py-1 text-micro font-bold text-navy hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors"
              >
                Manage in Outreach Ops →
              </button>
              <div className="flex items-center gap-2">
                <div className="flex rounded border border-line overflow-hidden">
                  <button
                    onClick={() => setEnrollChannel('email')}
                    className={`px-2 py-1.5 text-micro font-bold transition-colors ${enrollChannel === 'email' ? 'bg-cyan-600 text-white' : 'bg-ice-soft dark:bg-ice-soft/5 text-grey hover:bg-ice-soft/50'}`}
                  >
                    Email
                  </button>
                  <button
                    onClick={() => setEnrollChannel('linkedin')}
                    className={`px-2 py-1.5 text-micro font-bold transition-colors ${enrollChannel === 'linkedin' ? 'bg-cyan-600 text-white' : 'bg-ice-soft dark:bg-ice-soft/5 text-grey hover:bg-ice-soft/50'}`}
                  >
                    LinkedIn
                  </button>
                </div>
                {templates.length > 0 && (
                  <select
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    className="rounded border border-line px-1.5 py-1.5 text-micro bg-transparent"
                    title="Cadence template (blank = default 5-touch)"
                  >
                    <option value="">Default cadence</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({t.steps.length})</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={handleEnroll}
                  disabled={enrolling}
                  className="rounded bg-cyan-600 text-white px-3 py-1.5 text-micro font-bold hover:bg-cyan-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  <Send size={11} />
                  {enrolling ? 'Enrolling...' : `Enroll (${enrollChannel})`}
                </button>
                <button
                  onClick={() => { loadSequences(); setShowMessageLog(!showMessageLog); }}
                  className="rounded border border-line px-3 py-1.5 text-micro font-bold text-grey hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors"
                >
                  {showMessageLog ? 'Hide Messages' : `Messages (${messages.length})`}
                </button>
              </div>

              {sequences.length > 0 && (
                <div className="space-y-2">
                  {sequences.map(seq => (
                    <div key={seq.id} className="rounded border border-line overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 border-b border-line bg-ice-soft dark:bg-ice-soft/5">
                        <div className="flex items-center gap-2">
                          <span className={`rounded px-1.5 py-0.5 text-micro font-bold ${SEQUENCE_STATUS_COLORS[seq.status] ?? ''}`}>
                            {seq.status}
                          </span>
                          <span className="text-micro text-grey">Step {seq.currentStep}/5</span>
                          <span className="text-micro text-grey">{seq.channel}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {seq.status === 'active' && (
                            <button onClick={() => handlePauseSequence(seq.id)} className="rounded border border-amber-200 text-amber-600 dark:border-amber-800 dark:text-amber-400 px-2 py-0.5 text-micro font-bold hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors">
                              Pause
                            </button>
                          )}
                          {seq.status === 'paused' && (
                            <button onClick={() => handleResumeSequence(seq.id)} className="rounded border border-cyan-200 text-cyan-700 dark:border-cyan-800 dark:text-cyan-400 px-2 py-0.5 text-micro font-bold hover:bg-cyan-50 dark:hover:bg-cyan-950/20 transition-colors">
                              Resume
                            </button>
                          )}
                          {seq.status === 'handoff' && seq.handoffId && (
                            <button onClick={() => navigate('/outreach')} className="rounded border border-purple-200 text-purple-600 dark:border-purple-800 dark:text-purple-400 px-2 py-0.5 text-micro font-bold hover:bg-purple-50 dark:hover:bg-purple-950/20 transition-colors">
                              Handoff
                            </button>
                          )}
                        </div>
                      </div>
                      {seq.startedAt && (
                        <div className="px-3 py-1.5 text-micro text-grey">
                          Started {new Date(seq.startedAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {sequences.length === 0 && (
                <p className="text-label text-grey italic">Not enrolled in any sequence.</p>
              )}

              {showMessageLog && (
                <div className="space-y-2">
                  <span className="text-micro font-bold uppercase tracking-wider text-grey block">Message Log</span>
                  {sequencesLoading ? (
                    <div className="space-y-1.5">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="h-8 animate-pulse rounded bg-ice-soft dark:bg-ice-soft/10" />
                      ))}
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="text-label text-grey italic">No messages sent yet.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {messages.map(msg => (
                        <div key={msg.id} className="rounded border border-line px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className={`rounded px-1.5 py-0.5 text-micro font-bold ${MESSAGE_STATUS_COLORS[msg.status] ?? ''}`}>
                              {msg.status}
                            </span>
                            <span className="text-micro font-medium truncate flex-1">{msg.subject}</span>
                            <span className="text-micro text-grey">{msg.toEmail}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-micro text-grey">Touch {msg.touchIndex}</span>
                            {msg.sentAt && <span className="text-micro text-grey">{new Date(msg.sentAt).toLocaleString()}</span>}
                            {msg.error && <span className="text-micro text-red-500">{msg.error}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Section>

          {/* Deal Desk */}
          <Section icon={<Award size={14} />} title="Deal">
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => navigate(`/deal-desk?projectId=${id}`)}
                className="flex items-center gap-1.5 rounded border border-line px-3 py-1 text-micro font-bold text-navy hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors"
              >
                Open in Deal Desk →
              </button>
              <button
                onClick={() => navigate('/deal-board')}
                className="flex items-center gap-1.5 rounded border border-line px-3 py-1 text-micro font-bold text-navy hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors"
              >
                View on Board →
              </button>
            </div>
            <DealSection projectId={id!} />
          </Section>

          {/* Drafting */}
          <Section icon={<Mail size={14} />} title="Drafts">
            <div className="space-y-3">
              {/* Controls row */}
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-micro font-bold uppercase tracking-wider text-grey block mb-1">Touch</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(t => (
                      <button
                        key={t}
                        onClick={() => { setDraftTouch(t); setGeneratedDraft(null); }}
                        className={clsx(
                          'rounded px-2 py-1 text-micro font-bold transition-colors',
                          draftTouch === t
                            ? 'bg-cyan-600 text-white'
                            : 'border border-line text-grey hover:bg-ice-soft dark:hover:bg-ice-soft/10',
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-micro font-bold uppercase tracking-wider text-grey block mb-1">Channel</label>
                  <div className="flex gap-1">
                    {(['email', 'linkedin', 'telegram'] as Channel[]).map(ch => (
                      <button
                        key={ch}
                        onClick={() => { setDraftChannel(ch); setGeneratedDraft(null); }}
                        className={clsx(
                          'rounded px-2 py-1 text-micro font-bold transition-colors',
                          draftChannel === ch
                            ? 'bg-cyan-600 text-white'
                            : 'border border-line text-grey hover:bg-ice-soft dark:hover:bg-ice-soft/10',
                        )}
                      >
                        {CHANNEL_LABELS[ch]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-micro font-bold uppercase tracking-wider text-grey block mb-1">Contact</label>
                  <select
                    value={draftContact}
                    onChange={(e) => { setDraftContact(e.target.value); setGeneratedDraft(null); }}
                    className="rounded border border-line bg-card px-2 py-1 text-label outline-none focus:border-cyan-500 min-w-[120px]"
                  >
                    <option value="">Select...</option>
                    {lead.people.map(p => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleGenerateDraft}
                  disabled={draftGenerating || !draftContact}
                  className="rounded bg-cyan-600 text-white px-3 py-1.5 text-micro font-bold hover:bg-cyan-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  <Mail size={11} />
                  {draftGenerating ? 'Generating...' : `Generate Touch ${draftTouch}`}
                </button>
                <button
                  onClick={() => { loadDrafts(); setShowSavedDrafts(!showSavedDrafts); }}
                  className="rounded border border-line px-3 py-1.5 text-micro font-bold text-grey hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors"
                >
                  {showSavedDrafts ? 'Hide Saved' : `Saved (${savedDrafts.length})`}
                </button>
              </div>

              {/* Warnings */}
              {draftWarnings.length > 0 && (
                <div className="rounded border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 px-3 py-2">
                  {draftWarnings.map((w, i) => (
                    <p key={i} className="text-micro text-amber-700 dark:text-amber-400">{w}</p>
                  ))}
                </div>
              )}

              {/* Draft Preview */}
              {generatedDraft && (
                <div className="rounded border border-line overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-line bg-ice-soft dark:bg-ice-soft/5">
                    <span className="text-micro font-bold">{TOUCH_LABELS[draftTouch]} — {CHANNEL_LABELS[draftChannel]}</span>
                    <div className="flex items-center gap-2">
                      {generatedDraft.requiresHumanReview && (
                        <span className="text-micro text-amber-600 dark:text-amber-400 font-bold">Requires Review</span>
                      )}
                      <span className="text-micro text-grey">{generatedDraft.claimsUsed.length} claim(s)</span>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <div>
                      <label className="text-micro font-bold uppercase tracking-wider text-grey block mb-1">Subject</label>
                      <input
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                        className="w-full rounded border border-line bg-card px-2 py-1.5 text-label outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="text-micro font-bold uppercase tracking-wider text-grey block mb-1">Body</label>
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={8}
                        className="w-full rounded border border-line bg-card px-2 py-1.5 text-label font-mono leading-relaxed outline-none focus:border-cyan-500 resize-y"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSaveDraft}
                        disabled={draftSaving}
                        className="rounded bg-emerald-600 text-white px-3 py-1 text-micro font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        <CheckCircle size={11} />
                        {draftSaving ? 'Saving...' : 'Save Draft'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Saved Drafts */}
              {showSavedDrafts && (
                <div className="space-y-2">
                  {draftsLoading ? (
                    <p className="text-label text-grey italic">Loading saved drafts...</p>
                  ) : savedDrafts.length === 0 ? (
                    <p className="text-label text-grey italic">No saved drafts.</p>
                  ) : (
                    savedDrafts.map(d => (
                      <div key={d.id} className="rounded border border-line overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-line bg-ice-soft dark:bg-ice-soft/5">
                          <div className="flex items-center gap-2">
                            <span className="text-micro font-bold">Touch {d.touchIndex} — {d.channel}</span>
                            <span className="text-micro text-grey">to {d.contactName}</span>
                            {d.approved && <span className="text-micro text-emerald-600 dark:text-emerald-400 font-bold">Approved</span>}
                            {d.requiresHumanReview && <span className="text-micro text-amber-600 dark:text-amber-400 font-bold">Review</span>}
                          </div>
                          <div className="flex items-center gap-1">
                            {!d.approved && (
                              <button
                                onClick={() => handleApproveDraft(d.id)}
                                className="rounded border border-emerald-200 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400 px-2 py-0.5 text-micro font-bold hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors"
                              >
                                Approve
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="p-3">
                          <p className="text-label font-bold mb-1">{d.subject}</p>
                          <p className="text-micro text-grey whitespace-pre-wrap line-clamp-3">{d.body}</p>
                          <p className="text-micro text-grey mt-1">{new Date(d.createdAt).toLocaleString()}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function Section({ icon, title, children, id }: { icon: React.ReactNode; title: string; children: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="rounded-lg border border-line bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-line bg-ice-soft dark:bg-ice-soft/5 text-navy">
        <span className="text-cyan-500">{icon}</span>
        <SectionLabel>{title}</SectionLabel>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function Field({ label, value, children }: { label: string; value: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div>
      <span className="text-micro font-bold uppercase tracking-wider text-grey block mb-0.5">{label}</span>
      <span className="text-navy">{children ?? (value ?? '—')}</span>
    </div>
  );
}

function ScoreCard({ title, score, band, reasons, isUs }: {
  title: string; score: number; band: ScoreBand;
  reasons: ReasonTrail[]; clarityEnacted: boolean; isUs?: boolean;
}) {
  const scoreReasons = reasons.filter(r => isUs ? r.code.startsWith('us_') || r.code.startsWith('red_flag') : r.code.startsWith('eu_') || r.code.startsWith('red_flag'));
  const filtered = scoreReasons.length > 0 ? scoreReasons : reasons;

  return (
    <div className="rounded-lg border border-line overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-line bg-ice-soft dark:bg-ice-soft/5">
        <ScoreBadge score={score} band={band} />
        <span className="text-label font-bold">{title}</span>
        <BandBadge band={band} />
      </div>
      <div className="p-3 space-y-2">
        {filtered.length === 0 ? (
          <p className="text-micro text-grey italic">No reason trail recorded.</p>
        ) : (
          filtered.map((r, i) => (
            <EvidenceChip key={i} reason={r} />
          ))
        )}
      </div>
    </div>
  );
}

function EvidenceChip({ reason }: { reason: ReasonTrail }) {
  const pct = reason.max > 0 ? Math.round((reason.points / reason.max) * 100) : 0;
  const color = pct >= 80 ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-400'
    : pct >= 50 ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-400'
    : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-800 dark:text-red-400';
  return (
    <div className={`rounded border px-2.5 py-1.5 ${color}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-micro font-bold uppercase tracking-wider">{reason.factor}</span>
        <span className="text-micro font-mono font-bold">{reason.points}/{reason.max}</span>
      </div>
      <p className="text-micro mt-0.5 opacity-80">{reason.note}</p>
    </div>
  );
}

function SignalItem({ signal }: { signal: LeadSignal }) {
  const kindColors: Record<string, string> = {
    enrichment: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/20 dark:text-cyan-400',
    price_movement: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400',
    news: 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/20 dark:text-purple-400',
    outreach_event: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400',
  };
  const defaultColor = 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/20 dark:text-slate-400';
  const color = kindColors[signal.kind] || defaultColor;

  const hasPayload = typeof signal.payload === 'object' && signal.payload !== null && Object.keys(signal.payload).length > 0;

  return (
    <div className={`rounded border px-3 py-2 ${color}`}>
      <div className="flex items-center gap-2">
        <span className="text-micro font-bold uppercase tracking-wider">{signal.kind.replace(/_/g, ' ')}</span>
        <span className="text-micro opacity-60 ml-auto">{new Date(signal.observedAt).toLocaleString()}</span>
      </div>
      {hasPayload && <StructuredPayload payload={signal.payload} maxRows={3} className="mt-1.5" />}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    founder: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800',
    ceo: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
    bd: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
    listings: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
    other: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  };
  return (
    <span className={`inline-flex rounded border px-1.5 py-0.5 text-micro font-bold leading-none ${colors[role] || colors.other}`}>
      {role}
    </span>
  );
}

/* ── Deal Sub-component ── */
function DealSection({ projectId }: { projectId: string }) {
  const [deal, setDeal] = useState<import('@/types/bd').DealRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [events, setEvents] = useState<import('@/types/bd').DealEvent[]>([]);
  const [objections, setObjections] = useState<import('@/types/bd').DealObjection[]>([]);
  const [showEvents, setShowEvents] = useState(false);
  const [showObjections, setShowObjections] = useState(false);
  const [pkgType, setPkgType] = useState('listing');
  const [objCategory, setObjCategory] = useState('');
  const [objDesc, setObjDesc] = useState('');
  const [objSeverity, setObjSeverity] = useState('medium');
  const [stageReason, setStageReason] = useState('');

  const loadDeal = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchProjectDeal(projectId);
      setDeal(res.data);
      if (res.data) {
        const [evtRes, objRes] = await Promise.all([
          fetchDealEvents(res.data.id),
          fetchDealObjections(res.data.id),
        ]);
        setEvents(evtRes.data);
        setObjections(objRes.data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadDeal(); }, [loadDeal]);

  const handleCreate = async () => {
    setActionLoading('create');
    try {
      const res = await createDeal(projectId, { packageType: pkgType });
      setDeal(res.data);
      toast('success', 'Deal created');
      loadDeal();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to create deal');
    } finally {
      setActionLoading('');
    }
  };

  const handleStageTransition = async (stage: string) => {
    if (!deal) return;
    setActionLoading(`stage-${stage}`);
    try {
      const ok = await transitionDealWithGate(deal.id, {
        stage,
        winReason: stage === 'won' ? stageReason : undefined,
        lossReason: stage === 'lost' ? stageReason : undefined,
        lossCategory: stage === 'lost' ? 'other' : undefined,
      });
      if (ok) {
        toast('success', `Stage updated to ${stage}`);
        setStageReason('');
        loadDeal();
      }
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed');
    } finally {
      setActionLoading('');
    }
  };

  const handleGenerateProposal = async () => {
    if (!deal) return;
    setActionLoading('proposal');
    try {
      await generateProposal(deal.id);
      toast('success', 'Proposal generated');
      loadDeal();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed');
    } finally {
      setActionLoading('');
    }
  };

  const handleAddObjection = async () => {
    if (!deal || !objCategory || !objDesc.trim()) return;
    setActionLoading('objection');
    try {
      await addDealObjection(deal.id, { category: objCategory, description: objDesc, severity: objSeverity });
      toast('success', 'Objection logged');
      setObjCategory('');
      setObjDesc('');
      loadDeal();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed');
    } finally {
      setActionLoading('');
    }
  };

  if (loading) return <p className="text-micro text-grey italic py-2">Loading deal...</p>;

  if (!deal) {
    return (
      <div className="space-y-2 py-2">
        <p className="text-micro text-grey italic">No deal for this project yet.</p>
        <div className="flex items-center gap-2">
          <select value={pkgType} onChange={e => setPkgType(e.target.value)} className="rounded border border-line px-2 py-1 text-micro bg-surface dark:bg-navy-deep focus-ring">
            <option value="listing">Listing ($20K)</option>
            <option value="marketing">Marketing ($20K)</option>
            <option value="liquidity">Liquidity ($10K)</option>
            <option value="dual">Dual EU+US ($50K)</option>
            <option value="emt">EMT ($30K)</option>
            <option value="custom">Custom</option>
          </select>
          <button onClick={handleCreate} disabled={actionLoading === 'create'} className="rounded bg-cyan-600 text-white px-3 py-1 text-micro font-bold hover:bg-cyan-700 transition-colors disabled:opacity-50">
            {actionLoading === 'create' ? '...' : 'Create Deal'}
          </button>
        </div>
      </div>
    );
  }

  const NEXT_STAGES: Record<string, string[]> = {
    not_started: ['contacted'],
    contacted: ['discovery'],
    discovery: ['proposal'],
    proposal: ['negotiating'],
    negotiating: ['won', 'lost'],
  };

  const availableNext = NEXT_STAGES[deal.stage] ?? [];
  const isTerminal = deal.stage === 'won' || deal.stage === 'lost';
  const valueStr = deal.packageValue ? `$${(deal.packageValue / 100).toLocaleString()}` : '—';

  return (
    <div className="space-y-3 py-2">
      {/* Stage badge + value */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-flex rounded px-2 py-0.5 text-micro font-bold ${STAGE_COLORS[deal.stage] ?? ''}`}>
            {STAGE_LABELS[deal.stage] ?? deal.stage}
          </span>
          <span className="text-micro text-grey">{deal.packageType} · {valueStr}</span>
          {deal.owner && <span className="text-micro text-grey">{deal.owner}</span>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowEvents(!showEvents)} className="rounded border border-line px-2 py-0.5 text-micro font-bold hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors">
            {showEvents ? 'Hide' : `${events.length} Events`}
          </button>
          {deal.stage === 'proposal' || deal.stage === 'negotiating' ? (
            <button onClick={handleGenerateProposal} disabled={actionLoading === 'proposal'} className="rounded border border-line px-2 py-0.5 text-micro font-bold hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors disabled:opacity-50 flex items-center gap-1">
              <FileOutput size={9} /> {actionLoading === 'proposal' ? '...' : 'Generate Proposal'}
            </button>
          ) : null}
        </div>
      </div>

      {/* Stage transitions */}
      {!isTerminal && availableNext.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-micro font-bold text-grey">Advance:</span>
          {availableNext.map(stage => (
            <button key={stage} onClick={() => {
              if (stage === 'won' || stage === 'lost') return; // needs reason
              handleStageTransition(stage);
            }} disabled={actionLoading === `stage-${stage}`} className="rounded border border-line px-2 py-0.5 text-micro font-bold hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors disabled:opacity-50">
              {actionLoading === `stage-${stage}` ? '...' : STAGE_LABELS[stage] ?? stage}
            </button>
          ))}
          {/* Win/Loss with reason */}
          <div className="flex items-center gap-1 ml-2">
            <input value={stageReason} onChange={e => setStageReason(e.target.value)} placeholder="Reason for close..." className="w-36 rounded border border-line px-1.5 py-0.5 text-micro bg-surface dark:bg-navy-deep focus-ring" />
            <button onClick={() => handleStageTransition('won')} disabled={actionLoading === 'stage-won' || !stageReason.trim()} className="rounded bg-emerald-600 text-white px-2 py-0.5 text-micro font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-1">
              <ThumbsUp size={9} /> {actionLoading === 'stage-won' ? '...' : 'Won'}
            </button>
            <button onClick={() => handleStageTransition('lost')} disabled={actionLoading === 'stage-lost' || !stageReason.trim()} className="rounded bg-red-600 text-white px-2 py-0.5 text-micro font-bold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-1">
              <ThumbsDown size={9} /> {actionLoading === 'stage-lost' ? '...' : 'Lost'}
            </button>
          </div>
        </div>
      )}

      {/* Proposal snapshot */}
      {deal.proposalSnapshot && (
        <div className="rounded border border-line p-2 text-micro space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-bold">Proposal — {deal.proposalSnapshot.packageType}</span>
            <span className="text-micro text-grey">${(deal.proposalSnapshot.packageValue / 100).toLocaleString()}</span>
          </div>
          <p className="text-grey">Valid until {new Date(deal.proposalSnapshot.validUntil).toLocaleDateString()}</p>
          {deal.proposalSnapshot.tiers && deal.proposalSnapshot.tiers.length > 0 ? (
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {deal.proposalSnapshot.tiers.map((tier) => (
                <div
                  key={tier.name}
                  className={`rounded border p-1.5 ${tier.recommended ? 'border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/20' : 'border-line'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-micro font-bold">{tier.name}</span>
                    {tier.recommended && <span className="rounded bg-cyan-600 px-1 text-[7px] font-bold text-white">REC</span>}
                  </div>
                  <div className="text-micro font-mono font-bold">${(tier.priceCents / 100).toLocaleString()}</div>
                  <ul className="mt-0.5 list-disc list-inside text-micro text-grey">
                    {tier.inclusions.map((inc, i) => <li key={i} className="truncate">{inc}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <span className="text-micro font-bold text-grey">Includes:</span>
              <ul className="list-disc list-inside text-micro text-grey">
                {deal.proposalSnapshot.inclusions.map((inc, i) => <li key={i}>{inc}</li>)}
              </ul>
            </div>
          )}
          {deal.proposalSnapshot.claimsUsed.length > 0 && (
            <div>
              <span className="text-micro font-bold text-grey">Claims referenced ({deal.proposalSnapshot.claimsUsed.length}):</span>
              <p className="text-micro text-grey line-clamp-2">{deal.proposalSnapshot.claimsUsed.slice(0, 3).join('; ')}{deal.proposalSnapshot.claimsUsed.length > 3 ? '...' : ''}</p>
            </div>
          )}
          <p className="text-micro text-grey italic">{deal.proposalSnapshot.disclaimer}</p>
        </div>
      )}

      {/* Win/loss info */}
      {deal.winReason && <p className="text-micro text-emerald-600 dark:text-emerald-400 font-bold">Won: {deal.winReason}</p>}
      {deal.lossReason && <p className="text-micro text-red-500">Lost: {deal.lossReason} {deal.lossCategory ? `(${deal.lossCategory})` : ''}</p>}

      {/* Objections */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-micro font-bold text-grey">Objections ({objections.length})</span>
          <button onClick={() => setShowObjections(!showObjections)} className="text-micro text-cyan-700 dark:text-cyan-400 hover:underline">
            {showObjections ? 'Hide' : 'Log'}
          </button>
        </div>
        {showObjections && (
          <div className="space-y-1 mb-2">
            <div className="flex gap-1">
              <select value={objCategory} onChange={e => setObjCategory(e.target.value)} className="rounded border border-line px-1.5 py-0.5 text-micro bg-surface dark:bg-navy-deep focus-ring">
                <option value="">Category...</option>
                <option value="price">Price</option>
                <option value="volume">Volume</option>
                <option value="liquidity">Liquidity</option>
                <option value="dd">Due Diligence</option>
                <option value="mica">MiCA</option>
                <option value="timeline">Timeline</option>
                <option value="competitor">Competitor</option>
                <option value="other">Other</option>
              </select>
              <select value={objSeverity} onChange={e => setObjSeverity(e.target.value)} className="rounded border border-line px-1.5 py-0.5 text-micro bg-surface dark:bg-navy-deep focus-ring">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="blocker">Blocker</option>
              </select>
              <input value={objDesc} onChange={e => setObjDesc(e.target.value)} placeholder="Describe objection..." className="flex-1 rounded border border-line px-1.5 py-0.5 text-micro bg-surface dark:bg-navy-deep focus-ring" />
              <button onClick={handleAddObjection} disabled={actionLoading === 'objection' || !objCategory || !objDesc.trim()} className="rounded bg-cyan-600 text-white px-2 py-0.5 text-micro font-bold disabled:opacity-50">
                Add
              </button>
            </div>
          </div>
        )}
        {objections.map(obj => (
          <div key={obj.id} className="flex items-center gap-2 text-micro border-b border-line last:border-none py-1">
            <span className={`inline-flex rounded px-1 py-0.5 text-micro font-bold ${obj.severity === 'blocker' ? 'bg-red-100 text-red-700 dark:bg-red-950/30' : obj.severity === 'high' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30' : 'bg-slate-100 text-slate-600 dark:bg-slate-800'}`}>{obj.severity}</span>
            <span className="font-bold">{obj.category}</span>
            <span className="text-grey flex-1 truncate">{obj.description}</span>
            {obj.resolved ? <span className="text-emerald-600 dark:text-emerald-400">Resolved</span> : <span className="text-amber-600 dark:text-amber-400">Open</span>}
          </div>
        ))}
      </div>

      {/* Deal events */}
      {showEvents && events.length > 0 && (
        <div className="space-y-1">
          <span className="text-micro font-bold text-grey block">Timeline</span>
          {events.map(e => (
            <div key={e.id} className="flex items-center gap-2 text-micro border-b border-line last:border-none py-0.5">
              <span className="text-grey">{new Date(e.createdAt).toLocaleDateString()}</span>
              <span className={`inline-flex rounded px-1 py-0.5 text-micro font-bold ${e.eventType === 'stage_change' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800'}`}>
                {e.eventType}
              </span>
              {e.oldStage && e.newStage && <span>{e.oldStage} → {e.newStage}</span>}
              {e.content && <span className="text-grey truncate">{e.content}</span>}
              <span className="text-grey ml-auto">{e.actor}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmailStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    verified: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
    valid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
    invalid: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400',
    catch_all: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
    unverified: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  };
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-micro font-bold leading-none ${colors[status] || colors.unverified}`}>
      {status}
    </span>
  );
}

export default LeadDetail;
