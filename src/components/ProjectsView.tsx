import { useState } from 'react';
import { useProjects } from '../hooks/useProjects';
import { ProjectDetailPanel } from './ProjectDetailPanel';
import { accentToHex } from '../utils/accentToHex';
import type { AccentColor, ProjectStatus } from '../types';
import '../styles/projects.css';

const COLORS: AccentColor[] = ['plum', 'rose', 'peach', 'orange', 'yellow', 'blue', 'ghost'];

const STATUS_META: Record<ProjectStatus, { label: string; color: string }> = {
  active:    { label: 'active',    color: '#9b6fa6' },
  paused:    { label: 'paused',    color: '#9090a0' },
  completed: { label: 'completed', color: '#6a8fc4' },
  archived:  { label: 'archived',  color: '#4a4a5a' },
};

type FilterTab = 'all' | ProjectStatus;

interface Props {
  onSelectProject?: (projectId: string) => void;
}

export function ProjectsView({ onSelectProject }: Props) {
  const { projects, createProject } = useProjects();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<AccentColor>('plum');

  const filtered = filter === 'all' ? projects : projects.filter(p => p.status === filter);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    const p = createProject(name, newColor);
    setNewName('');
    setNewColor('plum');
    setShowCreate(false);
    setSelectedId(p.id);
  };

  const handleCardClick = (id: string) => {
    setSelectedId(id);
    onSelectProject?.(id);
  };

  const FILTER_TABS: { key: FilterTab; label: string }[] = [
    { key: 'all',       label: 'All'       },
    { key: 'active',    label: 'Active'    },
    { key: 'paused',    label: 'Paused'    },
    { key: 'completed', label: 'Completed' },
  ];

  return (
    <div className="projects-view">
      {/* Header */}
      <div className="projects-header">
        <h1 className="projects-title">projects</h1>
        <div className="projects-filter-tabs">
          {FILTER_TABS.map(({ key, label }) => (
            <button
              key={key}
              className={`projects-filter-tab${filter === key ? ' projects-filter-tab--active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="projects-new-btn"
          onClick={() => setShowCreate(v => !v)}
        >
          + new project
        </button>
      </div>

      {/* Inline create form */}
      {showCreate && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <input
            autoFocus
            type="text"
            placeholder="Project name…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') setShowCreate(false);
            }}
            style={{ background: 'transparent', border: 'none', borderBottom: '1px dashed var(--border)', color: 'var(--text)', fontFamily: "'Cormorant Garamond', serif", fontSize: 16, outline: 'none', padding: '2px 0' }}
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                style={{
                  width: 14, height: 14, borderRadius: '50%',
                  background: accentToHex(c),
                  border: newColor === c ? `2px solid ${accentToHex(c)}` : '2px solid transparent',
                  outline: newColor === c ? '1px solid rgba(255,255,255,0.6)' : 'none',
                  cursor: 'pointer', padding: 0, flexShrink: 0,
                }}
                title={c}
              />
            ))}
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              style={{ marginLeft: 'auto', background: 'color-mix(in srgb, var(--plum) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--plum) 40%, transparent)', borderRadius: 5, color: 'var(--plum)', fontSize: 11, padding: '3px 10px', cursor: 'pointer' }}
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="projects-grid">
        {filtered.length === 0 && (
          <div style={{ gridColumn: '1/-1', color: 'var(--text-faint)', fontFamily: 'system-ui, sans-serif', fontSize: 12, padding: '16px 4px' }}>
            No projects here yet.
          </div>
        )}
        {filtered.map(p => {
          const done       = p.tasks.filter(t => t.status === 'done').length;
          const total      = p.tasks.length;
          const pct        = total > 0 ? (done / total) * 100 : 0;
          const notStarted = p.tasks.filter(t => t.status === 'not_started').length;
          const meta       = STATUS_META[p.status];

          return (
            <div
              key={p.id}
              className="project-card"
              style={{ borderLeftColor: accentToHex(p.color) }}
              onClick={() => handleCardClick(p.id)}
            >
              <p className="project-card__name">
                {p.emoji && <span>{p.emoji}</span>}
                {p.name || 'Untitled'}
                <span
                  className="project-card__status-badge"
                  style={{
                    background: meta.color + '22',
                    borderColor: meta.color + '55',
                    color: meta.color,
                  }}
                >
                  {meta.label}
                </span>
              </p>
              <div className="project-card__progress-bar">
                <div
                  className="project-card__progress-fill"
                  style={{ width: `${pct}%`, background: accentToHex(p.color) }}
                />
              </div>
              <div className="project-card__meta">
                {done} / {total} done
                {notStarted > 0 && ` · ${notStarted} not started`}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail drawer */}
      {selectedId && (
        <>
          <div className="project-detail-overlay" onClick={() => setSelectedId(null)} />
          <ProjectDetailPanel
            key={selectedId}
            projectId={selectedId}
            onClose={() => setSelectedId(null)}
          />
        </>
      )}
    </div>
  );
}
