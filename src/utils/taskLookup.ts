import type { Page, Task } from '../types';

/**
 * Walk a page's flat tasks AND all board column tasks to find one task by id.
 * Returns { task, sourceList: 'flat' | listId } or null.
 */
export function findTaskInPage(page: Page, taskId: string): Task | null {
  const flat = page.tasks.find(t => t.id === taskId);
  if (flat) return flat;

  if (page.todoBoards) {
    for (const board of page.todoBoards) {
      for (const list of board.lists) {
        const t = list.tasks.find(t => t.id === taskId);
        if (t) return t;
      }
    }
  }
  return null;
}

/**
 * Return a deep-updated Page where the task matching taskId is replaced
 * by the result of updater(task). Searches flat tasks first, then board tasks.
 */
export function updateTaskInPage(
  page: Page,
  taskId: string,
  updater: (t: Task) => Task
): Page {
  // Check flat tasks
  if (page.tasks.some(t => t.id === taskId)) {
    return { ...page, tasks: page.tasks.map(t => t.id === taskId ? updater(t) : t) };
  }

  // Check board tasks
  if (page.todoBoards) {
    return {
      ...page,
      todoBoards: page.todoBoards.map(board => ({
        ...board,
        lists: board.lists.map(list => ({
          ...list,
          tasks: list.tasks.map(t => t.id === taskId ? updater(t) : t),
        })),
      })),
    };
  }

  return page; // task not found — return unchanged
}

/**
 * Collect every { task, page } pair where the task has an active, enabled reminder.
 * Searches both flat tasks and board tasks.
 */
export function collectRemindableTasks(
  pages: Page[]
): { task: Task; page: Page }[] {
  const result: { task: Task; page: Page }[] = [];

  for (const page of pages) {
    // Flat tasks
    for (const task of page.tasks) {
      if (task.reminder?.active && task.reminder.alarmEnabled !== false) {
        result.push({ task, page });
      }
    }

    // Board tasks
    if (page.todoBoards) {
      for (const board of page.todoBoards) {
        for (const list of board.lists) {
          for (const task of list.tasks) {
            if (task.reminder?.active && task.reminder.alarmEnabled !== false) {
              result.push({ task, page });
            }
          }
        }
      }
    }
  }

  return result;
}
