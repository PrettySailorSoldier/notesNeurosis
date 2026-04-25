import React, { useEffect, useState, useRef } from 'react';
import type { Page, ReminderSound, IntervalTask } from '../types';
import type { Settings, CustomTone } from '../hooks/useSettings';
import { useAudio } from '../hooks/useAudio';
import { useDraggable } from '../hooks/useDraggable';
import { onModalMount, onModalUnmount } from '../utils/modalAlwaysOnTop';
import styles from './OptionsModal.module.css';

interface Props {
  pages: Page[];
  ringingIds: string[];
  settings: Settings;
  onClose: () => void;
  onStopRinging: (reminderId: string) => void;
  onClearReminder: (taskId: string, pageId: string) => void;
  onUpdateTimerSettings: (taskId: string, pageId: string, intervalMinutes: number, sound: ReminderSound) => void;
  onAddCustomTone: (tone: CustomTone) => void;
  onRemoveCustomTone: (id: string) => void;
  onSetVolume: (volume: number) => void;
  onUpdateSettings: (patch: Partial<Settings>) => void;
  onUpdateIntervalTask: (pageId: string, taskId: string, sound: ReminderSound) => void;
  onSaveAccentColor: (hex: string) => void;
}

type Tab = 'timers' | 'sounds' | 'settings';

const ACCENT_PRESETS = [
  { label: 'Lavender', hex: '#9b6fa6' },
  { label: 'Cyan',     hex: '#00e8ff' },
  { label: 'Lime',     hex: '#d0ff00' },
  { label: 'Coral',    hex: '#ff9a80' },
  { label: 'Pink',     hex: '#ff4cbc' },
];

const SOUND_OPTIONS: { value: ReminderSound; label: string }[] = [
  { value: 'chime', label: '🎵 Chime' },
  { value: 'bell', label: '🔔 Bell' },
  { value: 'blip', label: '📡 Blip' },
  { value: 'soft_ding', label: '✨ Soft Ding' },
  { value: 'none', label: '🔇 None' },
];

const INTERVAL_PRESETS = [5, 10, 15, 20, 30, 45, 60];
const BLOCK_DURATIONS = [15, 30, 45, 60, 90, 120];

