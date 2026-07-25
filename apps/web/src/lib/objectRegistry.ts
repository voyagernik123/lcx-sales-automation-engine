import {
  Boxes, Briefcase, FileBarChart, FileText, Gavel, ListChecks, MessageSquare,
  Newspaper, Scale, User, Zap, type LucideIcon,
} from 'lucide-react';
import type { InspectorEntityType } from '@/stores/useInspectorStore';

/**
 * The object registry — the platform's periodic table (FINAL_MASTER_PLAN 3.1).
 *
 * Every noun rendered anywhere must be one of these 11 types, and every
 * rendering goes through the same four zoom levels: L1 mention (EntityChip),
 * L2 peek (hover card), L3 inspector (drawer payload), L4 workspace (route).
 *
 * Types with an `inspector` open the drawer in place; the rest navigate to
 * their workspace — either way, a dead entity name is a bug by definition.
 */
export type ObjectType =
  | 'project'
  | 'contact'
  | 'deal'
  | 'listing'
  | 'interaction'
  | 'claim'
  | 'jurisdiction'
  | 'signal'
  | 'task'
  | 'document'
  | 'decision';

export interface ObjectTypeDef {
  /** Singular display label ("Project"). */
  label: string;
  icon: LucideIcon;
  /** Accent class for the type dot in chips/peeks. */
  dotCls: string;
  /** Drawer payload type, when an L3 inspector exists for this object. */
  inspector?: InspectorEntityType;
  /** L4 workspace route. `id` may be ignored by list-shaped workspaces. */
  route: (id: string) => string;
}

export const OBJECT_TYPES: Record<ObjectType, ObjectTypeDef> = {
  project: {
    label: 'Project',
    icon: Boxes,
    dotCls: 'bg-cyan-500',
    inspector: 'project',
    route: id => `/bd-pipeline/${id}`,
  },
  contact: {
    label: 'Contact',
    icon: User,
    dotCls: 'bg-violet-500',
    inspector: 'contact', // id is `${projectId}:${personId}`
    route: id => `/contacts/${id}`,
  },
  deal: {
    label: 'Deal',
    icon: Briefcase,
    dotCls: 'bg-emerald-500',
    inspector: 'deal',
    route: () => '/deal-board',
  },
  listing: {
    label: 'Listing',
    icon: Zap,
    dotCls: 'bg-amber-500',
    inspector: 'listing', // id is the won deal's id
    route: () => '/deal-desk',
  },
  interaction: {
    label: 'Interaction',
    icon: MessageSquare,
    dotCls: 'bg-sky-500',
    inspector: 'handoff',
    route: () => '/outreach',
  },
  claim: {
    label: 'Claim',
    icon: Scale,
    dotCls: 'bg-indigo-500',
    inspector: 'claim',
    route: () => '/claim-library',
  },
  jurisdiction: {
    label: 'Jurisdiction',
    icon: Gavel,
    dotCls: 'bg-rose-500',
    inspector: 'jurisdiction', // id is a US state abbreviation or country code
    route: () => '/states',
  },
  signal: {
    label: 'Signal',
    icon: Newspaper,
    dotCls: 'bg-orange-500',
    inspector: 'signal', // payload renders from seed (the row already has it)
    route: () => '/market-news',
  },
  task: {
    label: 'Task',
    icon: ListChecks,
    dotCls: 'bg-teal-500',
    inspector: 'task',
    route: () => '/tasks',
  },
  document: {
    label: 'Document',
    icon: FileText,
    dotCls: 'bg-slate-500',
    inspector: 'document', // payload renders from seed (note/draft content)
    route: () => '/notes',
  },
  decision: {
    label: 'Decision',
    icon: FileBarChart,
    dotCls: 'bg-fuchsia-500',
    inspector: 'decision', // id is the decided deal's id
    route: () => '/win-loss',
  },
};

/** Inspector payload type → object type, for breadcrumb labels. */
export const INSPECTOR_TO_OBJECT: Record<InspectorEntityType, ObjectType> = {
  project: 'project',
  deal: 'deal',
  handoff: 'interaction',
  contact: 'contact',
  claim: 'claim',
  task: 'task',
  signal: 'signal',
  listing: 'listing',
  decision: 'decision',
  jurisdiction: 'jurisdiction',
  document: 'document',
};

/* ── what GET /v1/search returns ──────────────────────────────────────────────
 *
 * The eleven ObjectTypes above are the READING vocabulary: which drawer opens,
 * which icon, which route. They are NOT the vocabulary governed actions are
 * written in — ACTION_REGISTRY addresses subjects as `command_decision`,
 * `dist_listing`, `member`, `access_request`, … and there is no honest
 * translation between the two lists, which is why ⌘K reached 7 of 22 actions.
 *
 * So the server states the registry's subject type on every search group and the
 * client translates NOTHING. `subjectType` is the noun's type, verbatim.
 * `inspector` remains what it always was and is now OPTIONAL, because a program
 * task or a launch blocker is fully actionable and has no reader at all.
 *
 * A mapping table from ObjectType → subject type would have been the shorter
 * change and the worse system: it is a second place to remember, and forgetting
 * it fails silently as an empty verb menu.
 */

export interface SearchGroup {
  key: string;
  /** Plural group heading. */
  label: string;
  /** Singular type name, for the row chip when there is no inspector. */
  typeLabel?: string;
  /** The ACTION_REGISTRY subject type. Used verbatim as the noun's type. */
  subjectType?: string;
  /** The L3 drawer, when this object has one. Absent = actionable, not readable. */
  inspector?: InspectorEntityType;
  count: number;
  items: Array<{ id: string; label: string; sublabel?: string; seed?: Record<string, unknown> }>;
}

/**
 * The type chip for a search result row.
 *
 * Prefers the object registry when there is an inspector, so the five readable
 * types keep the exact label they have everywhere else in the app and cannot
 * drift from it by a server edit; falls back to the server's singular label for
 * the actionable-only types, which have no entry here by definition.
 */
export function searchTypeLabel(
  group: Pick<SearchGroup, 'inspector' | 'typeLabel' | 'subjectType'>,
): string {
  if (group.inspector) {
    const objectType = INSPECTOR_TO_OBJECT[group.inspector];
    // Guarded rather than indexed blind: an inspector name this build does not
    // know (a newer API) would otherwise read `undefined.label` and blank the
    // whole command line rather than one chip.
    if (objectType && OBJECT_TYPES[objectType]) return OBJECT_TYPES[objectType].label;
  }
  return group.typeLabel ?? group.subjectType ?? 'Object';
}
