const tasksElement = document.querySelector('#tasks');
const statusElement = document.querySelector('#status');
const connectButton = document.querySelector('#connect');
const heading = document.querySelector('#heading');
const tabs = [...document.querySelectorAll('[data-tab]')];
const editor = document.querySelector('#editor');
const input = document.querySelector('#task-input');
const editorTitle = document.querySelector('#editor-title');
const deleteButton = document.querySelector('#delete-task');
let selectedTab = 'Today';
let currentState = { tasks: [] };
let editingTask = null;
let celebrationTimer;
let selectedTaskId = null;
let wheelLocked = false;

const todayKey = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function visibleTasks(tasks) {
  if (selectedTab === 'Today') return tasks.filter(task => task.today_on === todayKey());
  if (selectedTab === 'Done') return tasks.filter(task => task.done);
  return tasks.filter(task => !task.done);
}

function openEditor(task = null) {
  editingTask = task;
  editorTitle.textContent = task ? 'Edit task' : 'New task';
  input.value = task?.title ?? '';
  deleteButton.hidden = !task;
  editor.hidden = false;
  input.focus();
}

function closeEditor() {
  editingTask = null;
  editor.hidden = true;
}

function celebrate(task) {
  const message = document.querySelector('#celebration');
  document.querySelector('#celebration-task').textContent = `${task.title} completed`;
  message.hidden = false;
  clearTimeout(celebrationTimer);
  celebrationTimer = setTimeout(() => { message.hidden = true; }, 30000);
}

function render(state) {
  currentState = state;
  statusElement.textContent = state.message;
  statusElement.hidden = state.connected;
  connectButton.hidden = state.connected;
  heading.textContent = selectedTab;
  tabs.forEach(tab => tab.classList.toggle('selected', tab.dataset.tab === selectedTab));
  const visible = visibleTasks(state.tasks);
  tasksElement.replaceChildren(...visible.map(task => {
    const row = document.createElement('article');
    row.className = `task${task.done ? ' done' : ''}${task.id === selectedTaskId ? ' selected-task' : ''}`;
    row.onclick = event => { if (event.target === row || event.target.classList.contains('task-title')) { selectedTaskId = task.id; render(currentState); } };
    const toggle = document.createElement('button');
    toggle.setAttribute('aria-label', task.done ? `Restore ${task.title}` : `Complete ${task.title}`);
    toggle.textContent = task.done ? '✓' : '';
    toggle.onclick = () => { if (task.done) window.taskrankDesktop.restore(task.id); else { window.taskrankDesktop.complete(task.id); celebrate(task); } };
    const title = document.createElement('span');
    title.className = 'task-title';
    title.textContent = task.title;
    const today = document.createElement('button');
    today.className = `icon-action${task.today_on === todayKey() ? ' selected-today' : ''}`;
    today.textContent = '◷';
    today.title = task.today_on === todayKey() ? 'Remove from Today' : 'Add to Today';
    today.onclick = () => window.taskrankDesktop.setToday(task.id, task.today_on !== todayKey());
    const edit = document.createElement('button');
    edit.className = 'icon-action';
    edit.textContent = '✎';
    edit.title = 'Edit task';
    edit.onclick = () => openEditor(task);
    const actions = document.createElement('div');
    actions.className = 'task-actions';
    actions.append(today, edit);
    row.append(toggle, title, actions);
    return row;
  }));
  if (!visible.length && state.connected) tasksElement.innerHTML = `<p class="empty">${selectedTab === 'Today' ? 'No tasks selected for Today.' : selectedTab === 'Done' ? 'No completed tasks yet.' : 'No active tasks yet.'}</p>`;
}

document.querySelector('#close').onclick = () => window.taskrankDesktop.close();
document.querySelector('#minimize').onclick = () => window.taskrankDesktop.minimize();
document.querySelector('#sync').onclick = () => window.taskrankDesktop.sync();
connectButton.onclick = () => window.taskrankDesktop.connectGoogle();
document.querySelector('#add').onclick = () => openEditor();
document.querySelector('#android-app').onclick = event => { event.preventDefault(); window.taskrankDesktop.openAndroidApp(); };
document.querySelector('#cancel-edit').onclick = closeEditor;
document.querySelector('#save-task').onclick = () => {
  const title = input.value.trim();
  if (!title) return;
  if (editingTask) window.taskrankDesktop.rename(editingTask.id, title);
  else window.taskrankDesktop.create(title);
  closeEditor();
};
deleteButton.onclick = () => { if (editingTask) window.taskrankDesktop.delete(editingTask.id); closeEditor(); };
input.onkeydown = event => { if (event.key === 'Enter') document.querySelector('#save-task').click(); if (event.key === 'Escape') closeEditor(); };
tabs.forEach(tab => { tab.onclick = () => { selectedTab = tab.dataset.tab; render(currentState); }; });
tasksElement.onwheel = event => {
  if (selectedTab !== 'Tasks' || !selectedTaskId || wheelLocked) return;
  const task = currentState.tasks.find(item => item.id === selectedTaskId && !item.done);
  if (!task || event.deltaY === 0) return;
  event.preventDefault();
  wheelLocked = true;
  window.taskrankDesktop.reorder(task.id, event.deltaY < 0 ? -1 : 1);
  setTimeout(() => { wheelLocked = false; }, 180);
};
window.taskrankDesktop.onState(render);
window.taskrankDesktop.getState().then(render);
