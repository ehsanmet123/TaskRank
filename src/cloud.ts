import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { reorderTasks, Task } from './tasks';

WebBrowser.maybeCompleteAuthSession();

type RemoteTask = {
  id: string;
  title: string;
  done: boolean;
  created_at: string;
  completed_at: string | null;
  today_on: string | null;
  updated_at: string;
};

type RemoteList = { active_task_ids: unknown };

export type CloudState = 'offline' | 'ready' | 'syncing' | 'error';

export function activeOrder(tasks: Task[]): string[] {
  return tasks.filter(task => !task.done).map(task => task.id);
}

function fromRemote(task: RemoteTask): Task {
  return {
    id: task.id,
    title: task.title,
    done: task.done,
    createdAt: task.created_at,
    completedAt: task.completed_at,
    todayOn: task.today_on,
    updatedAt: task.updated_at,
  };
}

function parseOrder(value: unknown): string[] {
  return Array.isArray(value) && value.every(id => typeof id === 'string') ? value : [];
}

/** Combines device changes with cloud changes. The most recently edited task wins. */
export function mergeCloudTasks(local: Task[], remote: RemoteTask[], cloudOrder: unknown): Task[] {
  const byId = new Map(remote.map(task => [task.id, fromRemote(task)]));
  local.forEach(task => {
    const cloudTask = byId.get(task.id);
    if (!cloudTask || task.updatedAt >= cloudTask.updatedAt) byId.set(task.id, task);
  });
  const values = [...byId.values()];
  const localIds = new Set(local.map(task => task.id));
  const preferredOrder = [...activeOrder(local), ...parseOrder(cloudOrder).filter(id => !localIds.has(id))];
  const active = values.filter(task => !task.done);
  const done = values.filter(task => task.done).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  return [...reorderTasks(active, preferredOrder), ...done];
}

export async function signInWithGoogle(): Promise<void> {
  const redirectTo = makeRedirectUri({ scheme: 'taskrank', path: 'auth/callback' });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Google sign-in could not start.');
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return;
  const callback = new URL(result.url);
  const code = callback.searchParams.get('code');
  if (code) {
    const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
    if (sessionError) throw sessionError;
    return;
  }
  const fragment = new URLSearchParams(callback.hash.replace(/^#/, ''));
  const accessToken = callback.searchParams.get('access_token') ?? fragment.get('access_token');
  const refreshToken = callback.searchParams.get('refresh_token') ?? fragment.get('refresh_token');
  if (!accessToken || !refreshToken) throw new Error('Google sign-in did not return a session.');
  const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (sessionError) throw sessionError;
}

export function startCloudSession(onChange: (session: Session | null) => void): () => void {
  supabase.auth.getSession().then(({ data }) => onChange(data.session));
  const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => onChange(session));
  return () => subscription.subscription.unsubscribe();
}

export async function syncTasks(user: User, local: Task[]): Promise<Task[]> {
  const [tasksResult, listResult] = await Promise.all([
    supabase.from('tasks').select('id,title,done,created_at,completed_at,today_on,updated_at').eq('user_id', user.id),
    supabase.from('task_lists').select('active_task_ids').eq('user_id', user.id).maybeSingle(),
  ]);
  if (tasksResult.error) throw tasksResult.error;
  if (listResult.error) throw listResult.error;
  const merged = mergeCloudTasks(local, (tasksResult.data ?? []) as RemoteTask[], (listResult.data as RemoteList | null)?.active_task_ids);
  const records = merged.map(task => ({
    id: task.id,
    user_id: user.id,
    title: task.title,
    done: task.done,
    created_at: task.createdAt,
    completed_at: task.completedAt,
    today_on: task.todayOn,
    updated_at: task.updatedAt,
  }));
  const { error: taskError } = await supabase.from('tasks').upsert(records, { onConflict: 'id' });
  if (taskError) throw taskError;
  const { error: listError } = await supabase.from('task_lists').upsert({
    user_id: user.id,
    active_task_ids: activeOrder(merged),
    updated_at: new Date().toISOString(),
  });
  if (listError) throw listError;
  return merged;
}
