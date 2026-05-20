import { useState, useEffect, useCallback, useRef } from 'react';
import { load } from '@tauri-apps/plugin-store';
import type { Project, ProjectTask, ProjectTaskStatus, AccentColor } from '../types';

const STORE_FILE = 'projects.json';
const PROJECTS_KEY = 'projects';
const BACKUP_KEY = 'projects_backup';

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function makeProjectTask(content = ''): ProjectTask {
  return {
    id: makeId(),
    content,
    notes: '',
    status: 'not_started',
    createdAt: Date.now(),
    order: Date.now(),
  };
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [ready, setReady] = useState(false);
  const saveTimeout = useRef<number | null>(null);

  // Load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = await load(STORE_FILE, { autoSave: false } as any);
        let stored = await store.get<Project[]>(PROJECTS_KEY);
        if (!stored || stored.length === 0) {
          const backup = await store.get<Project[]>(BACKUP_KEY);
          if (backup && backup.length > 0) {
            stored = backup;
            await store.set(PROJECTS_KEY, backup);
            await store.save();
          }
        }
        if (!cancelled) {
          setProjects(stored ?? []);
          setReady(true);
        }
      } catch (err) {
        console.error('[useProjects] load error:', err);
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const saveToStore = async (p: Project[]) => {
    try {
      const store = await load(STORE_FILE, { autoSave: false } as any);
      await store.set(PROJECTS_KEY, p);
      await store.set(BACKUP_KEY, p);
      await store.save();
    } catch (err) {
      console.error('[useProjects] save error:', err);
    }
  };

  const debouncedSave = (next: Project[]) => {
    if (saveTimeout.current !== null) window.clearTimeout(saveTimeout.current);
    saveTimeout.current = window.setTimeout(() => saveToStore(next), 400);
  };

  // ── CRUD ──

  const createProject = useCallback((name: string, color: AccentColor = 'plum'): Project => {
    const p: Project = {
      id: makeId(),
      name,
      color,
      status: 'active',
      description: '',
      tasks: [makeProjectTask('')],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setProjects(prev => {
      const next = [...prev, p];
      debouncedSave(next);
      return next;
    });
    return p;
  }, []);

  const updateProject = useCallback((id: string, changes: Partial<Omit<Project, 'id' | 'createdAt'>>) => {
    setProjects(prev => {
      const next = prev.map(p =>
        p.id === id ? { ...p, ...changes, updatedAt: Date.now() } : p
      );
      debouncedSave(next);
      return next;
    });
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects(prev => {
      const next = prev.filter(p => p.id !== id);
      debouncedSave(next);
      return next;
    });
  }, []);

  // ── Task CRUD within a project ──

  const addProjectTask = useCallback((projectId: string, content = ''): ProjectTask => {
    const task = makeProjectTask(content);
    setProjects(prev => {
      const next = prev.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          tasks: [...p.tasks, task],
          updatedAt: Date.now(),
        };
      });
      debouncedSave(next);
      return next;
    });
    return task;
  }, []);

  const updateProjectTask = useCallback((
    projectId: string,
    taskId: string,
    changes: Partial<Omit<ProjectTask, 'id' | 'createdAt'>>
  ) => {
    setProjects(prev => {
      const next = prev.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          tasks: p.tasks.map(t => t.id === taskId ? { ...t, ...changes } : t),
          updatedAt: Date.now(),
        };
      });
      debouncedSave(next);
      return next;
    });
  }, []);

  const deleteProjectTask = useCallback((projectId: string, taskId: string) => {
    setProjects(prev => {
      const next = prev.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          tasks: p.tasks.filter(t => t.id !== taskId),
          updatedAt: Date.now(),
        };
      });
      debouncedSave(next);
      return next;
    });
  }, []);

  const setTaskStatus = useCallback((
    projectId: string,
    taskId: string,
    status: ProjectTaskStatus
  ) => {
    updateProjectTask(projectId, taskId, {
      status,
      completedAt: status === 'done' ? Date.now() : undefined,
    });
  }, [updateProjectTask]);

  const reorderTasks = useCallback((projectId: string, orderedIds: string[]) => {
    setProjects(prev => {
      const next = prev.map(p => {
        if (p.id !== projectId) return p;
        const taskMap = new Map(p.tasks.map(t => [t.id, t]));
        const reordered = orderedIds
          .map((id, i) => {
            const t = taskMap.get(id);
            return t ? { ...t, order: i } : null;
          })
          .filter(Boolean) as ProjectTask[];
        return { ...p, tasks: reordered, updatedAt: Date.now() };
      });
      debouncedSave(next);
      return next;
    });
  }, []);

  // ── Derived helpers ──

  const getProject = useCallback((id: string) =>
    projects.find(p => p.id === id) ?? null,
  [projects]);

  const getActiveProjects = useCallback(() =>
    projects.filter(p => p.status === 'active'),
  [projects]);

  const getProjectForBlock = useCallback((projectId?: string) =>
    projectId ? (projects.find(p => p.id === projectId) ?? null) : null,
  [projects]);

  return {
    projects,
    ready,
    createProject,
    updateProject,
    deleteProject,
    addProjectTask,
    updateProjectTask,
    deleteProjectTask,
    setTaskStatus,
    reorderTasks,
    getProject,
    getActiveProjects,
    getProjectForBlock,
  };
}
