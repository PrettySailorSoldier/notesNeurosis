import os

file_path = 'src/components/PlannerView.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports
content = content.replace(
"""import { useSettings } from '../hooks/useSettings';
import type { AccentColor, PlannerBlock, Task, GoalEntry, PlannerSubtype, ReminderSound } from '../types';
import { IntegratedSchedulePanel } from './IntegratedSchedulePanel';
import { accentToHex } from '../utils/accentToHex';
import '../styles/planner.css';

const COLORS: AccentColor[] = ['plum', 'rose', 'peach', 'orange', 'yellow', 'blue', 'ghost'];""",
"""import { useSettings } from '../hooks/useSettings';
import { useProjects } from '../hooks/useProjects';
import { useFocusMode } from '../hooks/useFocusMode';
import { useAIScheduler, type AIScheduleBlock } from '../hooks/useAIScheduler';
import type { AccentColor, PlannerBlock, Task, GoalEntry, PlannerSubtype, ReminderSound, BlockType, EnergyLevel, Project } from '../types';
import { IntegratedSchedulePanel } from './IntegratedSchedulePanel';
import { BrainDumpPanel } from './BrainDumpPanel';
import { FocusModeOverlay } from './FocusModeOverlay';
import { accentToHex } from '../utils/accentToHex';
import '../styles/planner.css';
import '../styles/focus.css';

const COLORS: AccentColor[] = ['plum', 'rose', 'peach', 'orange', 'yellow', 'blue', 'ghost'];
const BLOCK_TYPES: BlockType[] = ['deep_focus', 'float', 'anchor', 'buffer', 'break', 'urgent', 'wind_down'];
const ENERGY_LEVELS: EnergyLevel[] = ['high', 'medium', 'low', 'zero'];"""
)

# 2. BlockEditor props & hooks
content = content.replace(
"""function BlockEditor({ block, onUpdate, onClose, allBlocks, onTimeChange, isRinging, onStopRinging, defaultSound = 'chime' }: BlockEditorProps) {
  const labelRef = useRef<HTMLDivElement>(null);
  const labelTextRef = useRef(block.label);""",
"""function BlockEditor({ block, onUpdate, onClose, allBlocks, onTimeChange, isRinging, onStopRinging, defaultSound = 'chime' }: BlockEditorProps) {
  const { projects } = useProjects();
  const { settings } = useSettings();
  const { breakdownBlock, loading: aiLoading } = useAIScheduler();
  const activeProjects = projects.filter(p => p.status === 'active');
  const labelRef = useRef<HTMLDivElement>(null);
  const labelTextRef = useRef(block.label);"""
)

# 3. BlockEditor Subtasks and Selectors
content = content.replace(
"""              if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            }}
          />
        </div>
      </div>

      {/* Row 5: Color picker */}""",
"""              if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            }}
          />
        </div>
        <div style={{ marginTop: 6 }}>
          <button 
            className="planner-be-breakdown-btn"
            disabled={aiLoading}
            onClick={async () => {
              const proj = block.projectId ? projects.find(p => p.id === block.projectId) : null;
              const sub = await breakdownBlock(block.label, block.notes, proj?.description || '', durationMins, settings.claudeApiKey || '');
              if (sub) {
                const newTasks = sub.map(s => ({
                  id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                  content: s, type: 'checkbox' as const, completed: false, createdAt: Date.now()
                }));
                onUpdate({ tasks: [...subtasks, ...newTasks] });
              }
            }}
            style={{ 
              background: 'transparent', border: '1px dashed var(--border)', borderRadius: 6,
              color: 'var(--text-faint)', fontSize: 11, padding: '4px 10px', cursor: 'pointer', fontFamily: 'system-ui'
            }}
          >
            {aiLoading ? 'thinking…' : '✦ break down'}
          </button>
        </div>
      </div>

      <div className="planner-be-selectors" style={{ display: 'flex', gap: 6, marginTop: 10, marginBottom: 10 }}>
        <select 
          value={block.blockType || ''} 
          onChange={e => onUpdate({ blockType: (e.target.value || undefined) as BlockType })}
          style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 4px' }}
        >
          <option value="">Type…</option>
          {BLOCK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select 
          value={block.energyRequired || ''} 
          onChange={e => onUpdate({ energyRequired: (e.target.value || undefined) as EnergyLevel })}
          style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 4px' }}
        >
          <option value="">Energy…</option>
          {ENERGY_LEVELS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select 
          value={block.projectId || ''} 
          onChange={e => onUpdate({ projectId: e.target.value || undefined })}
          style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 4px' }}
        >
          <option value="">Project…</option>
          {activeProjects.map(p => <option key={p.id} value={p.id}>{p.emoji ?? ''}{p.name}</option>)}
        </select>
      </div>

      {/* Row 5: Color picker */}"""
)

