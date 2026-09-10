export type Task = {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
  completedAt: string | null;
};

export const STORAGE_KEY = '@taskrank/tasks/v1';

export function addTask(tasks: Task[], title: string, id: string, now: string): Task[] {
  if (!title.trim()) return tasks;
  return [...tasks.filter(t => !t.done), { id, title: title.trim(), done: false, createdAt: now, completedAt: null }, ...tasks.filter(t => t.done)];
}

export function completeTask(tasks: Task[], id: string, now: string): Task[] {
  return tasks.map(t => t.id === id && !t.done ? { ...t, done: true, completedAt: now } : t);
}

export function restoreTask(tasks: Task[], id: string): Task[] {
  const task = tasks.find(t => t.id === id && t.done);
  if (!task) return tasks;
  return [...tasks.filter(t => !t.done), { ...task, done: false, completedAt: null }, ...tasks.filter(t => t.done && t.id !== id)];
}

export function reorderTasks(tasks: Task[], ids: string[]): Task[] {
  const active = tasks.filter(t => !t.done);
  const byId = new Map(active.map(t => [t.id, t]));
  const ordered = [...new Set(ids)].flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
  const included = new Set(ordered.map(t => t.id));
  return [...ordered, ...active.filter(t => !included.has(t.id)), ...tasks.filter(t => t.done)];
}

export function parseTasks(raw: string | null): Task[] {
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error('Invalid saved tasks');
  const seen = new Set<string>();
  return value.map((t: unknown) => {
    if (!t || typeof t !== 'object') throw new Error('Invalid task');
    const task = t as Task;
    if (typeof task.id !== 'string' || seen.has(task.id) || typeof task.title !== 'string' || !task.title.trim() || typeof task.done !== 'boolean' || typeof task.createdAt !== 'string' || !Number.isFinite(Date.parse(task.createdAt)) || (task.done ? typeof task.completedAt !== 'string' || !Number.isFinite(Date.parse(task.completedAt)) : task.completedAt !== null)) throw new Error('Invalid task');
    seen.add(task.id);
    return { id: task.id, title: task.title, done: task.done, createdAt: task.createdAt, completedAt: task.completedAt };
  });
}
