import type { Page, Task } from '../types';

// ── Recursive helpers over a single task tree ──

/** Depth-first search for a task by id within a task and its subtasks. */
function findInTree(task: Task, taskId: string): Task | null {
  if (task.id === taskId) return task;
  for (const sub of task.subtasks ?? []) {
    const found = findInTree(sub, taskId);
    if (found) return found;
  }
  return null;
}

/** Search a list of tasks (and their subtasks) for a matching id. */
function findInTasks(tasks: Task[], taskId: string): Task | null {
  for (const t of tasks) {
    const found = findInTree(t, taskId);
    if (found) return found;
  }
  return null;
}

/** True if taskId exists anywhere in this list of trees. */
function treeHas(tasks: Task[], taskId: string): boolean {
  return findInTasks(tasks, taskId) !== null;
}

/**
 * Return a new task tree where the task matching taskId is replaced by
 * updater(task). If not present in this tree, returns the same task reference.
 */
function updateInTree(task: Task, taskId: string, updater: (t: Task) => Task): Task {
  if (task.id === taskId) return updater(task);
  if (!task.subtasks || task.subtasks.length === 0) return task;
  let changed = false;
  const newSubs = task.subtasks.map(sub => {
    const updated = updateInTree(sub, taskId, updater);
    if (updated !== sub) changed = true;
    return updated;
  });
  return changed ? { ...task, subtasks: newSubs } : task;
}

/** Map updateInTree across a list of task trees. */
function updateInTasks(tasks: Task[], taskId: string, updater: (t: Task) => Task): Task[] {
  return tasks.map(t => updateInTree(t, taskId, updater));
}

/** Collect every task (and nested subtask) from a list of trees, flattened. */
function flattenTasks(tasks: Task[]): Task[] {
  const out: Task[] = [];
  const walk = (t: Task) => {
    out.push(t);
    for (const s of t.subtasks ?? []) walk(s);
  };
  for (const t of tasks) walk(t);
  return out;
}

// ── Exported functions (signatures unchanged) ──

/**
 * Walk a page's flat tasks AND all board column tasks to find one task by id.
 * Now recurses into subtasks at every level.
 * Also searches taskListBoards (fixing the previous find/update asymmetry).
 */
export function findTaskInPage(page: Page, taskId: string): Task | null {
  const flat = findInTasks(page.tasks, taskId);
  if (flat) return flat;

  if (page.todoBoards) {
    for (const board of page.todoBoards) {
      for (const list of board.lists) {
        const t = findInTasks(list.tasks, taskId);
        if (t) return t;
      }
    }
  }

  if (page.taskListBoards) {
    for (const board of page.taskListBoards) {
      const t = findInTasks(board.tasks, taskId);
      if (t) return t;
    }
  }

  return null;
}

/**
 * Return a deep-updated Page where the task matching taskId is replaced
 * by the result of updater(task). Searches flat tasks first, then board tasks,
 * then taskListBoards. Now recurses into subtasks at every level.
 */
export function updateTaskInPage(
  page: Page,
  taskId: string,
  updater: (t: Task) => Task
): Page {
  // Check flat tasks
  if (treeHas(page.tasks, taskId)) {
    return { ...page, tasks: updateInTasks(page.tasks, taskId, updater) };
  }

  // Check todoBoard tasks
  if (page.todoBoards) {
    for (const board of page.todoBoards) {
      for (const list of board.lists) {
        if (treeHas(list.tasks, taskId)) {
          return {
            ...page,
            todoBoards: page.todoBoards.map(b => ({
              ...b,
              lists: b.lists.map(l =>
                treeHas(l.tasks, taskId)
                  ? { ...l, tasks: updateInTasks(l.tasks, taskId, updater) }
                  : l
              ),
            })),
          };
        }
      }
    }
  }

  // Check taskListBoards
  if (page.taskListBoards) {
    for (const board of page.taskListBoards) {
      if (treeHas(board.tasks, taskId)) {
        return {
          ...page,
          taskListBoards: page.taskListBoards.map(b =>
            treeHas(b.tasks, taskId)
              ? { ...b, tasks: updateInTasks(b.tasks, taskId, updater) }
              : b
          ),
        };
      }
    }
  }

  return page; // task not found — return unchanged
}

/**
 * Collect every { task, page } pair where the task has an active, enabled reminder.
 * Now uses flattenTasks so reminders on nested subtasks are also collected.
 */
export function collectRemindableTasks(
  pages: Page[]
): { task: Task; page: Page }[] {
  const result: { task: Task; page: Page }[] = [];
  const isRemindable = (t: Task) =>
    t.reminder?.active && t.reminder.alarmEnabled !== false;

  for (const page of pages) {
    for (const task of flattenTasks(page.tasks)) {
      if (isRemindable(task)) result.push({ task, page });
    }

    if (page.todoBoards) {
      for (const board of page.todoBoards) {
        for (const list of board.lists) {
          for (const task of flattenTasks(list.tasks)) {
            if (isRemindable(task)) result.push({ task, page });
          }
        }
      }
    }

    if (page.taskListBoards) {
      for (const board of page.taskListBoards) {
        for (const task of flattenTasks(board.tasks)) {
          if (isRemindable(task)) result.push({ task, page });
        }
      }
    }
  }

  return result;
}
