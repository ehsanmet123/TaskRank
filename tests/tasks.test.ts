import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addTask, completeTask, deleteTask, parseTasks, reorderTasks, restoreTask, setTaskToday, updateTask } from '../src/tasks.ts';
const now = '2026-09-09T12:00:00.000Z';
const initial = ['Homework', 'Emails', 'Clean room'].reduce((tasks, title, i) => addTask(tasks, title, String(i), now), [] as ReturnType<typeof parseTasks>);
test('completing first task closes the rank gap and records completion', () => {
  const tasks = completeTask(initial, '0', now);
  assert.deepEqual(tasks.filter(t => !t.done).map((t, i) => [i + 1, t.title]), [[1, 'Emails'], [2, 'Clean room']]);
  assert.equal(tasks[0].completedAt, now);
  assert.equal(initial[0].done, false);
});
test('new and restored tasks go to the bottom of active tasks', () => {
  let tasks = addTask(completeTask(initial, '0', now), ' Groceries ', '3', now);
  assert.deepEqual(tasks.filter(t => !t.done).map(t => t.id), ['1', '2', '3']);
  tasks = restoreTask(tasks, '0');
  assert.deepEqual(tasks.filter(t => !t.done).map(t => t.id), ['1', '2', '3', '0']);
  assert.equal(tasks[3].completedAt, null);
});
test('reordering survives serialization and preserves done tasks', () => {
  const tasks = reorderTasks(completeTask(initial, '0', now), ['2', '1']);
  assert.deepEqual(parseTasks(JSON.stringify(tasks)), tasks);
  assert.deepEqual(tasks.map(t => t.id), ['2', '1', '0']);
  assert.ok(tasks.every(t => !('rank' in t) && !('priority' in t)));
});
test('stale drag results cannot revive completed tasks or drop new tasks', () => {
  const tasks = addTask(completeTask(initial, '0', now), 'New', '3', now);
  assert.deepEqual(reorderTasks(tasks, ['2', '0', '1']).filter(t => !t.done).map(t => t.id), ['2', '1', '3']);
});
test('empty input is ignored and invalid saved data fails without replacement', () => {
  assert.equal(addTask(initial, '   ', '3', now), initial);
  assert.deepEqual(parseTasks(null), []);
  assert.throws(() => parseTasks('{broken'));
  assert.throws(() => parseTasks(JSON.stringify([initial[0], initial[0]])));
});
test('editing preserves task state and deleting removes active or completed tasks', () => {
  const completed = completeTask(initial, '0', now);
  const renamed = updateTask(completed, '0', ' Finished homework ', now);
  assert.deepEqual(renamed[0], { ...completed[0], title: 'Finished homework' });
  assert.equal(updateTask(renamed, '1', '  '), renamed);
  assert.deepEqual(deleteTask(renamed, '0').map(task => task.id), ['1', '2']);
  assert.deepEqual(deleteTask(initial, '1').map(task => task.id), ['0', '2']);
});
test('today selection is stored separately from a task rank and migrates older saved tasks', () => {
  const today = setTaskToday(initial, '1', '2026-09-22');
  assert.equal(today[1].todayOn, '2026-09-22');
  assert.equal(today[1].done, false);
  const legacy = JSON.stringify(initial.map(({ todayOn, ...task }) => task));
  assert.ok(parseTasks(legacy).every(task => task.todayOn === null));
});