# 4. PlannerView hooks
content = content.replace(
"""export function PlannerView({ pageId, subtype = 'schedule', goals = [], onGoalsChange }: Props) {
  const { ready, blocks, addBlock, updateBlock, batchUpdateBlocks, deleteBlock, getBlocksForDate } = usePlanner(pageId);
  const { settings } = useSettings();
  const { ringingIds: plannerRingingIds, stopRinging: stopPlannerRinging } = usePlannerReminders(""",
"""export function PlannerView({ pageId, subtype = 'schedule', goals = [], onGoalsChange }: Props) {
  const { ready, blocks, addBlock, addBlocks, updateBlock, batchUpdateBlocks, deleteBlock, getBlocksForDate } = usePlanner(pageId);
  const { settings } = useSettings();
  const { getProjectForBlock } = useProjects();
  const focusMode = useFocusMode();
  const { toPlannnerBlocks, breakdownBlock } = useAIScheduler();

  const handleScheduleReady = (aiBlocks: AIScheduleBlock[]) => {
    const newBlocks = toPlannnerBlocks(aiBlocks, currentDate);
    addBlocks(newBlocks);
  };

  const handleFocusBreakdown = async () => {
    if (!focusMode.session) return;
    const b = focusMode.session.block;
    const proj = getProjectForBlock(b.projectId);
    const durMins = Math.max(15, timeToMinutes(b.endTime) - timeToMinutes(b.startTime));
    const sub = await breakdownBlock(b.label, b.notes, proj?.description || '', durMins, settings.claudeApiKey || '');
    if (sub) {
      const newTasks = sub.map(s => ({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        content: s, type: 'checkbox' as const, completed: false, createdAt: Date.now()
      }));
      updateBlock(b.id, { tasks: [...(b.tasks || []), ...newTasks] });
      focusMode.session.block.tasks = [...(b.tasks || []), ...newTasks];
    }
  };

  const { ringingIds: plannerRingingIds, stopRinging: stopPlannerRinging } = usePlannerReminders("""
)

# 5. Energy header
content = content.replace(
"""        <div className="planner-main-header">
          <h1 className="planner-day-title">{getDisplayDate(currentDate)}</h1>
          {isToday && (
            <span className="planner-now-badge">now {nowStr}</span>
          )}
        </div>""",
"""        <div className="planner-main-header">
          <h1 className="planner-day-title">{getDisplayDate(currentDate)}</h1>
          {energyToday > 0 && (
            <span className="planner-day-energy-badge" style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--surface-hover)', padding: '2px 6px', borderRadius: 10 }}>
              Energy: {energyToday}/5
            </span>
          )}
          {isToday && (
            <span className="planner-now-badge">now {nowStr}</span>
          )}
        </div>"""
)

# 6. Action buttons
content = content.replace(
"""                    {/* Action buttons (hover) */}
                    <div className="planner-block-card__actions">
                      <button
                        className="planner-block-btn--check\"""",
"""                    {/* Action buttons (hover) */}
                    <div className="planner-block-card__actions">
                      {subtype === 'schedule' && !block.completed && (
                        <button
                          className="planner-block-focus-btn"
                          onClick={e => { e.stopPropagation(); focusMode.startSession(block); }}
                          title="Start focus session"
                        >▶ focus</button>
                      )}
                      <button
                        className="planner-block-btn--check\""""
)

# 7. Sidebar BrainDumpPanel
content = content.replace(
"""      {/* SIDEBAR */}
      <div className="planner-sidebar">
        <div className="planner-date-header">""",
"""      {/* SIDEBAR */}
      <div className="planner-sidebar">
        {subtype === 'schedule' && (
          <BrainDumpPanel 
            currentDate={currentDate} 
            onScheduleReady={handleScheduleReady} 
          />
        )}
        <div className="planner-date-header">"""
)

# 8. FocusModeOverlay at the bottom
content = content.replace(
"""      </div>
    </div>
  );
}""",
"""      </div>
      {focusMode.session && (
        <FocusModeOverlay
          session={focusMode.session}
          onPause={focusMode.pause}
          onResume={focusMode.resume}
          onAddTime={focusMode.addTime}
          onEnd={focusMode.endSession}
          onCompleteSubtask={(taskId) => {
            const b = focusMode.session!.block;
            const updatedTasks = (b.tasks || []).map(t => t.id === taskId ? { ...t, completed: !t.completed } : t);
            updateBlock(b.id, { tasks: updatedTasks });
            focusMode.session!.block.tasks = updatedTasks;
          }}
          onBreakdownRequest={handleFocusBreakdown}
        />
      )}
    </div>
  );
}"""
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch applied.")
