import { useState, useCallback } from 'react';
import type { PlannerBlock, AccentColor, BlockType, EnergyLevel, Task } from '../types';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  timestamp: number;
}

export type PlannerAction =
  | { action: 'add_block'; data: { label: string; startTime: string; endTime: string; notes?: string; color?: AccentColor; blockType?: BlockType; energyRequired?: EnergyLevel; tasks?: Task[] } }
  | { action: 'edit_block'; data: { id: string } & Partial<{ label: string; startTime: string; endTime: string; notes: string; color: AccentColor; blockType: BlockType; energyRequired: EnergyLevel; completed: boolean }> }
  | { action: 'delete_block'; data: { id: string } }
  | { action: 'none' };

interface UseAIPlannerChatParams {
  apiKey: string;
  currentDate: string;
  blocks: PlannerBlock[];
  onAddBlock: (date: string, startTime: string, durationMinutes: number) => void;
  onUpdateBlock: (id: string, changes: Partial<PlannerBlock>) => void;
  onDeleteBlock: (id: string) => void;
  onLabelPending?: (label: string) => void;
  onPendingBlockExtras?: (extras: Partial<PlannerBlock>) => void;
}

function buildSystemPrompt(blocks: PlannerBlock[], currentDate: string): string {
  const blockSummary = blocks.length === 0
    ? 'No blocks scheduled yet.'
    : blocks.map(b =>
        `[${b.id}] ${b.startTime}–${b.endTime} "${b.label}"${b.notes ? ' — ' + b.notes : ''}${b.blockType ? ' (' + b.blockType + ')' : ''}${b.completed ? ' ✓' : ''}`
      ).join('\n');

  return `You are a calm, practical day-planning assistant for someone with AuDHD (autism + ADHD).
You help them plan, organise, and adjust their day in ${currentDate}.
They have executive dysfunction, time blindness, and interest-based motivation.
Be direct, warm, and brief. No moralising or lengthy preambles.

CURRENT BLOCKS FOR TODAY:
${blockSummary}

You can take actions on the planner by embedding a JSON block in your reply.
The JSON block MUST appear at the very END of your message, after your prose reply.
Format it as a fenced code block with language "actions":

\`\`\`actions
[
  { "action": "add_block", "data": { "label": "Deep Work", "startTime": "09:00", "endTime": "11:00", "blockType": "deep_focus", "energyRequired": "high", "notes": "Focus session" } },
  { "action": "edit_block", "data": { "id": "<block-id>", "label": "New label" } },
  { "action": "delete_block", "data": { "id": "<block-id>" } }
]
\`\`\`

Only include the actions block if you are actually taking an action.
If you're just chatting, advising, or answering a question — omit it entirely.
Never invent block IDs. Only reference IDs from the CURRENT BLOCKS list above.
Valid blockTypes: deep_focus | float | anchor | buffer | break | urgent | wind_down
Valid energyRequired: high | medium | low | zero
Valid colors: plum | rose | peach | orange | yellow | blue | ghost
Times are HH:MM 24-hour format.`;
}

export function useAIPlannerChat({
  apiKey,
  currentDate,
  blocks,
  onAddBlock,
  onUpdateBlock,
  onDeleteBlock,
  onLabelPending,
  onPendingBlockExtras,
}: UseAIPlannerChatParams) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (userText: string) => {
    if (!apiKey.trim()) { setError('No API key — add it in Settings.'); return; }
    if (!userText.trim()) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: userText,
      timestamp: Date.now(),
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setLoading(true);
    setError(null);

    try {
      const apiMessages = nextMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.text,
      }));

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          system: buildSystemPrompt(blocks, currentDate),
          messages: apiMessages,
        }),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as any)?.error?.message ?? `API error ${res.status}`);
      }

      const data = await res.json();
      const rawText: string = data?.content?.[0]?.text ?? '';

      // Strip the actions block from display text
      const actionsMatch = rawText.match(/```actions\s*([\s\S]*?)```/);
      const displayText = rawText.replace(/```actions[\s\S]*?```/g, '').trim();

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: displayText,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);

      // Parse and execute actions
      if (actionsMatch?.[1]) {
        try {
          const actions: PlannerAction[] = JSON.parse(actionsMatch[1].trim());
          for (const act of actions) {
            if (act.action === 'add_block') {
              const { label, startTime, endTime, ...rest } = act.data;
              const startParts = startTime.split(':').map(Number);
              const endParts = endTime.split(':').map(Number);
              const durationMinutes = (endParts[0] * 60 + endParts[1]) - (startParts[0] * 60 + startParts[1]);

              // Store extras before addBlock so the useEffect picks them up
              const extras: Partial<PlannerBlock> = {};
              if (rest.notes) extras.notes = rest.notes;
              if (rest.color) extras.color = rest.color;
              if (rest.blockType) extras.blockType = rest.blockType;
              if (rest.energyRequired) extras.energyRequired = rest.energyRequired;
              if (rest.tasks) extras.tasks = rest.tasks;

              if (Object.keys(extras).length > 0 && onPendingBlockExtras) {
                onPendingBlockExtras(extras);
              }

              if (onLabelPending) onLabelPending(label);
              onAddBlock(currentDate, startTime, Math.max(15, durationMinutes));
            } else if (act.action === 'edit_block') {
              const { id, ...changes } = act.data;
              onUpdateBlock(id, changes);
            } else if (act.action === 'delete_block') {
              onDeleteBlock(act.data.id);
            }
          }
        } catch (parseErr) {
          console.warn('[useAIPlannerChat] failed to parse actions:', parseErr);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [apiKey, blocks, currentDate, messages, onAddBlock, onUpdateBlock, onDeleteBlock, onLabelPending, onPendingBlockExtras]);

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, loading, error, sendMessage, clearMessages };
}
