import { useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useProjects } from '../hooks/useProjects';
import { useAIScheduler, type AIScheduleBlock, type BrainDumpResult } from '../hooks/useAIScheduler';
import type { EnergyLevel } from '../types';

const ENERGY_LEVELS: EnergyLevel[] = ['high', 'medium', 'low', 'zero'];
const ENERGY_COLORS: Record<EnergyLevel, string> = {
  high:   '#7C4FD9',
  medium: '#5A8EFC',
  low:    '#6BA5A0',
  zero:   '#4A4A5A',
};

interface Props {
  currentDate: string;
  onScheduleReady: (blocks: AIScheduleBlock[]) => void;
}

export function BrainDumpPanel({ currentDate, onScheduleReady }: Props) {
  const { settings } = useSettings();
  const { projects } = useProjects();
  const { loading, error, parseBrainDump, generateSchedule, clearDump } = useAIScheduler();

  const [isOpen, setIsOpen] = useState(false);
  const [dumpText, setDumpText] = useState('');
  const [parsedResult, setParsedResult] = useState<BrainDumpResult | null>(null);
  
  // Selection state for generated tasks
  const [excludedTasks, setExcludedTasks] = useState<Set<number>>(new Set());
  
  // Schedule constraints
  const [energy, setEnergy] = useState<EnergyLevel>('medium');
  const [dayStart, setDayStart] = useState('09:00');
  const [dayEnd, setDayEnd] = useState('22:00');

  const activeProjects = projects
    .filter(p => p.status === 'active')
    .map(p => ({ id: p.id, name: p.name, emoji: p.emoji, description: p.description, tasks: p.tasks }));

  const handleExtract = async () => {
    if (!dumpText.trim()) return;
    const res = await parseBrainDump(dumpText, activeProjects, settings.claudeApiKey ?? '');
    if (res) {
      setParsedResult(res);
      setExcludedTasks(new Set()); // all included by default
    }
  };

  const toggleTask = (index: number) => {
    setExcludedTasks(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleBuildSchedule = async () => {
    if (!parsedResult) return;
    
    const tasksToSchedule = parsedResult.parsedTasks.filter((_, i) => !excludedTasks.has(i));
    const blocks = await generateSchedule({
      freeformContext: dumpText,
      tasks: tasksToSchedule,
      projects: activeProjects,
      targetDate: currentDate,
      energyLevel: energy,
      dayStart,
      dayEnd,
      apiKey: settings.claudeApiKey ?? ''
    });

    if (blocks) {
      onScheduleReady(blocks);
      setIsOpen(false);
      setDumpText('');
      setParsedResult(null);
      clearDump();
    }
  };

  return (
    <div className="brain-dump-panel">
      <button 
        className={`brain-dump-toggle ${isOpen ? 'brain-dump-toggle--open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? '↑ brain dump' : '✦ brain dump'}
      </button>

      {isOpen && (
        <div className="brain-dump-panel-body">
          {error && <div className="brain-dump-error">{error}</div>}

          {!parsedResult ? (
            <>
              <textarea
                className="brain-dump-textarea"
                rows={5}
                placeholder="Just type everything. Tasks, worries, things you need to do, ideas, obligations. Don't organize it — that's what the AI is for."
                value={dumpText}
                onChange={e => setDumpText(e.target.value)}
              />
              {loading ? (
                <div className="brain-dump-thinking">thinking…</div>
              ) : (
                <button 
                  className="brain-dump-extract-btn"
                  onClick={handleExtract}
                  disabled={!dumpText.trim() || !settings.claudeApiKey}
                  title={!settings.claudeApiKey ? "API Key required in Settings" : ""}
                >
                  ✦ extract tasks
                </button>
              )}
            </>
          ) : (
            <>
              <div className="brain-dump-summary">{parsedResult.summary}</div>
              
              <div className="brain-dump-parsed-list">
                {parsedResult.parsedTasks.map((task, i) => {
                  const isIncluded = !excludedTasks.has(i);
                  const proj = task.projectId ? activeProjects.find(p => p.id === task.projectId) : null;
                  return (
                    <div 
                      key={i} 
                      className={`brain-dump-task-row ${isIncluded ? 'brain-dump-task-row--included' : 'brain-dump-task-row--excluded'}`}
                      onClick={() => toggleTask(i)}
                    >
                      <div className="brain-dump-task-check">
                        {isIncluded && '✓'}
                      </div>
                      <div className="brain-dump-task-body">
                        <div className="brain-dump-task-label">
                          {task.content}
                          {proj && <span style={{ color: 'var(--text-faint)', fontSize: 10, marginLeft: 4 }}>[{proj.emoji ?? ''}{proj.name}]</span>}
                        </div>
                        <div className="brain-dump-task-meta">
                          <span className="brain-dump-task-est">~{task.estimatedMinutes}m</span>
                          <span 
                            style={{ width: 6, height: 6, borderRadius: '50%', background: ENERGY_COLORS[task.energyRequired] }} 
                            title={`Energy: ${task.energyRequired}`}
                          />
                          {task.isObligation && <span className="brain-dump-obligation-flag">⚑</span>}
                        </div>
                        {task.notes && <div className="brain-dump-task-notes">{task.notes}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>Energy:</span>
                {ENERGY_LEVELS.map(lvl => (
                  <button
                    key={lvl}
                    onClick={() => setEnergy(lvl)}
                    style={{
                      background: energy === lvl ? ENERGY_COLORS[lvl] + '22' : 'transparent',
                      border: `1px solid ${energy === lvl ? ENERGY_COLORS[lvl] : 'var(--border)'}`,
                      borderRadius: 10,
                      color: energy === lvl ? ENERGY_COLORS[lvl] : 'var(--text-faint)',
                      fontSize: 10, padding: '2px 8px', cursor: 'pointer',
                      fontFamily: 'system-ui, sans-serif', textTransform: 'capitalize',
                      transition: 'all 0.12s',
                    }}
                  >
                    {lvl}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>Hours:</span>
                <input 
                  type="time" 
                  value={dayStart} 
                  onChange={e => setDayStart(e.target.value)}
                  style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 11, padding: '2px 4px', fontFamily: 'system-ui' }}
                />
                <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>to</span>
                <input 
                  type="time" 
                  value={dayEnd} 
                  onChange={e => setDayEnd(e.target.value)}
                  style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 11, padding: '2px 4px', fontFamily: 'system-ui' }}
                />
              </div>

              {loading ? (
                <div className="brain-dump-thinking">building schedule…</div>
              ) : (
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button 
                    className="brain-dump-build-btn"
                    onClick={handleBuildSchedule}
                  >
                    ✦ build schedule
                  </button>
                  <button 
                    className="focus-btn-add"
                    onClick={() => { setParsedResult(null); clearDump(); }}
                    style={{ padding: '6px 12px' }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
