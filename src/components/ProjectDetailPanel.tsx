import { useState, useRef, useEffect } from 'react';
import { useProjects } from '../hooks/useProjects';
import { accentToHex } from '../utils/accentToHex';
import type { AccentColor, ProjectStatus, ProjectTask, ProjectTaskStatus, EnergyLevel } from '../types';
import '../styles/projects.css';

const COLORS: AccentColor[] = ['plum', 'rose', 'peach', 'orange', 'yellow', 'blue', 'ghost'];

const STATUS_CYCLE: ProjectTaskStatus[] = ['not_started', 'in_progress', 'done', 'skipped'];

const STATUS_ICON: Record<ProjectTaskStatus, string> = {
  not_started: '○',
  in_progress: '◐',
  done:        '✓',
  skipped:     '⊘',
};

const PROJECT_STATUS_VALUES: ProjectStatus[] = ['active', 'paused', 'completed', 'archived'];

const STATUS_ORDER: Record<ProjectTaskStatus, number> = {
  not_started: 0,
  in_progress: 1,
  done:        2,
  skipped:     3,
};

const ENERGY_COLORS: Record<EnergyLevel, string> = {
  high:   '#7C4FD9',
  medium: '#5A8EFC',
  low:    '#6BA5A0',
  zero:   '#4A4A5A',
};

type TaskFilter = 'all' | ProjectTaskStatus;

const TASK_FILTER_TABS: { key: TaskFilter; label: string }[] = [
  { key: 'all',         label: 'all'         },
  { key: 'not_started', label: 'not started' },
  { key: 'in_progress', label: 'in progress' },
  { key: 'done',        label: 'done'        },
];

interface Props {
  projectId: string;
  onClose: () => void;
}

