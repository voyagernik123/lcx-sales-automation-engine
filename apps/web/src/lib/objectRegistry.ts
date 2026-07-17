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
    route: id => `/bd-pipeline/${id.split(':')[0]}`,
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
