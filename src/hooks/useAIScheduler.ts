import { useState, useCallback } from 'react';
import type { PlannerBlock, BlockType, EnergyLevel, AccentColor, Project } from '../types';

const BLOCK_TYPE_TO_COLOR: Record<BlockType, AccentColor> = {
  deep_focus: 'plum',
  float:      'blue',
  anchor:     'rose',
  buffer:     'ghost',
  break:      'peach',
  urgent:     'orange',
  wind_down:  'ghost',
};

export interface AIScheduleRequest {
  projects: Pick<Project, 'id' | 'name' | 'emoji' | 'description' | 'tasks'>[];
  taskListPages?: {
    id: string;
    name: string;
    items: {
      id: string;
      content: string;
      estimatedMinutes?: number;
      completed: boolean;
    }[];
  }[];
  freeformContext: string;
  targetDate: string;
  energyLevel?: EnergyLevel;
  dayStart?: string;
  dayEnd?: string;
  apiKey: string;
}

export interface AIScheduleBlock {
  label: string;
  startTime: string;
  endTime: string;
  blockType: BlockType;
  energyRequired: EnergyLevel;
  notes: string;
  projectId?: string;
}

function buildSchedulePrompt(req: AIScheduleRequest): string {
  const projectSummary = req.projects.map(p => {
    const open = p.tasks.filter(t => t.status === 'not_started' || t.status === 'in_progress');
    const taskList = open.map(t => {
      const est    = t.estimatedMinutes ? ` (~${t.estimatedMinutes}m)` : '';
      const energy = t.energyRequired   ? ` [${t.energyRequired}]`    : '';
      return `    - ${t.content}${est}${energy}${t.notes ? ': ' + t.notes : ''}`;
    }).join('\n');
    return `PROJECT: ${p.emoji ?? ''} ${p.name}\n  Context: ${p.description || 'none'}\n  Open tasks:\n${taskList || '    (none)'}`;
  }).join('\n\n');

  const taskListSection = req.taskListPages && req.taskListPages.length > 0
    ? (() => {
        const taskListSummary = req.taskListPages
          .map(tl => {
            const open = tl.items.filter(i => !i.completed);
            const itemLines = open.map(i => {
              const est = i.estimatedMinutes ? ` (~${i.estimatedMinutes}m)` : '';
              return `    - ${i.content}${est}`;
            }).join('\n');
            return `TASK LIST: ${tl.name}\n${itemLines || '    (all done)'}`;
          })
          .join('\n\n');
        return `\nTASK LISTS (general to-dos):\n${taskListSummary}\n`;
      })()
    : '';

  return `You are a scheduling assistant for someone with AuDHD (autism + ADHD).
They have executive dysfunction, time blindness, and interest-based motivation.
Build a realistic, humane time-blocked schedule for ${req.targetDate}.

TODAY'S ACTIVE PROJECTS AND TASKS:
${projectSummary}
${taskListSection}
ADDITIONAL CONTEXT:
${req.freeformContext || 'none'}

CONSTRAINTS:
- Day runs ${req.dayStart ?? '08:00'} to ${req.dayEnd ?? '22:00'}
- Overall energy today: ${req.energyLevel ?? 'not specified'}
- Include buffer blocks between demanding tasks
- At least one break per 2 hours of deep work
- No more than 2 consecutive deep_focus blocks
- If energy is low or zero: replace deep_focus with float, add extra buffers, keep day minimal
- Do not schedule tasks the project says are done or skipped
- projectId must exactly match one of the project IDs listed above, or be omitted
- Tasks from TASK LISTS should be scheduled as float or buffer blocks unless they are high-effort (>60m), in which case deep_focus is fine. Do not assign a projectId for task list items.

BLOCK TYPES: deep_focus | float | anchor | buffer | break | urgent | wind_down
ENERGY LEVELS: high | medium | low | zero
PROJECT IDs available: ${req.projects.map(p => p.id).join(', ')}

Return ONLY a valid JSON array. No markdown, no explanation.
Fields per element: label, startTime (HH:MM 24h), endTime (HH:MM 24h),
blockType, energyRequired, notes (1 sentence or empty string), projectId (string or omit).`;
}

