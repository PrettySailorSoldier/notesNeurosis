import { useState, useCallback } from 'react';
import type { ProjectTask, EnergyLevel } from '../types';

export interface AITaskBreakdown {
  content: string;
  notes: string;
  estimatedMinutes?: number;
  energyRequired?: EnergyLevel;
}

function buildBreakdownPrompt(description: string, projectContext: string): string {
  return `You are a task planning assistant for someone with AuDHD.
Break the following into concrete, actionable subtasks. Each task should be
doable in one focused work session (≤ 2 hours). Be specific — no vague tasks.

PROJECT CONTEXT: ${projectContext || 'none'}
TASK TO BREAK DOWN: ${description}

Return ONLY a valid JSON array. No markdown, no explanation.
Each element: content (string), notes (string, 1 sentence or empty),
estimatedMinutes (number, optional), energyRequired (high|medium|low|zero, optional).`;
}

function buildProjectPlanPrompt(projectName: string, projectDescription: string): string {
  return `You are a task planning assistant for someone with AuDHD.
Create a complete, ordered task list for this project. Tasks should be concrete,
sequenced logically, each doable in one session. Include prep and closeout tasks.
Err toward smaller tasks (30–90 min) over large ones.

PROJECT: ${projectName}
DESCRIPTION: ${projectDescription}

Return ONLY a valid JSON array. No markdown, no explanation.
Each element: content (string), notes (string), estimatedMinutes (number, optional),
energyRequired (high|medium|low|zero, optional).`;
}

export function useAIProjectAssistant(apiKey: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const callClaude = useCallback(async (prompt: string): Promise<AITaskBreakdown[] | null> => {
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
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as any)?.error?.message ?? `API error ${res.status}`);
      }
      const data    = await res.json();
      const raw     = data?.content?.[0]?.text ?? '';
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      return JSON.parse(cleaned);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally { setLoading(false); }
  }, [apiKey]);

  const breakdownTask = useCallback(async (
    description: string, projectContext: string
  ): Promise<AITaskBreakdown[] | null> =>
    callClaude(buildBreakdownPrompt(description, projectContext)),
  [callClaude]);

  const generateProjectPlan = useCallback(async (
    projectName: string, projectDescription: string
  ): Promise<AITaskBreakdown[] | null> =>
    callClaude(buildProjectPlanPrompt(projectName, projectDescription)),
  [callClaude]);

  const toProjectTasks = useCallback(
    (aiTasks: AITaskBreakdown[]): Omit<ProjectTask, 'id' | 'createdAt'>[] =>
      aiTasks.map((t, i) => ({
        content:           t.content,
        notes:             t.notes ?? '',
        status:            'not_started' as const,
        estimatedMinutes:  t.estimatedMinutes,
        energyRequired:    t.energyRequired,
        order:             i,
      })),
    [],
  );

  return { loading, error, breakdownTask, generateProjectPlan, toProjectTasks };
}
