import { useState } from 'react';
import type { Project, ProjectTask, ProjectTaskStatus, EnergyLevel } from '../types';
import { useAIProjectAssistant } from '../hooks/useAIProjectAssistant';
import { useSettings } from '../hooks/useSettings';

interface Props {
  project: Project;
  onClose: () => void;
  onUpdateProject: (id: string, changes: Partial<Project>) => void;
  onAddTask: (projectId: string, task: Omit<ProjectTask, 'id' | 'createdAt'>) => void;
  onUpdateTask: (projectId: string, taskId: string, changes: Partial<ProjectTask>) => void;
  onDeleteTask: (projectId: string, taskId: string) => void;
  onSetTaskStatus: (projectId: string, taskId: string, status: ProjectTaskStatus) => void;
}

const STATUS_LABELS: Record<ProjectTaskStatus, string> = {
  not_started: '○',
  in_progress: '◑',
  done: '✓',
  skipped: '–',
};

const ENERGY_COLORS: Record<EnergyLevel, string> = {
  high: '#7C4FD9', medium: '#5A8EFC', low: '#6BA5A0', zero: '#4A4A5A',
};

export function ProjectDetailPanel({
  project, onClose, onAddTask, onDeleteTask, onSetTaskStatus,
}: Props) {
  const { settings } = useSettings();
  const { loading, error, breakdownTask, generateProjectPlan, toProjectTasks } =
    useAIProjectAssistant(settings.claudeApiKey ?? '');

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [newTaskInput, setNewTaskInput] = useState('');

  const tasks = [...project.tasks].sort((a, b) => a.order - b.order);
  const done = tasks.filter(t => t.status === 'done').length;

  const handleAddTask = () => {
    const content = newTaskInput.trim();
    if (!content) return;
    onAddTask(project.id, {
      content, notes: '', status: 'not_started', order: tasks.length,
    });
    setNewTaskInput('');
  };

  const cycleStatus = (task: ProjectTask) => {
    const cycle: ProjectTaskStatus[] = ['not_started', 'in_progress', 'done', 'skipped'];
    const next = cycle[(cycle.indexOf(task.status) + 1) % cycle.length];
    onSetTaskStatus(project.id, task.id, next);
  };

  const handleGeneratePlan = async () => {
    const result = await generateProjectPlan(project.name, project.description);
    if (!result) return;
    toProjectTasks(result).forEach((t, i) => {
      onAddTask(project.id, { ...t, order: tasks.length + i });
    });
  };

  const handleBreakdownTask = async () => {
    const task = tasks.find(t => t.id === selectedTaskId);
    if (!task) return;
    const result = await breakdownTask(task.content, project.description);
    if (!result) return;
    toProjectTasks(result).forEach((t, i) => {
      onAddTask(project.id, { ...t, order: tasks.length + i });
    });
  };

  return (
    <div className="project-detail-panel">
      {/* Header */}
      <div className="project-detail-header">
        <span className="project-detail-emoji">{project.emoji ?? '📁'}</span>
        <div className="project-detail-title-block">
          <div className="project-detail-name">{project.name}</div>
          {project.description && (
            <div className="project-detail-desc">{project.description}</div>
          )}
        </div>
        <button className="project-detail-close" onClick={onClose}>×</button>
      </div>

      {/* Progress bar */}
      {tasks.length > 0 && (
        <div className="project-detail-progress">
          <div className="project-detail-progress-label">{done} / {tasks.length} done</div>
          <div className="project-detail-progress-track">
            <div
              className="project-detail-progress-fill"
              style={{ width: `${Math.round(done / tasks.length * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* AI bar */}
      <div className="project-detail-ai-bar">
        <button
          className="project-detail-ai-btn"
          onClick={handleGeneratePlan}
          disabled={loading || !settings.claudeApiKey}
          title={!settings.claudeApiKey ? 'Add API key in Settings' : 'Generate a full task plan for this project'}
        >
          {loading ? 'thinking…' : '✦ generate plan'}
        </button>
        {selectedTaskId && (
          <button
            className="project-detail-ai-btn project-detail-ai-btn--secondary"
            onClick={handleBreakdownTask}
            disabled={loading || !settings.claudeApiKey}
          >
            ✦ break down selected
          </button>
        )}
      </div>

      {error && (
        <div className="project-detail-error">{error}</div>
      )}

      {/* Task list */}
      <div className="project-detail-tasks">
        {tasks.length === 0 && (
          <div className="project-detail-empty">
            No tasks yet. Add one below or generate a plan.
          </div>
        )}
        {tasks.map(task => (
          <div
            key={task.id}
            className={`project-task-row${selectedTaskId === task.id ? ' project-task-row--selected' : ''}${task.status === 'done' || task.status === 'skipped' ? ' project-task-row--done' : ''}`}
            onClick={() => setSelectedTaskId(selectedTaskId === task.id ? null : task.id)}
          >
            <button
              className="project-task-status-btn"
              onClick={e => { e.stopPropagation(); cycleStatus(task); }}
              title="Cycle status"
            >
              {STATUS_LABELS[task.status]}
            </button>
            <div className="project-task-body">
              <div className="project-task-content"
                style={{ textDecoration: task.status === 'done' ? 'line-through' : 'none' }}
              >
                {task.content}
              </div>
              {task.notes && (
                <div className="project-task-notes">{task.notes}</div>
              )}
              <div className="project-task-meta">
                {task.estimatedMinutes && (
                  <span className="project-task-est">~{task.estimatedMinutes}m</span>
                )}
                {task.energyRequired && (
                  <span
                    className="project-task-energy-dot"
                    style={{ background: ENERGY_COLORS[task.energyRequired] }}
                    title={`Energy: ${task.energyRequired}`}
                  />
                )}
              </div>
            </div>
            <button
              className="project-task-delete"
              onClick={e => { e.stopPropagation(); onDeleteTask(project.id, task.id); }}
            >×</button>
          </div>
        ))}
      </div>

      {/* Add task input */}
      <div className="project-detail-add-row">
        <input
          type="text"
          className="project-detail-add-input"
          value={newTaskInput}
          onChange={e => setNewTaskInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAddTask(); }}
          placeholder="add a task…"
        />
        <button
          className="project-detail-add-btn"
          onClick={handleAddTask}
          disabled={!newTaskInput.trim()}
        >
          Add
        </button>
      </div>
    </div>
  );
}
