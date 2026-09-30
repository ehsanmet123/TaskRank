const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const protocol = 'taskrank-desktop';
const ANDROID_APP_URL = 'https://play.google.com/store/apps/details?id=com.kianiharchegani.taskrank';
let window;
let supabase;
let session = null;
let tasks = [];
let restoreWidgetTimer = null;

function hideWidgetForFiveMinutes() {
  if (!window || window.isDestroyed()) return;
  if (restoreWidgetTimer) clearTimeout(restoreWidgetTimer);
  window.hide();
  restoreWidgetTimer = setTimeout(() => {
    restoreWidgetTimer = null;
    if (!window || window.isDestroyed()) return;
    window.show();
    window.setAlwaysOnTop(true, 'floating');
  }, 5 * 60 * 1000);
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function readConfig() {
  const file = path.join(__dirname, 'runtime-config.json');
  if (!fs.existsSync(file)) return null;
  try {
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    return config.supabaseUrl && config.supabasePublishableKey ? config : null;
  } catch { return null; }
}

function storage() {
  const file = path.join(app.getPath('userData'), 'supabase-session.json');
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
  return {
    getItem: async key => read()[key] ?? null,
    setItem: async (key, value) => { const values = read(); values[key] = value; fs.writeFileSync(file, JSON.stringify(values)); },
    removeItem: async key => { const values = read(); delete values[key]; fs.writeFileSync(file, JSON.stringify(values)); },
  };
}

function widgetState(message) {
  const today = localDateKey();
  return {
    connected: Boolean(session),
    message: message ?? (session ? (tasks.some(task => task.today_on === today && !task.done) ? 'Your Today tasks stay in sync with your phone.' : 'No tasks selected for Today.') : 'Connect Google to show your tasks.'),
    tasks,
  };
}

function sendState(message) {
  if (!window || window.isDestroyed()) return;
  window.webContents.send('widget:state', widgetState(message));
}

async function sync() {
  if (!supabase || !session?.user) return sendState();
  const [{ data, error }, { data: list, error: listError }] = await Promise.all([
    supabase.from('tasks').select('id,title,done,created_at,completed_at,today_on,updated_at').eq('user_id', session.user.id),
    supabase.from('task_lists').select('active_task_ids').eq('user_id', session.user.id).maybeSingle(),
  ]);
  if (error) return sendState(`Sync error: ${error.message}`);
  if (listError) return sendState(`Sync error: ${listError.message}`);
  const order = Array.isArray(list?.active_task_ids) ? list.active_task_ids : [];
  const position = new Map(order.map((id, index) => [id, index]));
  const active = (data ?? []).filter(task => !task.done).sort((a, b) => (position.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (position.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.created_at.localeCompare(b.created_at));
  const done = (data ?? []).filter(task => task.done).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
  tasks = [...active, ...done];
  sendState();
}

async function persistOrder() {
  if (!session?.user) return;
  const { error } = await supabase.from('task_lists').upsert({ user_id: session.user.id, active_task_ids: tasks.filter(task => !task.done).map(task => task.id), updated_at: new Date().toISOString() });
  if (error) sendState(`Sync error: ${error.message}`);
}

async function updateTask(id, values) {
  if (!session?.user) return;
  const { error } = await supabase.from('tasks').update({ ...values, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', session.user.id);
  if (error) return sendState(`Sync error: ${error.message}`);
  await sync();
  await persistOrder();
}

async function createTask(title) {
  if (!session?.user || !title.trim()) return;
  const now = new Date().toISOString();
  const task = { id: crypto.randomUUID(), user_id: session.user.id, title: title.trim(), done: false, created_at: now, completed_at: null, today_on: null, updated_at: now };
  const { error } = await supabase.from('tasks').insert(task);
  if (error) return sendState(`Sync error: ${error.message}`);
  tasks.push(task);
  await persistOrder();
  sendState();
}

async function deleteTask(id) {
  if (!session?.user) return;
  const { error } = await supabase.from('tasks').delete().eq('id', id).eq('user_id', session.user.id);
  if (error) return sendState(`Sync error: ${error.message}`);
  tasks = tasks.filter(task => task.id !== id);
  await persistOrder();
  sendState();
}

async function reorderTask(id, direction) {
  const active = tasks.filter(task => !task.done);
  const index = active.findIndex(task => task.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= active.length) return;
  [active[index], active[target]] = [active[target], active[index]];
  tasks = [...active, ...tasks.filter(task => task.done)];
  await persistOrder();
  sendState();
}

async function completeAuth(url) {
  const code = new URL(url).searchParams.get('code');
  if (!code || !supabase) return;
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return sendState(`Google sign-in error: ${error.message}`);
  session = data.session;
  await sync();
}

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  const icon = path.join(__dirname, 'assets', 'taskrank-store-icon.png');
  window = new BrowserWindow({
    width: 220, height: 560, x: area.x + area.width - 240, y: area.y + area.height - 590,
    minWidth: 200, minHeight: 360, frame: false, alwaysOnTop: true, resizable: true,
    icon,
    backgroundColor: '#ffffff', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.webContents.on('context-menu', event => {
    event.preventDefault();
    hideWidgetForFiveMinutes();
  });
  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function initializeSupabase() {
  const config = readConfig();
  if (!config) return;
  supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { storage: storage(), persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' } });
  supabase.auth.getSession().then(({ data }) => { session = data.session; void sync(); });
  supabase.auth.onAuthStateChange((_event, nextSession) => { session = nextSession; if (nextSession) void sync(); else sendState(); });
}

ipcMain.handle('widget:get-state', () => widgetState(supabase ? undefined : 'Desktop configuration is missing. Run npm run desktop:config before building.'));
ipcMain.handle('widget:sync', async () => { await sync(); return widgetState(); });
ipcMain.handle('widget:complete', async (_event, id) => updateTask(id, { done: true, completed_at: new Date().toISOString() }));
ipcMain.handle('widget:restore', async (_event, id) => updateTask(id, { done: false, completed_at: null }));
ipcMain.handle('widget:create', async (_event, title) => createTask(title));
ipcMain.handle('widget:rename', async (_event, id, title) => updateTask(id, { title: title.trim() }));
ipcMain.handle('widget:today', async (_event, id, selected) => updateTask(id, { today_on: selected ? localDateKey() : null }));
ipcMain.handle('widget:delete', async (_event, id) => deleteTask(id));
ipcMain.handle('widget:reorder', async (_event, id, direction) => reorderTask(id, direction));
ipcMain.handle('external:android-app', () => shell.openExternal(ANDROID_APP_URL));
ipcMain.handle('auth:google', async () => {
  if (!supabase) return sendState('Desktop configuration is missing. Run npm run desktop:config before building.');
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${protocol}://auth/callback`, skipBrowserRedirect: true } });
  if (error || !data.url) return sendState(`Google sign-in error: ${error?.message ?? 'Could not start sign-in.'}`);
  await shell.openExternal(data.url);
});
ipcMain.on('widget:close', () => window?.close());
ipcMain.on('widget:minimize', () => window?.minimize());

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
app.on('second-instance', (_event, args) => { const url = args.find(arg => arg.startsWith(`${protocol}://`)); if (url) void completeAuth(url); window?.show(); window?.focus(); });
app.on('open-url', (event, url) => { event.preventDefault(); void completeAuth(url); });
app.whenReady().then(() => {
  app.setAsDefaultProtocolClient(protocol);
  app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false });
  initializeSupabase();
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
