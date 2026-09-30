import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, FlatList, KeyboardAvoidingView, Linking, Modal, ScrollView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { addTask, completeTask, deleteTask, parseTasks, reorderTasks, restoreTask, setTaskToday, STORAGE_KEY, Task, updateTask } from './src/tasks';
import { s as baseStyles, blue } from './src/styles';
import { CloudState, signInWithGoogle, startCloudSession, syncTasks } from './src/cloud';
import type { Session } from '@supabase/supabase-js';

import { languages, isLanguage, LANGUAGE_KEY, todayCopy, translate, type Language, type TranslationKey } from './src/i18n';
import { localizedStyles } from './src/localizedStyles';

type IconName = React.ComponentProps<typeof Feather>['name'];
const Icon = ({ name, size = 22, color = '#8390A6' }: { name: IconName; size?: number; color?: string }) => <Feather name={name} size={size} color={color} />;
const PRIVACY_POLICY_URL = 'https://ehsanmet123.github.io/TaskRank/';
const WINDOWS_WIDGET_URL = 'https://github.com/ehsanmet123/TaskRank/releases';
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [languageOpen, setLanguageOpen] = useState(false);
  const [languageReady, setLanguageReady] = useState(false);
  const [languageSaving, setLanguageSaving] = useState(false);
  const currentLanguage = languages.find(item => item.code === language)!;
  const s = localizedStyles(baseStyles, currentLanguage.rtl);
  const t = (key: TranslationKey, values?: Record<string, string | number>) => translate(language, key, values);
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(LANGUAGE_KEY).then(saved => {
      if (!cancelled && isLanguage(saved)) setLanguage(saved);
    }).catch(() => {}).finally(() => { if (!cancelled) setLanguageReady(true); });
    return () => { cancelled = true; };
  }, []);
  const selectLanguage = async (next: Language) => {
    if (languageSaving) return;
    setLanguageSaving(true);
    try {
      await AsyncStorage.setItem(LANGUAGE_KEY, next);
      setLanguage(next);
      setLanguageOpen(false);
    } catch {
      Alert.alert(t('language'), t('languageSaveError'));
    } finally { setLanguageSaving(false); }
  };
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tab, setTab] = useState<'Tasks' | 'Today' | 'Done'>('Tasks');
  const [today, setToday] = useState(localDateKey());
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [title, setTitle] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [celebration, setCelebration] = useState('');
  const [dragging, setDragging] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [cloudState, setCloudState] = useState<CloudState>('offline');
  const [cloudError, setCloudError] = useState('');
  const queue = useRef(Promise.resolve());
  const revision = useRef(0);
  const input = useRef<TextInput>(null);
  const cloudBusy = useRef(false);
  const celebrationScale = useRef(new Animated.Value(0.7)).current;
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      const saved = parseTasks(raw);
      if (!cancelled) { setTasks(saved); setLoaded(true); }
    }).catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [retry]);
  useEffect(() => {
    if (!loaded) return;
    const version = ++revision.current;
    queue.current = queue.current.then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)))
      .then(() => { if (version === revision.current) setSaveError(false); })
      .catch(() => { if (version === revision.current) setSaveError(true); });
  }, [tasks, loaded]);
  useEffect(() => startCloudSession(setSession), []);
  useEffect(() => () => { if (celebrationTimer.current) clearTimeout(celebrationTimer.current); }, []);
  useEffect(() => {
    const millisecondsUntilTomorrow = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1).getTime() - Date.now() + 1000;
    const timer = setTimeout(() => setToday(localDateKey()), millisecondsUntilTomorrow);
    return () => clearTimeout(timer);
  }, [today]);
  const active = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done).sort((a, b) => b.completedAt!.localeCompare(a.completedAt!));
  const todayTasks = tasks.filter(task => task.todayOn === today);
  const todayText = todayCopy[language];
  const close = () => { setSheet(false); setTitle(''); setEditingTask(null); };
  const openEdit = (task: Task) => { setEditingTask(task); setTitle(task.title); setSheet(true); };
  const submit = () => {
    if (!title.trim()) return;
    if (editingTask) {
      setTasks(current => updateTask(current, editingTask.id, title));
    } else {
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      setTasks(current => addTask(current, title, id, new Date().toISOString()));
    }
    close();
  };
  const confirmDelete = (task: Task) => Alert.alert('Delete task?', `Delete “${task.title}”? This can’t be undone.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { setTasks(current => deleteTask(current, task.id)); close(); } },
  ]);
  const celebrate = (task: Task) => {
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    setCelebration(task.title);
    celebrationScale.setValue(0.7);
    Animated.spring(celebrationScale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
    celebrationTimer.current = setTimeout(() => setCelebration(''), 1900);
  };
  const move = (id: string, direction: number) => setTasks(current => {
    const ids = current.filter(t => !t.done).map(t => t.id);
    const from = ids.indexOf(id), to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return current;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    return reorderTasks(current, ids);
  });
  const syncCloud = useCallback(async () => {
    if (!session?.user || cloudBusy.current) return;
    cloudBusy.current = true;
    setCloudState('syncing');
    try {
      const merged = await syncTasks(session.user, tasks);
      if (JSON.stringify(merged) !== JSON.stringify(tasks)) setTasks(merged);
      setCloudError('');
      setCloudState('ready');
    } catch (error) {
      setCloudState('error');
      setCloudError(error instanceof Error ? error.message : 'Cloud sync failed.');
    } finally {
      cloudBusy.current = false;
    }
  }, [session, tasks]);
  useEffect(() => {
    if (!loaded || !session?.user) { if (!session?.user) setCloudState('offline'); return; }
    const timer = setTimeout(() => { void syncCloud(); }, 700);
    return () => clearTimeout(timer);
  }, [loaded, session?.user?.id, syncCloud]);
  const connectGoogle = async () => {
    setCloudState('syncing');
    try {
      await signInWithGoogle();
    } catch (error) {
      setCloudState('offline');
      const message = error instanceof Error && error.message ? error.message : t('tryAgain');
      setCloudError(message);
      Alert.alert(t('googleError'), message);
    }
  };
  const renderTask = ({ item, drag, isActive, getIndex }: RenderItemParams<Task>) => {
    const rank = (getIndex() ?? active.findIndex(t => t.id === item.id)) + 1;
    return <ScaleDecorator activeScale={1.025}><Pressable onPress={() => openEdit(item)} onLongPress={drag} delayLongPress={250} disabled={isActive}
      style={[s.card, rank === 1 && s.firstCard, isActive && s.dragCard]} accessibilityLabel={t('rank', { rank, title: item.title })} accessibilityHint={t('drag')}
      accessibilityActions={[{ name: 'increment', label: t('down') }, { name: 'decrement', label: t('up') }]}
      onAccessibilityAction={e => move(item.id, e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
      <Text style={[s.rank, rank === 1 && { color: blue }]}>{rank}</Text>
      <View style={s.taskText}>{rank === 1 && <Text style={s.nextLabel}>{t('upNext')}</Text>}<Text style={s.taskTitle}>{item.title}</Text></View>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: false }} accessibilityLabel={t('complete', { title: item.title })} disabled={dragging} onPress={() => { setTasks(current => completeTask(current, item.id, new Date().toISOString())); celebrate(item); }} style={s.touch}><View style={s.checkbox} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${item.title}`} disabled={dragging} onPress={() => openEdit(item)} style={s.touch}><Icon name="edit-2" size={18} color={blue} /></Pressable>
      <Pressable onLongPress={drag} delayLongPress={200} accessibilityLabel={t('reorder', { title: item.title })} accessibilityHint={t('dragTouch')} style={s.handle}><Icon name="menu" size={20} color="#ADB6C5" /></Pressable>
    </Pressable></ScaleDecorator>;
  };
  const empty = (completed: boolean) => <View style={s.empty}><View style={s.emptyIcon}><Icon name={completed ? 'check' : 'list'} size={32} color={blue} /></View><Text style={s.emptyTitle}>{completed ? t('emptyDone') : done.length ? t('emptyClear') : t('emptyNew')}</Text><Text style={s.emptyBody}>{completed ? t('bodyDone') : done.length ? t('bodyClear') : t('bodyNew')}</Text></View>;
  const renderTodayTask = ({ item }: { item: Task }) => <View style={s.card}>
    <View style={s.doneCheck}><Icon name={item.done ? 'check' : 'calendar'} size={19} color={blue} /></View>
    <Pressable style={s.taskText} onPress={() => openEdit(item)} accessibilityRole="button" accessibilityLabel={`Edit ${item.title}`}><Text style={item.done ? s.doneTitle : s.taskTitle}>{item.title}</Text>{item.done ? <Text style={s.completedDate}>{t('completed', { date: new Date(item.completedAt!).toLocaleDateString(currentLanguage.locale, { month: 'short', day: 'numeric' }) })}</Text> : null}</Pressable>
    {item.done ? <Pressable style={s.touch} accessibilityRole="button" accessibilityLabel={t('restore', { title: item.title })} onPress={() => setTasks(current => restoreTask(current, item.id))}><Icon name="rotate-ccw" size={19} /></Pressable> : <Pressable style={s.touch} accessibilityRole="checkbox" accessibilityState={{ checked: false }} accessibilityLabel={t('complete', { title: item.title })} onPress={() => { setTasks(current => completeTask(current, item.id, new Date().toISOString())); celebrate(item); }}><View style={s.checkbox} /></Pressable>}
    <Pressable style={s.touch} accessibilityRole="button" accessibilityLabel={`Edit ${item.title}`} onPress={() => openEdit(item)}><Icon name="edit-2" size={18} color={blue} /></Pressable>
  </View>;

  return <GestureHandlerRootView style={s.root}><SafeAreaProvider><StatusBar style="dark" /><SafeAreaView style={s.safe}><View style={s.app}>
    <View style={s.brand}><View style={s.logo}><Icon name="bar-chart-2" color="white" size={19} /></View><Text style={s.brandText}>taskrank<Text style={{ color: blue }}>.</Text></Text><Pressable accessibilityRole="button" accessibilityLabel={session ? t('syncLabel') : t('connectLabel')} onPress={session ? () => void syncCloud() : () => void connectGoogle()} style={s.cloudButton}><Icon name={session ? 'cloud' : 'log-in'} size={14} color={blue} /><Text style={s.cloudText}>{cloudState === 'syncing' ? t('syncing') : cloudState === 'error' ? t('syncError') : session ? t('synced') : t('google')}</Text></Pressable><Pressable accessibilityRole="link" accessibilityLabel="Privacy policy" onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)} style={s.touch}><Icon name="shield" size={18} color={blue} /></Pressable></View>
    <Pressable disabled={!languageReady || dragging} accessibilityRole="button" accessibilityLabel={t('language')} onPress={() => setLanguageOpen(true)} style={s.languageButton}><Icon name="globe" size={18} color={blue} /><Text style={s.languageText}>{t('language')} · {currentLanguage.name}</Text><Icon name="chevron-down" size={16} color={blue} /></Pressable>
    <Pressable accessibilityRole="link" accessibilityLabel={t('windowsWidgetLink')} onPress={() => void Linking.openURL(WINDOWS_WIDGET_URL)} style={s.companionLink}>
      <Icon name="monitor" size={18} color={blue} /><View style={s.companionLinkCopy}><Text style={s.companionLinkTitle}>{t('windowsWidgetLink')}</Text><Text style={s.companionLinkBody}>{t('windowsWidgetLinkBody')}</Text></View><Icon name="external-link" size={16} color={blue} />
    </Pressable>
    <View style={s.heading}><View style={s.titleRow}><Text accessibilityRole="header" style={s.headingText}>{tab === 'Today' ? todayText.title : t(tab === 'Tasks' ? 'tasks' : 'done')}</Text><View style={s.count}><Text style={s.countText}>{tab === 'Tasks' ? active.length : tab === 'Today' ? todayTasks.length : done.length}</Text></View></View><Text style={s.subtitle}>{tab === 'Tasks' ? t('subtitleTasks') : tab === 'Today' ? todayText.subtitle : t('subtitleDone')}</Text></View>
    {!loaded ? <View style={s.empty}>{loadError ? <><Icon name="cloud-off" size={36} /><Text style={s.emptyTitle}>{t('loadError')}</Text><Text style={s.emptyBody}>{t('loadSafe')}</Text><Pressable style={s.touch} onPress={() => setRetry(n => n + 1)}><Text style={{ color: blue }}>{t('retry')}</Text></Pressable></> : <ActivityIndicator color={blue} accessibilityLabel={t('loading')} />}</View> : <>
      {saveError && <Pressable onPress={() => setTasks(current => [...current])} style={s.error}><Text style={s.errorText}>{t('saveError')}</Text></Pressable>}
      {cloudError ? <Pressable onPress={() => void syncCloud()} style={s.error}><Text style={s.errorText}>Cloud sync needs setup. Tap to retry.</Text></Pressable> : null}
      <View style={s.section}><Text style={s.sectionLabel}>{tab === 'Tasks' ? t('sectionTasks') : tab === 'Today' ? todayText.title.toUpperCase() : t('sectionDone')}</Text>{tab === 'Tasks' && active.length > 0 && <View style={s.hint}><Icon name="move" size={12} /><Text style={s.hintText}>{t('hint')}</Text></View>}</View>
      {tab === 'Tasks' ? <DraggableFlatList data={active} keyExtractor={t => t.id} renderItem={renderTask} containerStyle={s.list} contentContainerStyle={[s.listContent, active.length === 0 && s.emptyList]} onDragBegin={() => setDragging(true)} onDragEnd={({ data }) => { setTasks(current => reorderTasks(current, data.map(t => t.id))); setDragging(false); }} activationDistance={5} showsVerticalScrollIndicator={false} ListEmptyComponent={empty(false)} ListFooterComponent={active.length ? <View style={s.footerNote}><View style={s.smallLine} /><Text style={s.note}>{t('note')}</Text></View> : null} /> : tab === 'Today' ? <FlatList style={s.list} contentContainerStyle={[s.listContent, !todayTasks.length && s.emptyList]} data={todayTasks} keyExtractor={t => t.id} showsVerticalScrollIndicator={false} renderItem={renderTodayTask} ListEmptyComponent={<View style={s.empty}><View style={s.emptyIcon}><Icon name="calendar" size={32} color={blue} /></View><Text style={s.emptyTitle}>{todayText.empty}</Text></View>} /> : <FlatList style={s.list} contentContainerStyle={[s.listContent, !done.length && s.emptyList]} data={done} keyExtractor={t => t.id} showsVerticalScrollIndicator={false} renderItem={({ item }) => <View style={s.card}><View style={s.doneCheck}><Icon name="check" size={19} color={blue} /></View><View style={s.taskText}><Text style={s.doneTitle}>{item.title}</Text><Text style={s.completedDate}>{t('completed', { date: new Date(item.completedAt!).toLocaleDateString(currentLanguage.locale, { month: 'short', day: 'numeric' }) })}</Text></View><Pressable style={s.touch} accessibilityRole="button" accessibilityLabel={`Edit ${item.title}`} onPress={() => openEdit(item)}><Icon name="edit-2" size={18} color={blue} /></Pressable><Pressable style={s.touch} accessibilityRole="button" accessibilityLabel={t('restore', { title: item.title })} onPress={() => setTasks(current => restoreTask(current, item.id))}><Icon name="rotate-ccw" size={19} /></Pressable></View>} ListEmptyComponent={empty(true)} />}
      {tab === 'Tasks' && <View pointerEvents="box-none" style={s.fabWrap}><Pressable disabled={dragging} accessibilityRole="button" onPress={() => setSheet(true)} style={({ pressed }) => [s.fab, pressed && { opacity: 0.85 }]}><Icon name="plus" color="white" size={23} /><Text style={s.fabText}>{t('add')}</Text></Pressable></View>}
    </>}
    <View style={s.nav}>{(['Tasks', 'Today', 'Done'] as const).map(name => <Pressable key={name} disabled={dragging} accessibilityRole="tab" accessibilityState={{ selected: tab === name }} onPress={() => setTab(name)} style={s.navItem}><View style={[s.navIcon, tab === name && s.navSelected]}><Icon name={name === 'Tasks' ? 'list' : name === 'Today' ? 'calendar' : 'check-circle'} size={21} color={tab === name ? blue : '#929BAB'} /></View><Text style={[s.navText, tab === name && { color: blue }]}>{name === 'Today' ? todayText.title : t(name === 'Tasks' ? 'tasks' : 'done')}</Text></Pressable>)}</View>
    {celebration ? <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={[s.celebration, { transform: [{ scale: celebrationScale }] }]}><Text style={s.celebrationEmoji}>🎉</Text><View><Text style={s.celebrationTitle}>Nice work!</Text><Text numberOfLines={1} style={s.celebrationBody}>{celebration} completed</Text></View></Animated.View> : null}
    </View><Modal visible={languageOpen} transparent animationType="slide" onRequestClose={() => setLanguageOpen(false)}>
      <View style={s.modal}><Pressable accessibilityRole="button" accessibilityLabel={t('closeLanguage')} style={StyleSheet.absoluteFill} onPress={() => setLanguageOpen(false)} />
        <SafeAreaView edges={['bottom']} style={[s.sheet, { maxHeight: '85%' }]}>
          <View style={s.sheetGrip} /><View style={s.sheetHeader}><Text accessibilityRole="header" style={s.sheetTitle}>{t('language')}</Text><Pressable accessibilityRole="button" style={s.touch} onPress={() => setLanguageOpen(false)} accessibilityLabel={t('closeLanguage')}><Icon name="x" /></Pressable></View>
          <ScrollView>{languages.map(option => <Pressable key={option.code} accessibilityRole="radio" accessibilityState={{ checked: language === option.code, disabled: languageSaving }} disabled={languageSaving} onPress={() => void selectLanguage(option.code)} style={[s.languageOption, language === option.code && { backgroundColor: '#ECF2FF' }]}><Text style={[s.languageText, { writingDirection: option.rtl ? 'rtl' : 'ltr' }]}>{option.name}</Text>{language === option.code && <Icon name="check" color={blue} size={20} />}</Pressable>)}</ScrollView>
        </SafeAreaView>
      </View>
    </Modal><Modal visible={sheet} transparent animationType="slide" onRequestClose={close} onShow={() => input.current?.focus()}><KeyboardAvoidingView style={s.modal} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><Pressable accessibilityLabel={t('closeAdd')} style={StyleSheet.absoluteFill} onPress={close} /><SafeAreaView edges={['bottom']} style={s.sheet}><View style={s.sheetGrip} /><View style={s.sheetHeader}><Text style={s.sheetTitle}>{editingTask ? 'Edit task' : t('sheetTitle')}</Text><Pressable style={s.touch} onPress={close} accessibilityLabel={t('cancel')}><Icon name="x" /></Pressable></View><Text style={s.sheetSubtitle}>{editingTask ? 'Update the task, choose Today, or delete it when it’s no longer needed.' : t('sheetSubtitle')}</Text><TextInput ref={input} value={title} onChangeText={setTitle} placeholder={t('placeholder')} placeholderTextColor="#9BA5B4" style={s.input} maxLength={240} returnKeyType="done" onSubmitEditing={submit} accessibilityLabel={t('taskTitle')} /><Text style={s.sheetNote}>{editingTask ? 'Changing the title keeps the task in its current position.' : t('sheetNote')}</Text><Pressable accessibilityRole="button" disabled={!title.trim()} onPress={submit} style={[s.submit, !title.trim() && { opacity: 0.4 }]}><Icon name={editingTask ? 'check' : 'plus'} color="white" size={20} /><Text style={s.fabText}>{editingTask ? 'Save changes' : t('add')}</Text></Pressable>{editingTask ? <Pressable accessibilityRole="button" onPress={() => { const isToday = editingTask.todayOn === today; setTasks(current => setTaskToday(current, editingTask.id, isToday ? null : today)); setEditingTask(current => current ? { ...current, todayOn: isToday ? null : today } : current); }} style={s.todayButton}><Icon name="calendar" color={blue} size={19} /><Text style={s.todayText}>{editingTask.todayOn === today ? todayText.remove : todayText.add}</Text></Pressable> : null}{editingTask ? <Pressable accessibilityRole="button" onPress={() => confirmDelete(editingTask)} style={s.deleteButton}><Icon name="trash-2" color="#C44C3F" size={19} /><Text style={s.deleteText}>Delete task</Text></Pressable> : null}</SafeAreaView></KeyboardAvoidingView></Modal>
  </SafeAreaView></SafeAreaProvider></GestureHandlerRootView>;
}
