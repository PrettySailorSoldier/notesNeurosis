import { useState } from 'react';
import type { FocusSession } from '../hooks/useFocusMode';
import { useProjects } from '../hooks/useProjects';

const BLOCK_EMOJIS: Record<string, string> = {
  deep_focus: '🎯',
  float: '☁️',
  anchor: '⚓',
  buffer: '☕',
  break: '🧘',
  urgent: '🔥',
  wind_down: '🌙'
};

const BLOCK_LABELS: Record<string, string> = {
  deep_focus: 'Deep Focus',
  float: 'Float / Flex',
  anchor: 'Anchor',
  buffer: 'Buffer',
  break: 'Break',
  urgent: 'Urgent',
  wind_down: 'Wind Down'
};

interface Props {
  session: FocusSession;
  onPause: () => void;
  onResume: () => void;
  onAddTime: (minutes: number) => void;
  onEnd: () => void;
  onCompleteSubtask: (taskId: string) => void;
  onBreakdownRequest: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function FocusModeOverlay({
  session,
  onPause,
  onResume,
  onAddTime,
  onEnd,
  onCompleteSubtask,
  onBreakdownRequest
}: Props) {
  const { getProjectForBlock } = useProjects();
  const [breakingDown, setBreakingDown] = useState(false);

  const block = session.block;
  const project = getProjectForBlock(block.projectId);
  
  const totalSecondsElapsed = session.totalSeconds - session.secondsLeft;
  const progressPercent = session.totalSeconds > 0 
    ? Math.min(100, Math.max(0, (totalSecondsElapsed / session.totalSeconds) * 100))
    : 0;

  const tasks = block.tasks ?? [];
  const completedCount = tasks.filter(t => t.completed).length;

  const handleBreakdown = async () => {
    setBreakingDown(true);
    await onBreakdownRequest();
    setBreakingDown(false);
  };

  return (
    <div className="focus-overlay">
      <div className={`focus-card focus-card--${block.blockType}`}>
        
        {/* Top Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="focus-block-type">
            {block.blockType && BLOCK_EMOJIS[block.blockType] ? BLOCK_EMOJIS[block.blockType] : ''} {block.blockType && BLOCK_LABELS[block.blockType] ? BLOCK_LABELS[block.blockType] : (block.blockType || '')}
          </div>
          {project && (
            <div className="focus-project-name">
              Project: {project.emoji ?? ''}{project.name}
            </div>
          )}
          <h1 className="focus-block-label">{block.label}</h1>
        </div>

        {/* Timer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className={`focus-timer ${session.isOvertime ? 'focus-timer--overtime' : ''}`}>
            {session.isOvertime ? '+' : ''}{formatTime(session.isOvertime ? session.overtimeSeconds : session.secondsLeft)}
          </div>
          <div className="focus-progress-bar">
            <div className="focus-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-faint)', fontFamily: 'system-ui' }}>
            {session.running ? 'Running' : 'Paused'}
          </div>
        </div>

        {/* Controls */}
        <div className="focus-controls">
          <button 
            className="focus-btn-primary" 
            onClick={session.running ? onPause : onResume}
          >
            {session.running ? 'Pause' : 'Resume'}
          </button>
          
          <button className="focus-btn-add" onClick={() => onAddTime(5)}>+ 5m</button>
          <button className="focus-btn-add" onClick={() => onAddTime(15)}>+ 15m</button>
          <button className="focus-btn-add" onClick={() => onAddTime(30)}>+ 30m</button>
          
          <button className="focus-btn-done" onClick={onEnd}>
            Done — next block
          </button>
        </div>
        
        <div style={{ textAlign: 'center' }}>
          <button className="focus-btn-end" onClick={onEnd}>
            End without completing
          </button>
        </div>

        {/* Subtasks */}
        <div className="focus-subtasks">
          {tasks.length > 0 ? (
            <>
              <div className="focus-subtasks-header">
                <span>Subtasks</span>
                <span>{completedCount} / {tasks.length} done</span>
              </div>
              <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {tasks.map(task => (
                  <div key={task.id} className="focus-subtask-row" onClick={() => onCompleteSubtask(task.id)}>
                    <div className={`focus-subtask-check ${task.completed ? 'focus-subtask-check--done' : ''}`}>
                      {task.completed && '✓'}
                    </div>
                    <div className={`focus-subtask-text ${task.completed ? 'focus-subtask-text--done' : ''}`}>
                      {task.content}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <button 
              className="focus-breakdown-btn" 
              onClick={handleBreakdown}
              disabled={breakingDown}
            >
              {breakingDown ? 'thinking…' : '✦ break this down'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
