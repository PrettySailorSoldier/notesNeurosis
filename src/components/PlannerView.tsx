import { useState, useEffect } from 'react';
import { usePlanner } from '../hooks/usePlanner';
import type { AccentColor, PlannerBlock } from '../types';

const COLORS: AccentColor[] = ['plum', 'rose', 'peach', 'orange', 'yellow', 'blue', 'ghost'];

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDisplayDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function getDisplayMonth(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function getDayOfWeek(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function getDayNumber(dateStr: string) {
  const [, , d] = dateStr.split('-').map(Number);
  return d;
}

function getWeekDays(centerDateStr: string) {
  const [y, m, d] = centerDateStr.split('-').map(Number);
  const center = new Date(y, m - 1, d);
  const dayOfWeek = center.getDay(); // 0 (Sun) to 6 (Sat)
  const startOfWeek = new Date(center);
  startOfWeek.setDate(center.getDate() - dayOfWeek);
  
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dDate = new Date(startOfWeek);
    dDate.setDate(startOfWeek.getDate() + i);
    days.push(formatDate(dDate));
  }
  return days;
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

  const goPrevWeek = () => {
    const [y, m, d] = currentDate.split('-').map(Number);
    const prev = new Date(y, m - 1, d - 7);
    setCurrentDate(formatDate(prev));
  };

  const goNextWeek = () => {
    const [y, m, d] = currentDate.split('-').map(Number);
    const next = new Date(y, m - 1, d + 7);
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

  if (!ready) {
    return <div className="loading-hint">✦</div>;
  }

  const currentWeekDays = getWeekDays(currentDate);
  const dailyBlocks = getBlocksForDate(currentDate);
  const totalBlocks = dailyBlocks.length;
  const completedBlocks = dailyBlocks.filter(b => b.completed).length;
  const progressPercent = totalBlocks > 0 ? Math.round((completedBlocks / totalBlocks) * 100) : 0;

  const calculateTotalMinutes = (blocks: PlannerBlock[]) => {
    let total = 0;
    for (const b of blocks) {
      const tStart = timeToMinutes(b.startTime);
      const tEnd = timeToMinutes(b.endTime);
      if (tEnd > tStart) {
        total += (tEnd - tStart);
      }
    }
    return total;
  };
  const totalMin = calculateTotalMinutes(dailyBlocks);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;

  return (
    <div className="planner-container">
      {/* LEFT PANEL */}
      <div className="planner-sidebar">
        <div className="planner-date-header">
           <h2 className="planner-month-title">{getDisplayMonth(currentDate)}</h2>
           <div className="planner-week-nav">
             <button className="planner-nav-btn" onClick={goPrevWeek}>‹</button>
             <button className={`planner-today-btn ${isToday ? 'is-today' : ''}`} onClick={goToToday}>Today</button>
             <button className="planner-nav-btn" onClick={goNextWeek}>›</button>
           </div>
        </div>
        
        <div className="planner-week-strip">
           {currentWeekDays.map(dayStr => {
             const isActive = dayStr === currentDate;
             const isTodayCell = dayStr === formatDate(new Date());
             return (
               <div 
                 key={dayStr} 
                 className={`planner-day-btn ${isActive ? 'active' : ''} ${isTodayCell ? 'today' : ''}`}
                 onClick={() => setCurrentDate(dayStr)}
               >
                 <span className="day-name">{getDayOfWeek(dayStr)}</span>
                 <span className="day-num">{getDayNumber(dayStr)}</span>
                 {isActive && <div className="day-indicator" />}
               </div>
             );
           })}
        </div>
        
        <div className="planner-day-summary">
           <h3 className="summary-title">Daily Summary</h3>
           
           <div className="summary-stat">
             <span className="stat-label">Tasks</span>
             <span className="stat-value">{completedBlocks} / {totalBlocks}</span>
           </div>
           
           <div className="summary-stat">
             <span className="stat-label">Scheduled Time</span>
             <span className="stat-value">{hours > 0 ? `${hours}h ` : ''}{mins}m</span>
           </div>
           
           {totalBlocks > 0 && (
             <div className="summary-progress">
               <div className="progress-bar" style={{ width: `${progressPercent}%` }}></div>
             </div>
           )}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="planner-main">
         <div className="planner-main-header">
            <h1 className="planner-day-title">{getDisplayDate(currentDate)}</h1>
         </div>
         
         <div className="planner-blocks">
            {dailyBlocks.length === 0 && (
               <div className="planner-empty">No blocks scheduled.</div>
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
    </div>
  );
}

function getColorHex(color: AccentColor) {
  switch(color) {
    case 'plum': return '#661A4E';
    case 'rose': return '#B55F7C';
    case 'peach': return '#FD8D79';
    case 'orange': return '#FCA324';
    case 'yellow': return '#FCCD38';
    case 'blue': return '#5A8EFC';
    case 'violet': return '#a78bfa';
    case 'indigo': return '#818cf8';
    case 'amber': return '#fbbf24';
    case 'teal': return '#2dd4bf';
    case 'ghost': return 'rgba(180,140,220,0.2)';
    default: return 'transparent';
  }
}