export interface BrainDumpTask {
  content: string;
  projectId?: string;
  estimatedMinutes: number;
  energyRequired: EnergyLevel;
  isObligation: boolean;
  notes: string;
}

export interface BrainDumpResult {
  summary: string;
  parsedTasks: BrainDumpTask[];
}

export function useAIScheduler() {
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [lastBlocks, setLastBlocks] = useState<AIScheduleBlock[] | null>(null);

  const generateSchedule = useCallback(async (req: AIScheduleRequest & { tasks?: BrainDumpTask[] }): Promise<AIScheduleBlock[] | null> => {
    if (!req.apiKey.trim()) { setError('No API key — add it in Settings.'); return null; }
    setLoading(true); setError(null);
    try {
      const prompt = req.tasks 
        ? `You are a scheduling assistant. Build a schedule from these tasks:\n${JSON.stringify(req.tasks)}\nConstraints:\n- Day runs ${req.dayStart ?? '08:00'} to ${req.dayEnd ?? '22:00'}\n- Return JSON array of AIScheduleBlock.` 
        : buildSchedulePrompt(req);
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': req.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20251001',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as any)?.error?.message ?? `API error ${res.status}`);
      }
      const data = await res.json();
      const raw     = data?.content?.[0]?.text ?? '';
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed: AIScheduleBlock[] = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) throw new Error('Expected array');
      setLastBlocks(parsed);
      return parsed;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally { setLoading(false); }
  }, []);

  const parseBrainDump = useCallback(async (dumpText: string, activeProjects: Pick<Project, 'id' | 'name' | 'emoji' | 'description' | 'tasks'>[], apiKey: string): Promise<BrainDumpResult | null> => {
    if (!apiKey.trim()) { setError('No API key — add it in Settings.'); return null; }
    setLoading(true); setError(null);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20251001',
          max_tokens: 2000,
          messages: [{ role: 'user', content: `Extract tasks from this brain dump:\n${dumpText}\nProjects available:\n${JSON.stringify(activeProjects.map(p => ({ id: p.id, name: p.name })))}\nReturn JSON with { summary: string, parsedTasks: BrainDumpTask[] }` }],
        }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const cleaned = (data?.content?.[0]?.text ?? '').replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      return JSON.parse(cleaned) as BrainDumpResult;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally { setLoading(false); }
  }, []);

  const breakdownBlock = useCallback(async (label: string, notes: string, projDesc: string, durationMins: number, apiKey: string): Promise<string[] | null> => {
    if (!apiKey.trim()) { setError('No API key — add it in Settings.'); return null; }
    setLoading(true); setError(null);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20251001',
          max_tokens: 1000,
          messages: [{ role: 'user', content: `Break this task into subtasks:\nTask: ${label}\nNotes: ${notes}\nProject: ${projDesc}\nDuration: ${durationMins}m\nReturn ONLY a JSON array of strings.` }],
        }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const cleaned = (data?.content?.[0]?.text ?? '').replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      return JSON.parse(cleaned) as string[];
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally { setLoading(false); }
  }, []);

  const toPlannnerBlocks = useCallback((
    aiBlocks: AIScheduleBlock[], date: string
  ): Omit<PlannerBlock, 'id'>[] =>
    aiBlocks.map(b => ({
      date,
      startTime:      b.startTime,
      endTime:        b.endTime,
      label:          b.label,
      notes:          b.notes,
      color:          BLOCK_TYPE_TO_COLOR[b.blockType] ?? 'ghost',
      completed:      false,
      blockType:      b.blockType,
      energyRequired: b.energyRequired,
      projectId:      b.projectId,
      tasks:          [],
    })),
  []);

  const clearBlocks = useCallback(() => setLastBlocks(null), []);
  const clearDump = useCallback(() => setLastBlocks(null), []);

  return { loading, error, lastBlocks, generateSchedule, toPlannnerBlocks, clearBlocks, parseBrainDump, breakdownBlock, clearDump };
}
