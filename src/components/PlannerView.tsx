import { useState, useEffect } from 'react';
import { usePlanner } from '../hooks/usePlanner';
import type { PlannerBlockColor } from '../types';

const COLORS: PlannerBlockColor[] = ['violet', 'indigo', 'rose', 'amber', 'teal', 'ghost'];

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDisplayDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function PlannerView() {
  const { ready, addBlock, updateBlock, deleteBlock, getBlocksForDate } = usePlanner();
  const [currentDate, setCurrentDate] = useState(() => formatDate(new Date()));
  const [isToday, setIsToday] = useState(true);

  useEffect(() => {
    const todayStr = formatDate(new Date());
    setIsToday(currentDate === todayStr);
  }, [currentDate]);

  const goToToday = () => setCurrentDate(formatDate(new Date()));

  const goPrevDay = () => {
    const [y, m, d] = currentDate.split('-').map(Number);
    const prev = new Date(y, m - 1, d - 1);
    setCurrentDate(formatDate(prev));
  };

  const goNextDay = () => {
    const [y, m, d] = currentDate.split('-').map(Number);
    const next = new Date(y, m - 1, d + 1);
    setCurrentDate(formatDate(next));
  };

  const handleAddBlock = () => {
    const dailyBlocks = getBlocksForDate(currentDate);
    let defaultTime = "09:00";
    if (dailyBlocks.length > 0) {
      defaultTime = dailyBlocks[dailyBlocks.length - 1].endTime;
    }
    addBlock(currentDate, defaultTime);
  };

  const handleTimeBlur = (id: string, startTime: string, endTime: string, field: 'start'|'end', val: string) => {
    let newStart = startTime;
    let newEnd = endTime;

    if (field === 'start') {
      newStart = val;
    } else {
      newEnd = val;
    }

    const startMins = timeToMinutes(newStart);
    const endMins = timeToMinutes(newEnd);
    if (endMins <= startMins) {
      const fixedEnd = minutesToTime(startMins + 30);
      newEnd = fixedEnd;
    }
    
    updateBlock(id, { startTime: newStart, endTime: newEnd });
  };

  const timeToMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + (m || 0);
  };
  
  const minutesToTime = (m: number) => {
    m = Math.max(0, Math.min(23 * 60 + 59, m));
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  if (!ready) {
    return null;
  }

  const dailyBlocks = getBlocksForDate(currentDate);

  return (
    <div className="planner-container">
      <div className="planner-nav">
        <button className="planner-nav-btn" onClick={goPrevDay}>←</button>
        <div className="planner-nav-date">{getDisplayDate(currentDate)}</div>
        <button className={`planner-today-btn ${isToday ? 'is-today' : ''}`} onClick={goToToday}>Today</button>
        <button className="planner-nav-btn" onClick={goNextDay}>→</button>
      </div>
      
      <div className="planner-blocks">
        {dailyBlocks.length === 0 && (
           <div className="planner-empty">No blocks scheduled for this day.</div>
        )}
        
        {dailyBlocks.map((block) => (
          <div key={block.id} className={`planner-block color-${block.color} ${block.completed ? 'completed' : ''}`}>
             <div className="planner-block-time">
                <input 
                  type="time" 
                  className="planner-time-input" 
                  value={block.startTime} 
                  onChange={(e) => updateBlock(block.id, { startTime: e.target.value })}
                  onBlur={(e) => handleTimeBlur(block.id, block.startTime, block.endTime, 'start', e.target.value)}
                />
                <span>–</span>
                <input 
                  type="time" 
                  className="planner-time-input" 
                  value={block.endTime} 
                  onChange={(e) => updateBlock(block.id, { endTime: e.target.value })}
                  onBlur={(e) => handleTimeBlur(block.id, block.startTime, block.endTime, 'end', e.target.value)}
                />
             </div>
             
             <input
                type="text"
                className="planner-block-label"
                value={block.label}
                placeholder="Block title..."
                autoFocus={block.label === ''}
                onChange={(e) => updateBlock(block.id, { label: e.target.value })}
             />
             
             <textarea
                className="planner-block-notes"
                value={block.notes}
                placeholder="Notes..."
                rows={1}
                onChange={(e) => {
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                  updateBlock(block.id, { notes: e.target.value });
                }}
             />
             
             <div className="planner-color-picker">
                {COLORS.map(c => (
                  <div 
                    key={c}
                    className={`planner-color-dot ${block.color === c ? 'active' : ''}`}
                    style={{ background: getColorHex(c) }}
                    onClick={() => updateBlock(block.id, { color: c })}
                  />
                ))}
             </div>
             
             <div className="planner-block-actions">
                <button className={`planner-action-btn ${block.completed ? 'done' : ''}`} onClick={() => updateBlock(block.id, { completed: !block.completed })}>✓</button>
                <button className="planner-action-btn delete" onClick={() => deleteBlock(block.id)}>×</button>
             </div>
          </div>
        ))}
        
        <button className="planner-add-btn" onClick={handleAddBlock}>+ add block</button>
      </div>
    </div>
  );
}

function getColorHex(color: PlannerBlockColor) {
  switch(color) {
    case 'violet': return '#a78bfa';
    case 'indigo': return '#818cf8';
    case 'rose': return '#fb7185';
    case 'amber': return '#fbbf24';
    case 'teal': return '#2dd4bf';
    case 'ghost': return 'rgba(180,140,220,0.2)';
    default: return 'transparent';
  }
}