function formatCountdown(fireAt: number): string {
  const diff = fireAt - Date.now();
  if (diff <= 0) return 'now';
  const totalSec = Math.floor(diff / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function getSoundLabel(sound: ReminderSound, customTones: CustomTone[]): string {
  const found = SOUND_OPTIONS.find(s => s.value === sound);
  if (found) return found.label;
  const tone = customTones.find(t => t.id === sound);
  return tone ? `🔈 ${tone.name}` : sound;
}

function fmtDuration(m: number) {
  if (m >= 60 && m % 60 === 0) return `${m / 60}h`;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m`;
}

export const OptionsModal: React.FC<Props> = ({
  pages,
  ringingIds,
  settings,
  onClose,
  onStopRinging,
  onClearReminder,
  onUpdateTimerSettings,
  onAddCustomTone,
  onRemoveCustomTone,
  onSetVolume,
  onUpdateSettings,
  onUpdateIntervalTask,
  onSaveAccentColor,
}) => {
  const { playTone } = useAudio();
  const { dragPos, modalRef, onHandleMouseDown } = useDraggable();
  const [tab, setTab] = useState<Tab>('timers');
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const stopPreviewRef = useRef<(() => void) | null>(null);
  const [, setTick] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInterval, setEditInterval] = useState<number>(30);
  const [editSound, setEditSound] = useState<ReminderSound>('chime');
  const [editCustomMinutes, setEditCustomMinutes] = useState<string>('');
  const [customHex, setCustomHex] = useState('');
  const hexDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live countdown tick every second
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Keep window on top while this popup is open
  useEffect(() => {
    onModalMount();
    return () => onModalUnmount();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (stopPreviewRef.current) stopPreviewRef.current();
    };
  }, [onClose]);

  const togglePreview = (toneId: string) => {
    if (previewingId === toneId) {
      if (stopPreviewRef.current) stopPreviewRef.current();
      stopPreviewRef.current = null;
      setPreviewingId(null);
    } else {
      if (stopPreviewRef.current) stopPreviewRef.current();
      stopPreviewRef.current = playTone(toneId as any, settings.volume, settings.customTones);
      setPreviewingId(toneId);
    }
  };

  const activeTimers = pages.flatMap(p => {
    const entries: { page: Page; task: import('../types').Task; reminder: import('../types').Reminder }[] = [];
    // Flat task lists
    p.tasks.forEach(t => { if (t.reminder?.active) entries.push({ page: p, task: t, reminder: t.reminder! }); });
    // Board columns (todo board mode)
    p.todoBoards?.forEach(b => b.lists.forEach(l => l.tasks.forEach(t => {
      if (t.reminder?.active) entries.push({ page: p, task: t, reminder: t.reminder! });
    })));
    // Multi-tab list boards
    p.taskListBoards?.forEach(b => b.tasks.forEach(t => {
      if (t.reminder?.active) entries.push({ page: p, task: t, reminder: t.reminder! });
    }));
    return entries;
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onAddCustomTone({
        id: 'custom_' + Date.now().toString(36),
        name: file.name,
        dataUrl: reader.result as string,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  function startEdit(reminderId: string, intervalMinutes: number, sound: ReminderSound) {
    setEditingId(reminderId);
    setEditInterval(intervalMinutes);
    setEditSound(sound);
    setEditCustomMinutes('');
  }

  function applyEdit(taskId: string, pageId: string) {
    onUpdateTimerSettings(taskId, pageId, editInterval, editSound);
    setEditingId(null);
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={modalRef}
        className={styles.modal}
        onClick={e => e.stopPropagation()}
        style={dragPos ? { position: 'fixed', left: dragPos.x, top: dragPos.y } : undefined}
      >
        <div
          className={styles.header}
          onMouseDown={onHandleMouseDown}
          style={{ cursor: dragPos ? 'grabbing' : 'grab' }}
        >
          <div className={styles.title}>⚙ Options</div>
          <button className={styles.closeBtn} onClick={onClose} title="Close">×</button>
        </div>

        {/* Tab bar */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tabBtn} ${tab === 'timers' ? styles.tabActive : ''}`}
            onClick={() => setTab('timers')}
          >
            ⏱ Timers
            {activeTimers.length > 0 && (
              <span className={`${styles.badge} ${ringingIds.length > 0 ? styles.badgeRinging : ''}`}>
                {activeTimers.length}
              </span>
            )}
          </button>
          <button
            className={`${styles.tabBtn} ${tab === 'sounds' ? styles.tabActive : ''}`}
            onClick={() => setTab('sounds')}
          >
            🔊 Sounds
          </button>
          <button
            className={`${styles.tabBtn} ${tab === 'settings' ? styles.tabActive : ''}`}
            onClick={() => setTab('settings')}
          >
            ✦ Settings
          </button>
        </div>

        <div className={styles.content}>

          {/* ── TIMERS TAB ── */}
          {tab === 'timers' && (
            <>
              {activeTimers.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>⏱</div>
                  <div>No active timers.</div>
                  <div className={styles.emptyHint}>Set a reminder on any task using the 🔔 bell icon or Alt+T.</div>
                </div>
              ) : (
                activeTimers.map(({ page, task, reminder }) => {
                  const ringing = ringingIds.includes(reminder.id);
                  const isEditing = editingId === reminder.id;
                  return (
                    <div
                      key={reminder.id}
                      className={`${styles.timerItem} ${ringing ? styles.timerRinging : ''}`}
                    >
                      <div className={styles.timerTopRow}>
                        <div className={styles.timerInfo}>
                          <div className={styles.timerText}>{task.content || 'Untitled task'}</div>
                          <div className={styles.timerMeta}>
                            <span className={styles.timerPage}>[{page.name}]</span>
                            <span className={styles.timerInterval}>{reminder.label}</span>
                            <span className={styles.timerSoundBadge}>{getSoundLabel(reminder.sound, settings.customTones)}</span>
                          </div>
                          <div className={`${styles.timerCountdown} ${ringing ? styles.timerCountdownRinging : ''}`}>
                            {ringing ? '🔔 Ringing now!' : `fires in ${formatCountdown(reminder.fireAt)}`}
                          </div>
                        </div>
                        <div className={styles.timerActions}>
                          {ringing && (
                            <button className={styles.stopBtn} onClick={() => onStopRinging(reminder.id)}>
                              Stop
                            </button>
                          )}
                          {!isEditing && (
                            <button
                              className={styles.editBtn}
                              onClick={() => startEdit(reminder.id, reminder.intervalMinutes, reminder.sound)}
                            >
                              Edit
                            </button>
                          )}
                          <button className={styles.clearBtn} onClick={() => onClearReminder(task.id, page.id)}>
                            Clear
                          </button>
                        </div>
                      </div>

                      {/* Inline edit panel */}
                      {isEditing && (
                        <div className={styles.timerEdit}>
                          <div className={styles.editSection}>
                            <span className={styles.editLabel}>Interval</span>
                            <div className={styles.editPresets}>
                              {INTERVAL_PRESETS.map(m => (
                                <button
                                  key={m}
                                  className={`${styles.presetBtn} ${editInterval === m && editCustomMinutes === '' ? styles.presetActive : ''}`}
                                  onClick={() => { setEditInterval(m); setEditCustomMinutes(''); }}
                                >
                                  {m >= 60 ? `${m / 60}h` : `${m}m`}
                                </button>
                              ))}
                            </div>
                            <div className={styles.editRow}>
                              <span className={styles.editSubLabel}>Custom:</span>
                              <input
                                type="number"
                                min={1}
                                max={1440}
                                placeholder="min"
                                value={editCustomMinutes}
                                onChange={e => {
                                  setEditCustomMinutes(e.target.value);
                                  const parsed = parseInt(e.target.value, 10);
                                  if (!isNaN(parsed) && parsed > 0) setEditInterval(parsed);
                                }}
                                className={styles.editInput}
                              />
                              <span className={styles.editUnit}>min</span>
                            </div>
                          </div>
                          <div className={styles.editSection}>
                            <span className={styles.editLabel}>Sound</span>
                            <select
                              value={editSound}
                              onChange={e => setEditSound(e.target.value as ReminderSound)}
                              className={styles.editSelect}
                            >
                              {SOUND_OPTIONS.map(s => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                              {settings.customTones.map(tone => (
                                <option key={tone.id} value={tone.id}>🔈 {tone.name}</option>
                              ))}
                            </select>
                            <button
                              className={styles.previewSoundBtn}
                              onClick={() => togglePreview(editSound)}
                              style={previewingId === editSound ? { color: '#ffa0a0' } : {}}
                            >
                              {previewingId === editSound ? '■' : '▶'}
                            </button>
                          </div>
                          <div className={styles.editActions}>
                            <button className={styles.applyBtn} onClick={() => applyEdit(task.id, page.id)}>
                              Apply ✓
                            </button>
                            <button className={styles.cancelEditBtn} onClick={() => setEditingId(null)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* ── INTERVAL SEQUENCES (inside Timers tab) ── */}
          {tab === 'timers' && (() => {
            const intervalPages = pages.filter(p => p.pageType === 'interval' && (p.intervalTasks ?? []).length > 0);
            if (intervalPages.length === 0) return null;
            return (
              <>
                <div className={styles.sectionTitle} style={{ marginTop: activeTimers.length > 0 ? 14 : 0 }}>
                  ⏱ Interval Sequences
                </div>
                {intervalPages.map(p => {
                  const tasks: IntervalTask[] = p.intervalTasks ?? [];
                  const totalSec = tasks.reduce((s, t) => s + t.durationSeconds, 0);
                  const totalMin = Math.round(totalSec / 60);
                  return (
                    <div key={p.id} className={styles.timerItem}>
                      <div className={styles.timerTopRow}>
                        <div className={styles.timerInfo}>
                          <div className={styles.timerText}>{p.name}</div>
                          <div className={styles.timerMeta}>
                            <span className={styles.timerInterval}>{tasks.length} blocks · {totalMin}m total</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {tasks.map(task => {
                          const sound = task.completionSound ?? 'chime';
                          const taskMin = Math.round(task.durationSeconds / 60);
                          return (
                            <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: 'rgba(200,170,240,0.7)' }}>
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {task.label || 'Untitled'} · {taskMin}m
                              </span>
                              <select
                                className={styles.editSelect}
                                value={sound}
                                style={{ fontSize: '0.72rem', padding: '1px 2px', maxWidth: 100 }}
                                onChange={e => onUpdateIntervalTask(p.id, task.id, e.target.value as ReminderSound)}
                              >
                                {SOUND_OPTIONS.map(s => (
                                  <option key={s.value} value={s.value}>{s.label}</option>
                                ))}
                                {settings.customTones.map(tone => (
                                  <option key={tone.id} value={tone.id}>🔈 {tone.name}</option>
                                ))}
                              </select>
                              <button
                                className={styles.previewSoundBtn}
                                onClick={() => togglePreview(sound)}
                                style={previewingId === sound ? { color: '#ffa0a0' } : {}}
                              >
                                {previewingId === sound ? '■' : '▶'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            );
          })()}

          {/* ── SOUNDS TAB ── */}
          {tab === 'sounds' && (
            <>
              <div className={styles.sectionTitle}>Volume</div>
              <div className={styles.volumeRow}>
                <span className={styles.volumeLabel}>🔉 {Math.round(settings.volume * 100)}%</span>
                <input
                  type="range"
                  className={styles.volumeSlider}
                  min="0" max="1" step="0.05"
                  value={settings.volume}
                  onChange={e => onSetVolume(parseFloat(e.target.value))}
                />
                <button
                  className={styles.clearBtn}
                  onClick={() => togglePreview('chime')}
                  style={previewingId === 'chime' ? { color: '#ffa0a0', borderColor: 'rgba(220,80,100,0.5)' } : {}}
                >
                  {previewingId === 'chime' ? 'Stop' : 'Test'}
                </button>
              </div>

              <div className={styles.sectionTitle}>Built-in Sounds</div>
              {SOUND_OPTIONS.filter(s => s.value !== 'none').map(s => (
                <div key={s.value} className={styles.toneItem}>
                  <span>{s.label}</span>
                  <button
                    className={styles.clearBtn}
                    onClick={() => togglePreview(s.value)}
                    style={previewingId === s.value ? { color: '#ffa0a0', borderColor: 'rgba(220,80,100,0.5)' } : {}}
                  >
                    {previewingId === s.value ? '■ Stop' : '▶ Play'}
                  </button>
                </div>
              ))}

              <div className={styles.sectionTitle}>Custom Tones</div>
              {settings.customTones.length === 0 && (
                <div className={styles.emptyState} style={{ padding: '8px 0' }}>No custom tones uploaded.</div>
              )}
              {settings.customTones.map(tone => (
                <div key={tone.id} className={styles.toneItem}>
                  <span className={styles.toneName} title={tone.name}>{tone.name}</span>
                  <div className={styles.toneActions}>
                    <button
                      className={styles.clearBtn}
                      onClick={() => togglePreview(tone.id)}
                      style={previewingId === tone.id ? { color: '#ffa0a0', borderColor: 'rgba(220,80,100,0.5)' } : {}}
                    >
                      {previewingId === tone.id ? '■ Stop' : '▶ Play'}
                    </button>
                    <button className={styles.clearBtn} onClick={() => onRemoveCustomTone(tone.id)}>Delete</button>
                  </div>
                </div>
              ))}
              <label className={styles.addToneBtn}>
                + Upload Audio File
                <input type="file" accept="audio/*" onChange={handleFileChange} />
              </label>
            </>
          )}

          {/* ── SETTINGS TAB ── */}
          {tab === 'settings' && (
            <>
              <div className={styles.sectionTitle}>Accent Color</div>
              <div className={styles.accentSection}>
                <div className={styles.accentSwatches}>
                  {ACCENT_PRESETS.map(preset => (
                    <button
                      key={preset.hex}
                      className={`${styles.accentSwatch} ${settings.accentColor === preset.hex ? styles.accentSwatchActive : ''}`}
                      style={{ background: preset.hex }}
                      onClick={() => { onSaveAccentColor(preset.hex); setCustomHex(''); }}
                      title={preset.label}
                    />
                  ))}
                </div>
                <div className={styles.accentCustomRow}>
                  <div
                    className={styles.accentCustomPreview}
                    style={{ background: /^#[0-9a-fA-F]{6}$/.test(customHex) ? customHex : settings.accentColor }}
                  />
                  <input
                    type="text"
                    className={styles.accentCustomInput}
                    placeholder="#hex"
                    maxLength={7}
                    value={customHex}
                    onChange={e => {
                      const val = e.target.value;
                      setCustomHex(val);
                      if (hexDebounceRef.current) clearTimeout(hexDebounceRef.current);
                      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                        hexDebounceRef.current = setTimeout(() => {
                          onSaveAccentColor(val);
                        }, 400);
                      }
                    }}
                  />
                </div>
              </div>

              <div className={styles.sectionTitle}>Default Reminder</div>
              <div className={styles.settingBlock}>
                <div className={styles.settingRow}>
                  <span className={styles.settingLabel}>Duration</span>
                  <div className={styles.presetGroup}>
                    {INTERVAL_PRESETS.map(m => (
                      <button
                        key={m}
                        className={`${styles.presetBtn} ${settings.defaultReminderMinutes === m ? styles.presetActive : ''}`}
                        onClick={() => onUpdateSettings({ defaultReminderMinutes: m })}
                        title={`${m} minutes`}
                      >
                        {m >= 60 ? `${m / 60}h` : `${m}m`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.settingRow}>
                  <span className={styles.settingLabel}>Sound</span>
                  <select
                    value={settings.defaultReminderSound}
                    onChange={e => onUpdateSettings({ defaultReminderSound: e.target.value as ReminderSound })}
                    className={styles.editSelect}
                  >
                    {SOUND_OPTIONS.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                    {settings.customTones.map(tone => (
                      <option key={tone.id} value={tone.id}>🔈 {tone.name}</option>
                    ))}
                  </select>
                  <button
                    className={styles.previewSoundBtn}
                    onClick={() => togglePreview(settings.defaultReminderSound)}
                    style={previewingId === settings.defaultReminderSound ? { color: '#ffa0a0' } : {}}
                  >
                    {previewingId === settings.defaultReminderSound ? '■' : '▶'}
                  </button>
                </div>
                <div className={styles.settingHint}>
                  Current default: {fmtDuration(settings.defaultReminderMinutes)} · {getSoundLabel(settings.defaultReminderSound, settings.customTones)}
                </div>
              </div>

              <div className={styles.sectionTitle}>Planner Defaults</div>
              <div className={styles.settingBlock}>
                <div className={styles.settingRow}>
                  <span className={styles.settingLabel}>Block Duration</span>
                  <div className={styles.presetGroup}>
                    {BLOCK_DURATIONS.map(m => (
                      <button
                        key={m}
                        className={`${styles.presetBtn} ${settings.defaultBlockDuration === m ? styles.presetActive : ''}`}
                        onClick={() => onUpdateSettings({ defaultBlockDuration: m })}
                        title={`${m} minutes`}
                      >
                        {fmtDuration(m)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.settingHint}>
                  New blocks will default to {fmtDuration(settings.defaultBlockDuration)}.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