export function ProjectDetailPanel({ projectId, onClose }: Props) {
  const {
    getProject,
    updateProject,
    addProjectTask,
    updateProjectTask,
    deleteProjectTask,
    setTaskStatus,
  } = useProjects();

  const project = getProject(projectId);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [editingEst, setEditingEst] = useState<string | null>(null);
  const [estInput, setEstInput] = useState('');

  const nameRef = useRef<HTMLHeadingElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (nameRef.current && project) {
      nameRef.current.textContent = project.name;
    }
    if (descRef.current && project) {
      descRef.current.value = project.description;
      autoResize(descRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  if (!project) return null;

  const filteredTasks = [...project.tasks]
    .filter(t => taskFilter === 'all' || t.status === taskFilter)
    .sort((a, b) => {
      const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      return so !== 0 ? so : a.order - b.order;
    });

  const cycleStatus = (task: ProjectTask) => {
    const idx = STATUS_CYCLE.indexOf(task.status);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    setTaskStatus(project.id, task.id, next);
  };

  const formatEst = (mins?: number): string => {
    if (!mins) return '';
    if (mins < 60) return `~${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `~${h}h` : `~${h}h${m}m`;
  };

  const parseEst = (raw: string): number | null => {
    const s = raw.trim().toLowerCase();
    const mMatch = s.match(/^(\d+)\s*m(in)?$/);
    if (mMatch) return parseInt(mMatch[1], 10);
    const hMatch = s.match(/^(\d+(?:\.\d+)?)\s*h(r|ours?)?$/);
    if (hMatch) return Math.round(parseFloat(hMatch[1]) * 60);
    const hmMatch = s.match(/^(\d+)\s*h\s*(\d+)\s*m/);
    if (hmMatch) return parseInt(hmMatch[1], 10) * 60 + parseInt(hmMatch[2], 10);
    const n = parseInt(s, 10);
    if (!isNaN(n) && n > 0) return n;
    return null;
  };

  const totalTasks = project.tasks.length;
  const doneTasks  = project.tasks.filter(t => t.status === 'done').length;
  const remaining  = project.tasks
    .filter(t => t.status === 'not_started' || t.status === 'in_progress')
    .reduce((sum, t) => sum + (t.estimatedMinutes ?? 0), 0);

  const formatRemaining = (mins: number): string => {
    if (mins < 60) return `~${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `~${h}h` : `~${h}h${m}m`;
  };

  return (
    <div className="project-detail-panel" onClick={e => e.stopPropagation()}>
      {/* Header */}
      <div className="project-detail-header">
        <div className="project-detail-header-row">
          {/* Emoji picker */}
          <input
            type="text"
            maxLength={2}
            defaultValue={project.emoji ?? ''}
            onBlur={e => updateProject(project.id, { emoji: e.target.value.trim() || undefined })}
            placeholder="✦"
            style={{
              width: 28, background: 'transparent', border: '1px dashed var(--border)',
              borderRadius: 4, color: 'var(--text)', fontSize: 16, textAlign: 'center',
              padding: '1px 2px', outline: 'none', flexShrink: 0,
            }}
            title="Set emoji"
          />
          {/* Editable name */}
          <h2
            ref={nameRef}
            className="project-detail-name"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Project name…"
            onBlur={() => updateProject(project.id, { name: nameRef.current?.textContent?.trim() || project.name })}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); } }}
          />
          <button className="project-detail-close" onClick={onClose}>×</button>
        </div>

        {/* Status pills */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {PROJECT_STATUS_VALUES.map(s => (
            <button
              key={s}
              onClick={() => updateProject(project.id, { status: s })}
              style={{
                background: project.status === s ? accentToHex(project.color) + '22' : 'transparent',
                border: `1px solid ${project.status === s ? accentToHex(project.color) : 'var(--border)'}`,
                borderRadius: 10,
                color: project.status === s ? accentToHex(project.color) : 'var(--text-faint)',
                fontSize: 10, padding: '2px 8px', cursor: 'pointer',
                fontFamily: 'system-ui, sans-serif', textTransform: 'capitalize',
                transition: 'all 0.12s',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Color picker */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => updateProject(project.id, { color: c })}
              style={{
                width: 13, height: 13, borderRadius: '50%',
                background: accentToHex(c),
                border: project.color === c ? `2px solid ${accentToHex(c)}` : '2px solid transparent',
                outline: project.color === c ? '1px solid rgba(255,255,255,0.6)' : 'none',
                cursor: 'pointer', padding: 0, flexShrink: 0,
              }}
              title={c}
            />
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="project-detail-body">
        {/* Description */}
        <textarea
          ref={descRef}
          className="project-detail-desc"
          rows={2}
          placeholder="Context for this project — what is it, what's the goal, any constraints…"
          defaultValue={project.description}
          onInput={e => autoResize(e.currentTarget)}
          onBlur={e => updateProject(project.id, { description: e.currentTarget.value })}
        />

        {/* Task list header */}
        <div className="project-tasks-header">
          <span className="project-tasks-label">tasks</span>
          <div style={{ display: 'flex', gap: 3 }}>
            {TASK_FILTER_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTaskFilter(key)}
                style={{
                  background: taskFilter === key ? 'color-mix(in srgb, var(--plum) 15%, transparent)' : 'transparent',
                  border: `1px solid ${taskFilter === key ? 'var(--plum)' : 'var(--border)'}`,
                  borderRadius: 8,
                  color: taskFilter === key ? 'var(--plum)' : 'var(--text-faint)',
                  fontSize: 9, padding: '1px 6px', cursor: 'pointer',
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            className="project-add-task-btn"
            onClick={() => {
              const t = addProjectTask(project.id);
              setExpandedTaskId(t.id);
            }}
          >
            + add task
          </button>
        </div>

        {/* Task rows */}
        {filteredTasks.map(task => (
          <div key={task.id} className="project-task-row">
            <div
              className="project-task-main"
              onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
            >
              <button
                className="project-task-status-btn"
                onClick={e => { e.stopPropagation(); cycleStatus(task); }}
                title={`Status: ${task.status} — click to advance`}
              >
                {STATUS_ICON[task.status]}
              </button>

              <input
                className={`project-task-content${task.status === 'done' ? ' project-task-content--done' : ''}`}
                type="text"
                defaultValue={task.content}
                placeholder="Task…"
                onClick={e => e.stopPropagation()}
                onBlur={e => updateProjectTask(project.id, task.id, { content: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              />

              {/* Estimated minutes */}
              {editingEst === task.id ? (
                <input
                  autoFocus
                  type="text"
                  placeholder="30m, 2h…"
                  value={estInput}
                  onChange={e => setEstInput(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const mins = parseEst(estInput);
                      if (mins) updateProjectTask(project.id, task.id, { estimatedMinutes: mins });
                      setEditingEst(null); setEstInput('');
                    }
                    if (e.key === 'Escape') { setEditingEst(null); setEstInput(''); }
                  }}
                  onBlur={() => { setEditingEst(null); setEstInput(''); }}
                  style={{ width: 60, background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-faint)', fontSize: 10, padding: '1px 4px', outline: 'none', fontFamily: 'system-ui, sans-serif' }}
                />
              ) : (
                <span
                  className="project-task-est"
                  onClick={e => {
                    e.stopPropagation();
                    setEditingEst(task.id);
                    setEstInput(task.estimatedMinutes ? String(task.estimatedMinutes) : '');
                  }}
                  title="Click to set estimated time"
                >
                  {formatEst(task.estimatedMinutes) || '~?'}
                </span>
              )}

              {/* Energy dot */}
              {task.energyRequired && (
                <span
                  style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: ENERGY_COLORS[task.energyRequired],
                    flexShrink: 0, display: 'inline-block',
                  }}
                  title={`Energy: ${task.energyRequired}`}
                />
              )}

              <button
                className="project-task-delete"
                onClick={e => { e.stopPropagation(); deleteProjectTask(project.id, task.id); }}
                title="Delete task"
              >×</button>
            </div>

            {/* Notes — collapsible */}
            {expandedTaskId === task.id && (
              <textarea
                className="project-task-notes"
                rows={2}
                placeholder="Notes, steps, details…"
                defaultValue={task.notes}
                autoFocus
                onBlur={e => updateProjectTask(project.id, task.id, { notes: e.target.value })}
                onClick={e => e.stopPropagation()}
              />
            )}
          </div>
        ))}

        {/* Progress summary */}
        <div className="project-detail-summary">
          {totalTasks} tasks · {doneTasks} done
          {remaining > 0 && ` · ${formatRemaining(remaining)} remaining`}
        </div>
      </div>
    </div>
  );
}
