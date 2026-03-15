import React, { useState, useEffect, useRef } from 'react';
import { useCareSchedule } from '../hooks/useCareSchedule';
import type { CareEntry, CareCategory } from '../types';

interface IntegratedSchedulePanelProps {
  date: string;
}

const CATEGORIES: CareCategory[] = ['medication', 'walk', 'meal', 'hygiene', 'therapy', 'check-in', 'appointment'];

const CATEGORY_COLORS: Record<CareCategory, string> = {
  medication: '#fb7185',
  walk: '#2dd4bf',
  meal: '#fbbf24',
  hygiene: '#818cf8',
  therapy: '#a78bfa',
  'check-in': 'rgba(180,140,220,0.2)',
  appointment: '#fb7185'
};

export function IntegratedSchedulePanel({ date }: IntegratedSchedulePanelProps) {
  const {
    ready,
    getEntriesForDate,
    addEntry,
    updateEntry,
    toggleComplete,
    deleteEntry,
    reorderEntries,
    importSchedule,
    cleanupOldOverrides
  } = useCareSchedule();

  const [isExpanded, setIsExpanded] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [now, setNow] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setNow(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Clean up stale completion overrides from past dates whenever the viewed date changes
  useEffect(() => {
    if (ready) cleanupOldOverrides(date);
  }, [date, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return null;

  const entries = getEntriesForDate(date);
  const completedCount = entries.filter(e => e.completed).length;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset the input so the same file can be re-selected later
    if (fileInputRef.current) fileInputRef.current.value = '';

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let parsed = JSON.parse(event.target?.result as string);

        // Accept a plain array by wrapping it as a recurring schedule
        if (Array.isArray(parsed)) {
          parsed = { recurring: parsed };
        }

        if (typeof parsed !== 'object' || parsed === null) {
          throw new Error('Expected a JSON object or array');
        }

        if (!window.confirm('This will replace your current schedule. Continue?')) return;

        await importSchedule(parsed);
        setImportStatus('success');
        setTimeout(() => setImportStatus('idle'), 3000);
      } catch (err) {
        console.error('Failed to import schedule', err);
        setImportStatus('error');
        setTimeout(() => setImportStatus('idle'), 3000);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="planner-schedule-panel">
      <div className="planner-schedule-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="planner-schedule-header-left">
          <span className="planner-schedule-chevron">{isExpanded ? '▲' : '▼'}</span>
          <span className="planner-schedule-title">Schedule</span>
        </div>
        <div className="planner-schedule-header-right">
          <span className="planner-schedule-badge">
            {entries.length} tasks · {completedCount} done
          </span>
          <label className="planner-schedule-import-btn" onClick={e => e.stopPropagation()}>
            <span>upload</span>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
          {importStatus !== 'idle' && (
            <span className={`planner-schedule-import-status planner-schedule-import-status--${importStatus}`}>
              {importStatus === 'success' ? '✓ imported' : '✗ failed'}
            </span>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="planner-schedule-content">
          <div className="planner-schedule-list">
            {entries.map((entry: CareEntry, i: number) => {
              const isCurrent = entry.time <= now && now < entry.endTime;
              
              // Upcoming within 30 min
              const nowMins = (h: string) => {
                const [hh, mm] = h.split(':').map(Number);
                return hh * 60 + mm;
              };
              const tMins = nowMins(entry.time);
              const nMins = nowMins(now);
              const isUpcoming = nMins < tMins && tMins <= nMins + 30;
              
              const isOverdue = nowMins(entry.endTime) < nMins && !entry.completed;

              let statusClass = '';
              if (entry.completed) statusClass = 'planner-schedule-row--done';
              else if (isCurrent) statusClass = 'planner-schedule-row--current';
              else if (isUpcoming) statusClass = 'planner-schedule-row--upcoming';
              else if (isOverdue) statusClass = 'planner-schedule-row--overdue';

              return (
                <div 
                  key={entry.id} 
                  className={`planner-schedule-row ${statusClass} ${dragIdx === i ? 'planner-schedule-row--dragging' : ''}`}
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={(e: React.DragEvent) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIdx === null || dragIdx === i) return;
                    const reordered = [...entries];
                    const [moved] = reordered.splice(dragIdx, 1);
                    reordered.splice(i, 0, moved);
                    reorderEntries(date, reordered);
                    setDragIdx(null);
                  }}
                >
                  <div className="planner-schedule-dot" style={{ background: CATEGORY_COLORS[entry.category] }} />
                  <div className="planner-schedule-time">
                    <input 
                      type="time" 
                      className="planner-schedule-time-input" 
                      value={entry.time} 
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateEntry(date, entry.id, { time: e.target.value })}
                    />
                    <span>–</span>
                    <input 
                      type="time" 
                      className="planner-schedule-time-input" 
                      value={entry.endTime} 
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateEntry(date, entry.id, { endTime: e.target.value })}
                    />
                  </div>
                  <div className="planner-schedule-label-group">
                    <input 
                      type="text" 
                      className="planner-schedule-label" 
                      value={entry.label} 
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateEntry(date, entry.id, { label: e.target.value })}
                    />
                    <textarea
                      className="planner-schedule-notes planner-schedule-notes--editable"
                      value={entry.notes}
                      placeholder="Notes..."
                      rows={1}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateEntry(date, entry.id, { notes: e.target.value })}
                      onFocus={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                      onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
                    />
                  </div>
                  <div className="planner-schedule-actions">
                    <button 
                      className={`planner-action-btn ${entry.completed ? 'done' : ''}`} 
                      onClick={() => toggleComplete(date, entry.id)}
                    >
                      ✓
                    </button>
                    <button 
                      className="planner-action-btn delete" 
                      onClick={() => deleteEntry(date, entry.id)}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {showAddForm ? (
            <AddEntryForm 
              onSave={async (e) => {
                await addEntry(date, e);
                setShowAddForm(false);
              }} 
              onCancel={() => setShowAddForm(false)} 
            />
          ) : (
            <button className="planner-add-btn" onClick={() => setShowAddForm(true)}>+ add care task</button>
          )}
        </div>
      )}
    </div>
  );
}

function AddEntryForm({ onSave, onCancel }: { onSave: (e: Omit<CareEntry, 'id'>) => void, onCancel: () => void }) {
  const [formData, setFormData] = useState<Omit<CareEntry, 'id'>>({
    time: '09:00',
    endTime: '09:30',
    label: '',
    person: 'Donna',
    category: 'check-in',
    notes: '',
    completed: false,
    recurring: true,
    recurringDays: [0, 1, 2, 3, 4, 5, 6]
  });

  return (
    <div className="planner-schedule-add-form">
      <div className="planner-schedule-form-row">
        <input 
          type="time" 
          className="planner-schedule-time-input" 
          value={formData.time} 
          onChange={e => setFormData({ ...formData, time: e.target.value })} 
        />
        <span>–</span>
        <input 
          type="time" 
          className="planner-schedule-time-input" 
          value={formData.endTime} 
          onChange={e => setFormData({ ...formData, endTime: e.target.value })} 
        />
        <select 
          className="planner-schedule-select"
          value={formData.category} 
          onChange={e => setFormData({ ...formData, category: e.target.value as CareCategory })}
        >
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <input 
        type="text" 
        className="planner-schedule-input" 
        placeholder="Label..." 
        value={formData.label} 
        onChange={e => setFormData({ ...formData, label: e.target.value })} 
      />
      <textarea 
        className="planner-schedule-textarea" 
        placeholder="Notes..." 
        value={formData.notes} 
        onChange={e => setFormData({ ...formData, notes: e.target.value })} 
      />
      <div className="planner-schedule-form-footer">
        <label className="planner-schedule-checkbox-label">
          <input
            type="checkbox"
            checked={formData.recurring}
            onChange={e => setFormData({ ...formData, recurring: e.target.checked, recurringDays: e.target.checked ? [0,1,2,3,4,5,6] : [] })}
          />
          Recurring
        </label>
        {formData.recurring && (
          <div className="planner-schedule-days-picker">
            {['S','M','T','W','T','F','S'].map((label, idx) => (
              <button
                key={idx}
                type="button"
                className={`planner-schedule-day-btn ${formData.recurringDays.includes(idx) ? 'active' : ''}`}
                onClick={() => {
                  const days = formData.recurringDays.includes(idx)
                    ? formData.recurringDays.filter(d => d !== idx)
                    : [...formData.recurringDays, idx].sort((a, b) => a - b);
                  setFormData({ ...formData, recurringDays: days });
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="planner-schedule-form-btns">
          <button className="planner-schedule-btn cancel" onClick={onCancel}>Cancel</button>
          <button
            className="planner-schedule-btn save"
            disabled={formData.recurring && formData.recurringDays.length === 0}
            onClick={() => onSave(formData)}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
