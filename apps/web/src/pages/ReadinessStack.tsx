import { useState, useMemo } from 'react';
import { InspectorDrawer } from '@/components/ui';
import { readinessItems } from '@/data/readiness';
import { ReadinessItem, ReadinessStatus } from '@/types/ontology';
import { useAuditStore } from '@/stores/useAuditStore';
import { FileText, Award, Landmark, User, Save } from 'lucide-react';
import { clsx } from 'clsx';

const categoryIcons = {
  Corporate: Landmark,
  Documents: FileText,
  Surveillance: Award,
};

const statusColors: Record<ReadinessStatus, string> = {
  'Not Started': 'bg-slate-100 border-slate-300 text-slate-500 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400',
  'In Progress': 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-950/20 dark:border-blue-900 dark:text-blue-400',
  'Counsel Review': 'bg-amber-50 border-amber-200 text-amber-600 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-400',
  Complete: 'bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-400',
};

const statusBorder: Record<ReadinessStatus, string> = {
  'Not Started': 'border-l-slate-400',
  'In Progress': 'border-l-blue-400',
  'Counsel Review': 'border-l-amber-400',
  Complete: 'border-l-emerald-400',
};

export function ReadinessStack() {
  const {
    readinessAssignments,
    readinessStatusOverrides,
    updateReadinessAssignment,
    updateReadinessStatus,
    addAuditLog,
    safeHarborToggles,
  } = useAuditStore();

  const [selectedTask, setSelectedTask] = useState<ReadinessItem | null>(null);

  // Temporary drawer form states
  const [owner, setOwner] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [subtasks, setSubtasks] = useState<Record<string, boolean>>({});

  // Merge base readiness items with status overrides and safe harbor toggles
  const items = useMemo(() => {
    return readinessItems.map(item => {
      let status = readinessStatusOverrides[item.id] || item.status;
      if (safeHarborToggles?.defiExempt && item.id === 'SURV_TRUST') {
        status = 'Complete';
      }
      if (safeHarborToggles?.micaExempt && (item.id === 'CORP_PARENT' || item.id === 'CORP_CFIUS')) {
        status = 'Complete';
      }
      return { ...item, status };
    });
  }, [readinessStatusOverrides, safeHarborToggles]);

  const handleOpenTask = (task: ReadinessItem) => {
    setSelectedTask(task);
    const assign = readinessAssignments[task.id] || { owner: '', notes: '', subtasks: {} };
    setOwner(assign.owner || 'Unassigned');
    setNotes(assign.notes || task.notes);
    setSubtasks(assign.subtasks || {});
    addAuditLog(`CCO opened Kanban task details: [${task.id}]`, 'Audit');
  };

  const handleSaveAssignment = () => {
    if (!selectedTask) return;
    updateReadinessAssignment(selectedTask.id, owner, notes, subtasks);
    setSelectedTask(null);
    addAuditLog(`CCO saved assignments for Kanban task [${selectedTask.id}]`, 'System');
  };

  const handleSubtaskToggle = (key: string) => {
    setSubtasks(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Get aggregated stats
  const total = items.length;
  const completeCount = items.filter(i => i.status === 'Complete').length;
  const progressPercent = total ? Math.round((completeCount / total) * 100) : 0;

  const renderColumn = (category: 'Corporate' | 'Documents' | 'Surveillance') => {
    const colItems = items.filter(i => i.category === category);
    const Icon = categoryIcons[category];

    return (
      <div className="flex-1 flex flex-col min-h-0 bg-ice-soft/20 dark:bg-navy-deep/10 border border-line rounded-lg p-3">
        {/* Column Header */}
        <div className="flex justify-between items-center pb-2 border-b border-line mb-3 shrink-0 select-none">
          <div className="flex items-center gap-2">
            <Icon size={14} className="text-grey" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-grey">{category}</h3>
          </div>
          <span className="font-mono text-[10px] bg-card border border-line rounded-full px-2 py-0.5 font-bold">
            {colItems.length}
          </span>
        </div>

        {/* Column Scrollable Cards */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
          {colItems.map(item => {
            const assign = readinessAssignments[item.id] || { owner: 'Unassigned', notes: '' };
            const subtaskCount = Object.values(assign.subtasks || {}).filter(Boolean).length;
            const borderAccent = statusBorder[item.status] || 'border-l-slate-400';

            return (
              <div
                key={item.id}
                onClick={() => handleOpenTask(item)}
                className={clsx(
                  'bg-card border border-line border-l-4 rounded p-3 text-left transition-all hover:border-grey hover:scale-[1.01] active:scale-[0.99] cursor-pointer shadow-sm relative select-none',
                  borderAccent
                )}
              >
                <div className="flex justify-between items-start gap-2">
                  <h4 className="font-bold text-xs leading-snug">{item.name}</h4>
                  <span className={clsx('text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border', statusColors[item.status])}>
                    {item.status}
                  </span>
                </div>
                <p className="text-[10px] text-grey-dark dark:text-grey-light mt-1.5 leading-relaxed line-clamp-2">
                  {item.description}
                </p>

                {/* Subtask and Assignee readouts */}
                <div className="pt-2 mt-2 border-t border-line/45 flex justify-between items-center text-[9px] font-mono text-grey leading-none">
                  <div className="flex items-center gap-1">
                    <User size={10} />
                    <span className="font-sans font-semibold uppercase">{assign.owner || 'Unassigned'}</span>
                  </div>
                  <span>{subtaskCount} / {Object.keys(assign.subtasks || {}).length} SUBTASKS</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col gap-4 text-navy dark:text-ice overflow-hidden">
      {/* Header and Progress summary */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">Compliance Operations Kanban</h1>
          <p className="text-sm text-grey-dark dark:text-grey-light mt-0.5">
            Organize task structures, file validations, and surveillance auditing controls for the U.S. launch cohort.
          </p>
        </div>

        {/* Global Progress Gauge */}
        <div className="flex items-center gap-3 bg-card border border-line rounded px-4 py-1.5 shrink-0 font-mono shadow-sm">
          <div className="text-right">
            <div className="text-[9px] text-grey uppercase font-bold tracking-wider">Overall Controls Completed</div>
            <div className="text-[10px] text-grey-dark">{completeCount} of {total} verified</div>
          </div>
          <span className="text-2xl font-extrabold text-cyan-500">{progressPercent}%</span>
        </div>
      </div>

      {/* Kanban Columns Layout Grid */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0 overflow-hidden">
        {renderColumn('Corporate')}
        {renderColumn('Documents')}
        {renderColumn('Surveillance')}
      </div>

      {/* Task Assignment slide-out Drawer */}
      <InspectorDrawer isOpen={!!selectedTask} onClose={() => setSelectedTask(null)} title={selectedTask?.name ?? ''}>
        {selectedTask && (
          <div className="space-y-4 text-xs text-navy dark:text-ice leading-relaxed">
            <div className="space-y-2 pb-3 border-b border-line">
              <span className="font-bold text-[9px] uppercase tracking-wider text-grey block">Control Target Description</span>
              <p>{selectedTask.description}</p>
              <div className="text-[9px] font-mono text-grey mt-1">
                <strong>GATES SERVICE:</strong> {selectedTask.gatingFor}
              </div>
            </div>

            {/* Task Status Dropdown */}
            <div className="space-y-1.5">
              <label className="font-bold text-[9px] uppercase tracking-wider text-grey block">Control Verification Status</label>
              <select
                value={readinessStatusOverrides[selectedTask.id] || selectedTask.status}
                onChange={e => updateReadinessStatus(selectedTask.id, e.target.value as ReadinessStatus)}
                className="w-full h-8 rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 font-semibold focus:outline-none"
              >
                <option value="Not Started">Not Started</option>
                <option value="In Progress">In Progress</option>
                <option value="Counsel Review">Counsel Review</option>
                <option value="Complete">Complete</option>
              </select>
            </div>

            {/* Owner Dropdown */}
            <div className="space-y-1.5">
              <label className="font-bold text-[9px] uppercase tracking-wider text-grey block">Assigned Owner Role</label>
              <select
                value={owner}
                onChange={e => setOwner(e.target.value)}
                className="w-full h-8 rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 font-semibold focus:outline-none"
              >
                <option value="Unassigned">Unassigned</option>
                <option value="Chief Compliance Officer (CCO)">Chief Compliance Officer (CCO)</option>
                <option value="Regulatory Counsel (Counsel)">Regulatory Counsel (Counsel)</option>
                <option value="Chief Technology Officer (CTO)">Chief Technology Officer (CTO)</option>
                <option value="Operational Risk Lead (Analyst)">Operational Risk Lead (Analyst)</option>
              </select>
            </div>

            {/* Subtask Checklists */}
            <div className="space-y-2 pt-2 border-t border-line">
              <label className="font-bold text-[9px] uppercase tracking-wider text-grey block">Operational Checklists</label>
              <div className="space-y-1.5">
                {[
                  { key: 'draft', label: '1. Drafting regulatory policies & procedures' },
                  { key: 'counsel', label: '2. External legal counsel audit & opinion' },
                  { key: 'exec', label: '3. Board & C-Suite executive sign-off' },
                ].map(sub => {
                  const active = !!subtasks[sub.key];
                  return (
                    <button
                      key={sub.key}
                      onClick={() => handleSubtaskToggle(sub.key)}
                      className={clsx(
                        'flex items-center gap-2.5 w-full text-left p-1.5 rounded hover:bg-ice-soft dark:hover:bg-ice-soft/10 text-[11px] font-semibold transition-colors'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        readOnly
                        className="rounded border-grey/40 text-navy focus:ring-0 cursor-pointer h-3.5 w-3.5"
                      />
                      <span className={active ? 'line-through text-grey' : ''}>{sub.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Audit Notes Review Textarea */}
            <div className="space-y-1.5 pt-2 border-t border-line">
              <label className="font-bold text-[9px] uppercase tracking-wider text-grey block">CCO Audit Review Comments</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Input notes, counsel references, or audit checklist comments..."
                className="w-full rounded border border-line bg-ice-soft dark:bg-navy-deep p-2 text-[11px] focus:outline-none placeholder-grey/50"
              />
            </div>

            {/* Save Covenants Button */}
            <button
              onClick={handleSaveAssignment}
              className="w-full h-9 rounded bg-navy dark:bg-ice text-white dark:text-navy hover:opacity-95 text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm mt-3"
            >
              <Save size={13} />
              <span>Save Control Assignment</span>
            </button>
          </div>
        )}
      </InspectorDrawer>
    </div>
  );
}
export default ReadinessStack;
