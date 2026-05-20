import { useState, useEffect, useCallback } from 'react';
import { load } from '@tauri-apps/plugin-store';
import type { Project, ProjectTask, ProjectTaskStatus, AccentColor } from '../types';

const STORE_FILE = 'projects.json';
const STORE_KEY = 'projects';

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const store = await load(STORE_FILE, { autoSave: false } as any);
        const stored = await store.get<Project[]>(STORE_KEY);
        setProjects(stored ?? []);
      } catch {
        setProjects([]);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const save = useCallback(async (next: Project[]) => {
    try {
      const store = await load(STORE_FILE, { autoSave: false } as any);
      await store.set(STORE_KEY, next);
      await store.save();
    } catch (err) {
      console.error('[useProjects] save error:', err);
    }
  }, []);

  const mutate = useCallback((updater: (prev: Project[]) => Project[]) => {
    setProjects(prev => {
      const next = updater(prev);
      save(next);
      return next;
    });
  }, [save]);

  const createProject = useCallback((name: string, color: AccentColor = 'plum'): Project => {
    const now = Date.now();
    const project: Project = {
      id: makeId(),
      name,
      color,
      status: 'active',
      description: '',
      tasks: [],
      createdAt: now,
      updatedAt: now,
    };
    mutate(prev => [...prev, project]);
    return project;
  }, [mutate]);

  const updateProject = useCallback((id: string, changes: Partial<Project>) => {
    mutate(prev => prev.map(p =>
      p.id === id ? { ...p, ...changes, updatedAt: Date.now() } : p
    ));
  }, [mutate]);

  const deleteProject = useCallback((id: string) => {
    mutate(prev => prev.filter(p => p.id !== id));
  }, [mutate]);

  const addProjectTask = useCallback((
    projectId: string,
    task: Omit<ProjectTask, 'id' | 'createdAt'>
  ) => {
    const newTask: ProjectTask = { ...task, id: makeId(), createdAt: Date.now() };
    mutate(prev => prev.map(p =>
      p.id === projectId
        ? { ...p, tasks: [...p.tasks, newTask], updatedAt: Date.now() }
        : p
    ));
  }, [mutate]);

  const updateProjectTask = useCallback((
    projectId: string,
    taskId: string,
    changes: Partial<ProjectTask>
  ) => {
    mutate(prev => prev.map(p =>
      p.id === projectId
        ? {
            ...p,
            tasks: p.tasks.map(t => t.id === taskId ? { ...t, ...changes } : t),
            updatedAt: Date.now(),
          }
        : p
    ));
  }, [mutate]);

  const deleteProjectTask = useCallback((projectId: string, taskId: string) => {
    mutate(prev => prev.map(p =>
      p.id === projectId
        ? { ...p, tasks: p.tasks.filter(t => t.id !== taskId), updatedAt: Date.now() }
        : p
    ));
  }, [mutate]);

  const setTaskStatus = useCallback((
    projectId: string,
    taskId: string,
    status: ProjectTaskStatus
  ) => {
    mutate(prev => prev.map(p =>
      p.id === projectId
        ? {
            ...p,
            tasks: p.tasks.map(t =>
              t.id === taskId
                ? { ...t, status, ...(status === 'done' ? { completedAt: Date.now() } : {}) }
                : t
            ),
            updatedAt: Date.now(),
          }
        : p
    ));
  }, [mutate]);

  const getProjectForBlock = useCallback((projectId?: string): Project | null => {
    if (!projectId) return null;
    return projects.find(p => p.id === projectId) ?? null;
  }, [projects]);

  const getActiveProjects = useCallback(() => {
    return projects.filter(p => p.status === 'active');
  }, [projects]);

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
    getProjectForBlock,
    getActiveProjects,
  };
}
