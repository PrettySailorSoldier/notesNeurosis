import { useState, useCallback } from 'react';
import type { Task } from '../types';

export interface AITaskSuggestion {
  content: string;
  type?: 'bullet' | 'checkbox' | 'plain';
  indent?: number;
  notes?: string;
}

export function useAITaskBreakdown(apiKey: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const breakdownTask = useCallback(async (
    taskContent: string,
    context: string = ''
  ): Promise<AITaskSuggestion[] | null> => {
    if (!apiKey.trim()) { setError('No API key — add it in Settings.'); return null; }
    setLoading(true); setError(null);

    const prompt = `You are a task breakdown assistant for someone with AuDHD.
Break this task into concrete, small subtasks. Each should take 15–45 minutes.
Be specific. No vague steps. Err toward smaller chunks.
${context ? 'CONTEXT: ' + context : ''}
TASK: ${taskContent}

Return ONLY a valid JSON array. No markdown, no explanation.
Each element: content (string, required), type ("checkbox" preferred),
indent (0 for top-level, 1 for sub-step), notes (string, 1 sentence or empty).
Maximum 8 items.`;

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
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as any)?.error?.message ?? `API error ${res.status}`);
      }
      const data = await res.json();
      const raw = data?.content?.[0]?.text ?? '';
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed: AITaskSuggestion[] = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) throw new Error('Expected array');
      return parsed;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  return { loading, error, breakdownTask };
}

export function suggestionsToTasks(suggestions: AITaskSuggestion[]): Task[] {
  return suggestions.map(s => ({
    id: crypto.randomUUID(),
    content: s.content,
    type: (s.type as Task['type']) ?? 'checkbox',
    completed: false,
    createdAt: Date.now(),
    indent: s.indent ?? 0,
  }));
}
