import React, { useState, useEffect, useRef } from 'react';
import type { PlannerBlock } from '../types';
import { useAIPlannerChat } from '../hooks/useAIPlannerChat';
import './AIPlannerPanel.css';

interface Props {
  pageId: string;
  apiKey: string;
  currentDate: string;
  blocks: PlannerBlock[];
  onAddBlock: (date: string, startTime: string, durationMinutes: number) => void;
  onUpdateBlock: (id: string, changes: Partial<PlannerBlock>) => void;
  onDeleteBlock: (id: string) => void;
  onLabelPending: (label: string) => void;
  onPendingBlockExtras: (extras: Partial<PlannerBlock>) => void;
  onClose: () => void;
}

const QUICK_PROMPTS = [
  "Plan my morning",
  "Add a 1-hour break at noon",
  "What's left today?",
  "Clear my afternoon",
  "Add a wind-down block at 9pm",
];

export function AIPlannerPanel({
  apiKey,
  currentDate,
  blocks,
  onAddBlock,
  onUpdateBlock,
  onDeleteBlock,
  onLabelPending,
  onPendingBlockExtras,
  onClose,
}: Props) {
  const { messages, loading, error, sendMessage, clearMessages } = useAIPlannerChat({
    apiKey,
    currentDate,
    blocks,
    onAddBlock,
    onUpdateBlock,
    onDeleteBlock,
    onLabelPending,
    onPendingBlockExtras,
  });

  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text) return;
    sendMessage(text);
    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="ai-planner-panel">
      {/* Header */}
      <div className="ai-planner-panel__header">
        <span className="ai-planner-panel__title">✦ AI Assistant</span>
        <div className="ai-planner-panel__header-actions">
          {messages.length > 0 && (
            <button
              className="ai-planner-panel__clear-btn"
              onClick={clearMessages}
              title="Clear conversation"
            >
              clear
            </button>
          )}
          <button
            className="ai-planner-panel__close-btn"
            onClick={onClose}
            title="Close panel"
          >
            ×
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="ai-planner-panel__messages">
        {messages.length === 0 && !loading && (
          <div className="ai-planner-panel__empty">
            Ask me about your day, or use a quick prompt below.
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            className={`ai-planner-panel__bubble ai-planner-panel__bubble--${msg.role}`}
          >
            <div className="ai-planner-panel__bubble-text">{msg.text}</div>
            <div className="ai-planner-panel__bubble-time">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}

        {loading && (
          <div className="ai-planner-panel__bubble ai-planner-panel__bubble--assistant ai-planner-panel__bubble--loading">
            <span className="ai-planner-panel__dots">
              <span>·</span><span>·</span><span>·</span>
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="ai-planner-panel__error">{error}</div>
      )}

      {/* Quick prompts */}
      <div className="ai-planner-panel__chips">
        {QUICK_PROMPTS.map(chip => (
          <button
            key={chip}
            className="ai-planner-panel__chip"
            onClick={() => sendMessage(chip)}
            disabled={loading}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="ai-planner-panel__input-area">
        <textarea
          ref={textareaRef}
          className="ai-planner-panel__input"
          value={inputValue}
          onChange={e => {
            setInputValue(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px';
          }}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your day…"
          rows={1}
          disabled={loading}
        />
        <button
          className="ai-planner-panel__send-btn"
          onClick={handleSend}
          disabled={loading || !inputValue.trim()}
          title="Send message"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
