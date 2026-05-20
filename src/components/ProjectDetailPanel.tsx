import { useState, useRef, useEffect } from 'react';
import { useAIProjectAssistant } from '../hooks/useAIProjectAssistant';
import { useSettings } from '../hooks/useSettings';
import { accentToHex } from '../utils/accentToHex';
import type {
  AccentColor, Project, ProjectStatus, ProjectTask,
  ProjectTaskStatus, EnergyLevel,
} from '../types';
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
  project: Project;
  onClose: () => void;
  onUpdateProject: (id: string, changes: Partial<Omit<Project, 'id' | 'createdAt'>>) => void;
  onAddTask: (projectId: string, content?: string) => ProjectTask;
  onUpdateTask: (
    projectId: string,
    taskId: string,
    changes: Partial<Omit<ProjectTask, 'id' | 'createdAt'>>
  ) => void;
  onDeleteTask: (projectId: string, taskId: string) => void;
  onSetTaskStatus: (projectId: string, taskId: string, status: ProjectTaskStatus) => void;
}

export function ProjectDetailPanel({
  project,
  onClose,
  onUpdateProject,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onSetTaskStatus,
}: Props) {
  const { settings } = useSettings();
  const { loading: aiLoading, error: aiError, breakdownTask, generateProjectPlan, toProjectTasks } =
    useAIProjectAssistant(settings.claudeApiKey ?? '');

  const [taskFilter, setTaskFilter]     = useState<TaskFilter>('all');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [editingEst, setEditingEst]     = useState<string | null>(null);
  const [estInput, setEstInput]         = useState('');
  const [aiInput, setAiInput]           = useState('');

  const nameRef = useRef<HTMLHeadingElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Initialise DOM-managed fields when a new project is loaded (component remounts via key)
  useEffect(() => {
    if (nameRef.current) nameRef.current.textContent = project.name;
    if (descRef.current) {
      descRef.current.value = project.description;
      autoResize(descRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  const filteredTasks = [...project.tasks]
    .filter(t => taskFilter === 'all' || t.status === taskFilter)
    .sort((a, b) => {
      const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      return so !== 0 ? so : a.order - b.order;
    });

  const cycleStatus = (task: ProjectTask) => {
    const idx  = STATUS_CYCLE.indexOf(task.status);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    onSetTaskStatus(project.id, task.id, next);
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

  // Add AI-generated tasks with full metadata
  const applyAITasks = async (aiTasks: Awaited<ReturnType<typeof breakdownTask>>) => {
    if (!aiTasks) return;
    const planned = toProjectTasks(aiTasks);
    for (const t of planned) {
      const task = onAddTask(project.id, t.content);
      const extra: Partial<Omit<ProjectTask, 'id' | 'createdAt'>> = {};
      if (t.notes)             extra.notes             = t.notes;
      if (t.estimatedMinutes)  extra.estimatedMinutes  = t.estimatedMinutes;
      if (t.energyRequired)    extra.energyRequired    = t.energyRequired;
      if (Object.keys(extra).length) onUpdateTask(project.id, task.id, extra);
    }
    setAiInput('');
  };

  return (
    <div className="project-detail-panel" onClick={e => e.stopPropagation()}>
      {/* ── Header ── */}
      <div className="project-detail-header">
        <div className="project-detail-header-row">
          {/* Emoji */}
          <input
            type="text"
            maxLength={2}
            defaultValue={project.emoji ?? ''}
            onBlur={e => onUpdateProject(project.id, { emoji: e.target.value.trim() || undefined })}
            placeholder="✦"
            style={{
              width: 28, background: 'transparent', border: '1px dashed var(--border)',
              borderRadius: 4, color: 'rgba(240, 230, 255, 0.9)', fontSize: 16, textAlign: 'center',
              padding: '1px 2px', outline: 'none', flexShrink: 0,
            }}
            title="Set emoji"
          />
          {/* Project name — contentEditable, saved on blur */}
          <h2
            ref={nameRef}
            className="project-detail-name"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Project name…"
            onBlur={() =>
              onUpdateProject(project.id, {
                name: nameRef.current?.textContent?.trim() || project.name,
              })
            }
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); }
            }}
          />
          <button className="project-detail-close" onClick={onClose}>×</button>
        </div>

        {/* Status pills */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {PROJECT_STATUS_VALUES.map(s => (
            <button
              key={s}
              onClick={() => onUpdateProject(project.id, { status: s })}
              style={{
                background: project.status === s ? accentToHex(project.color) + '22' : 'transparent',
                border: `1px solid ${project.status === s ? accentToHex(project.color) : 'var(--border)'}`,
                borderRadius: 10,
                color: project.status === s ? accentToHex(project.color) : 'rgba(180, 160, 210, 0.6)',
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
              onClick={() => onUpdateProject(project.id, { color: c })}
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

      {/* ── Body ── */}
      <div className="project-detail-body">
        {/* Description */}
        <textarea
          ref={descRef}
          className="project-detail-desc"
          rows={2}
          placeholder="Context for this project — what is it, what's the goal, any constraints…"
          defaultValue={project.description}
          onInput={e => autoResize(e.currentTarget)}
          onBlur={e => onUpdateProject(project.id, { description: e.currentTarget.value })}
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
                  background: taskFilter === key
                    ? 'color-mix(in srgb, var(--plum) 15%, transparent)'
                    : 'transparent',
                  border: `1px solid ${taskFilter === key ? 'var(--plum)' : 'var(--border)'}`,
                  borderRadius: 8,
                  color: taskFilter === key ? 'var(--plum)' : 'rgba(180, 160, 210, 0.6)',
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
              const t = onAddTask(project.id);
              setExpandedTaskId(t.id);
            }}
          >
            + add task
          </button>
        </div>

        {/* AI task bar */}
        <div className="project-ai-bar">
          <input
            type="text"
            className="project-ai-input"
            placeholder="Describe a task to break down, or leave blank to plan whole project…"
            value={aiInput}
            onChange={e => setAiInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') e.preventDefault();
            }}
          />
          <button
            className="project-ai-btn"
            disabled={aiLoading || !settings.claudeApiKey || !aiInput.trim()}
            title={!settings.claudeApiKey ? 'Add Claude API key in Settings first' : 'Break this task into subtasks'}
            onClick={async () => {
              const result = await breakdownTask(aiInput.trim(), project.description);
              await applyAITasks(result);
            }}
          >
            {aiLoading ? 'thinking…' : '⚡ break down'}
          </button>
          <button
            className="project-ai-btn"
            disabled={aiLoading || !settings.claudeApiKey}
            title={!settings.claudeApiKey ? 'Add Claude API key in Settings first' : 'Generate a full project plan'}
            onClick={async () => {
              const result = await generateProjectPlan(project.name, project.description);
              await applyAITasks(result);
            }}
          >
            {aiLoading ? 'thinking…' : '✦ plan project'}
          </button>
        </div>
        {aiError && (
          <div style={{ fontSize: 10, color: '#C0604A', fontFamily: 'system-ui, sans-serif', padding: '2px 0' }}>
            {aiError}
          </div>
        )}

        {/* Task rows */}
        {filteredTasks.map(task => {
          const isExpanded = expandedTaskId === task.id;
          return (
            <div key={task.id} className="project-task-row">
              <div className="project-task-main">
                {/* Status toggle */}
                <button
                  className="project-task-status-btn"
                  onClick={() => cycleStatus(task)}
                  title={`Status: ${task.status} — click to advance`}
                >
                  {STATUS_ICON[task.status]}
                </button>

                {/* Task content — uncontrolled, saves on blur */}
                <input
                  className={`project-task-content${task.status === 'done' ? ' project-task-content--done' : ''}`}
                  type="text"
                  defaultValue={task.content}
                  placeholder="Task…"
                  onBlur={e => onUpdateTask(project.id, task.id, { content: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                />

                {/* Expand / collapse notes */}
                <button
                  className="project-task-est"
                  onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                  title={isExpanded ? 'Collapse notes' : 'Expand notes'}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  {isExpanded ? '▾' : '▸'}
                </button>

                {/* Estimated minutes */}
                {editingEst === task.id ? (
                  <input
                    autoFocus
                    type="text"
                    placeholder="30m, 2h…"
                    value={estInput}
                    onChange={e => setEstInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const mins = parseEst(estInput);
                        if (mins) onUpdateTask(project.id, task.id, { estimatedMinutes: mins });
                        setEditingEst(null); setEstInput('');
                      }
                      if (e.key === 'Escape') { setEditingEst(null); setEstInput(''); }
                    }}
                    onBlur={() => { setEditingEst(null); setEstInput(''); }}
                    style={{
                      width: 60, background: 'transparent',
                      border: '1px solid var(--border)', borderRadius: 4,
                      color: 'rgba(200, 185, 220, 0.8)', fontSize: 10, padding: '1px 4px',
                      outline: 'none', fontFamily: 'system-ui, sans-serif',
                    }}
                  />
                ) : (
                  <span
                    className="project-task-est"
                    onClick={() => { setEditingEst(task.id); setEstInput(task.estimatedMinutes ? String(task.estimatedMinutes) : ''); }}
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
                  onClick={() => onDeleteTask(project.id, task.id)}
                  title="Delete task"
                >×</button>
              </div>

              {/* Notes — collapsible, saved on blur */}
              {isExpanded && (
                <textarea
                  key={`notes-${task.id}`}
                  className="project-task-notes"
                  rows={2}
                  placeholder="Notes, steps, details…"
                  defaultValue={task.notes}
                  autoFocus
                  onBlur={e => onUpdateTask(project.id, task.id, { notes: e.target.value })}
                />
              )}
            </div>
          );
        })}

        {/* Progress summary */}
        <div className="project-detail-summary">
          {totalTasks} tasks · {doneTasks} done
          {remaining > 0 && ` · ${formatRemaining(remaining)} remaining`}
        </div>
      </div>
    </div>
  );
}
