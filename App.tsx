import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking, Modal, ScrollView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { addTask, completeTask, parseTasks, reorderTasks, restoreTask, STORAGE_KEY, Task } from './src/tasks';
import { s as baseStyles, blue } from './src/styles';
import { CloudState, signInWithGoogle, startCloudSession, syncTasks } from './src/cloud';
import type { Session } from '@supabase/supabase-js';

import { languages, isLanguage, LANGUAGE_KEY, translate, type Language, type TranslationKey } from './src/i18n';
import { localizedStyles } from './src/localizedStyles';

type IconName = React.ComponentProps<typeof Feather>['name'];
const Icon = ({ name, size = 22, color = '#8390A6' }: { name: IconName; size?: number; color?: string }) => <Feather name={name} size={size} color={color} />;
const PRIVACY_POLICY_URL = 'https://ehsanmet123.github.io/TaskRank/';

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
  const [tab, setTab] = useState<'Tasks' | 'Done'>('Tasks');
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [title, setTitle] = useState('');
  const [dragging, setDragging] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [cloudState, setCloudState] = useState<CloudState>('offline');
  const [cloudError, setCloudError] = useState('');
  const queue = useRef(Promise.resolve());
  const revision = useRef(0);
  const input = useRef<TextInput>(null);
  const cloudBusy = useRef(false);
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
  const active = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done).sort((a, b) => b.completedAt!.localeCompare(a.completedAt!));
  const close = () => { setSheet(false); setTitle(''); };
  const submit = () => {
    if (!title.trim()) return;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    setTasks(current => addTask(current, title, id, new Date().toISOString()));
    close();
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
      Alert.alert(t('googleError'), t('tryAgain'));
    }
  };
  const renderTask = ({ item, drag, isActive, getIndex }: RenderItemParams<Task>) => {
    const rank = (getIndex() ?? active.findIndex(t => t.id === item.id)) + 1;
    return <ScaleDecorator activeScale={1.025}><Pressable onLongPress={drag} delayLongPress={250} disabled={isActive}
      style={[s.card, rank === 1 && s.firstCard, isActive && s.dragCard]} accessibilityLabel={t('rank', { rank, title: item.title })} accessibilityHint={t('drag')}
      accessibilityActions={[{ name: 'increment', label: t('down') }, { name: 'decrement', label: t('up') }]}
      onAccessibilityAction={e => move(item.id, e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
      <Text style={[s.rank, rank === 1 && { color: blue }]}>{rank}</Text>
      <View style={s.taskText}>{rank === 1 && <Text style={s.nextLabel}>{t('upNext')}</Text>}<Text style={s.taskTitle}>{item.title}</Text></View>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: false }} accessibilityLabel={t('complete', { title: item.title })} disabled={dragging} onPress={() => setTasks(current => completeTask(current, item.id, new Date().toISOString()))} style={s.touch}><View style={s.checkbox} /></Pressable>
      <Pressable onLongPress={drag} delayLongPress={200} accessibilityLabel={t('reorder', { title: item.title })} accessibilityHint={t('dragTouch')} style={s.handle}><Icon name="menu" size={20} color="#ADB6C5" /></Pressable>
    </Pressable></ScaleDecorator>;
  };
  const empty = (completed: boolean) => <View style={s.empty}><View style={s.emptyIcon}><Icon name={completed ? 'check' : 'list'} size={32} color={blue} /></View><Text style={s.emptyTitle}>{completed ? t('emptyDone') : done.length ? t('emptyClear') : t('emptyNew')}</Text><Text style={s.emptyBody}>{completed ? t('bodyDone') : done.length ? t('bodyClear') : t('bodyNew')}</Text></View>;

  return <GestureHandlerRootView style={s.root}><SafeAreaProvider><StatusBar style="dark" /><SafeAreaView style={s.safe}><View style={s.app}>
    <View style={s.brand}><View style={s.logo}><Icon name="bar-chart-2" color="white" size={19} /></View><Text style={s.brandText}>taskrank<Text style={{ color: blue }}>.</Text></Text><Pressable accessibilityRole="button" accessibilityLabel={session ? t('syncLabel') : t('connectLabel')} onPress={session ? () => void syncCloud() : () => void connectGoogle()} style={s.cloudButton}><Icon name={session ? 'cloud' : 'log-in'} size={14} color={blue} /><Text style={s.cloudText}>{cloudState === 'syncing' ? t('syncing') : cloudState === 'error' ? t('syncError') : session ? t('synced') : t('google')}</Text></Pressable><Pressable accessibilityRole="link" accessibilityLabel="Privacy policy" onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)} style={s.touch}><Icon name="shield" size={18} color={blue} /></Pressable></View>
    <Pressable disabled={!languageReady || dragging} accessibilityRole="button" accessibilityLabel={t('language')} onPress={() => setLanguageOpen(true)} style={s.languageButton}><Icon name="globe" size={18} color={blue} /><Text style={s.languageText}>{t('language')} · {currentLanguage.name}</Text><Icon name="chevron-down" size={16} color={blue} /></Pressable>
    <View style={s.heading}><View style={s.titleRow}><Text accessibilityRole="header" style={s.headingText}>{t(tab === 'Tasks' ? 'tasks' : 'done')}</Text><View style={s.count}><Text style={s.countText}>{tab === 'Tasks' ? active.length : done.length}</Text></View></View><Text style={s.subtitle}>{tab === 'Tasks' ? t('subtitleTasks') : t('subtitleDone')}</Text></View>
    {!loaded ? <View style={s.empty}>{loadError ? <><Icon name="cloud-off" size={36} /><Text style={s.emptyTitle}>{t('loadError')}</Text><Text style={s.emptyBody}>{t('loadSafe')}</Text><Pressable style={s.touch} onPress={() => setRetry(n => n + 1)}><Text style={{ color: blue }}>{t('retry')}</Text></Pressable></> : <ActivityIndicator color={blue} accessibilityLabel={t('loading')} />}</View> : <>
      {saveError && <Pressable onPress={() => setTasks(current => [...current])} style={s.error}><Text style={s.errorText}>{t('saveError')}</Text></Pressable>}
      {cloudError ? <Pressable onPress={() => void syncCloud()} style={s.error}><Text style={s.errorText}>Cloud sync needs setup. Tap to retry.</Text></Pressable> : null}
      <View style={s.section}><Text style={s.sectionLabel}>{tab === 'Tasks' ? t('sectionTasks') : t('sectionDone')}</Text>{tab === 'Tasks' && active.length > 0 && <View style={s.hint}><Icon name="move" size={12} /><Text style={s.hintText}>{t('hint')}</Text></View>}</View>
      {tab === 'Tasks' ? <DraggableFlatList data={active} keyExtractor={t => t.id} renderItem={renderTask} containerStyle={s.list} contentContainerStyle={[s.listContent, active.length === 0 && s.emptyList]} onDragBegin={() => setDragging(true)} onDragEnd={({ data }) => { setTasks(current => reorderTasks(current, data.map(t => t.id))); setDragging(false); }} activationDistance={5} showsVerticalScrollIndicator={false} ListEmptyComponent={empty(false)} ListFooterComponent={active.length ? <View style={s.footerNote}><View style={s.smallLine} /><Text style={s.note}>{t('note')}</Text></View> : null} /> : <FlatList style={s.list} contentContainerStyle={[s.listContent, !done.length && s.emptyList]} data={done} keyExtractor={t => t.id} showsVerticalScrollIndicator={false} renderItem={({ item }) => <View style={s.card}><View style={s.doneCheck}><Icon name="check" size={19} color={blue} /></View><View style={s.taskText}><Text style={s.doneTitle}>{item.title}</Text><Text style={s.completedDate}>{t('completed', { date: new Date(item.completedAt!).toLocaleDateString(currentLanguage.locale, { month: 'short', day: 'numeric' }) })}</Text></View><Pressable style={s.touch} accessibilityRole="button" accessibilityLabel={t('restore', { title: item.title })} onPress={() => setTasks(current => restoreTask(current, item.id))}><Icon name="rotate-ccw" size={19} /></Pressable></View>} ListEmptyComponent={empty(true)} />}
      {tab === 'Tasks' && <View pointerEvents="box-none" style={s.fabWrap}><Pressable disabled={dragging} accessibilityRole="button" onPress={() => setSheet(true)} style={({ pressed }) => [s.fab, pressed && { opacity: 0.85 }]}><Icon name="plus" color="white" size={23} /><Text style={s.fabText}>{t('add')}</Text></Pressable></View>}
    </>}
    <View style={s.nav}>{(['Tasks', 'Done'] as const).map(name => <Pressable key={name} disabled={dragging} accessibilityRole="tab" accessibilityState={{ selected: tab === name }} onPress={() => setTab(name)} style={s.navItem}><View style={[s.navIcon, tab === name && s.navSelected]}><Icon name={name === 'Tasks' ? 'list' : 'check-circle'} size={21} color={tab === name ? blue : '#929BAB'} /></View><Text style={[s.navText, tab === name && { color: blue }]}>{t(name === 'Tasks' ? 'tasks' : 'done')}</Text></Pressable>)}</View>
    </View><Modal visible={languageOpen} transparent animationType="slide" onRequestClose={() => setLanguageOpen(false)}>
      <View style={s.modal}><Pressable accessibilityRole="button" accessibilityLabel={t('closeLanguage')} style={StyleSheet.absoluteFill} onPress={() => setLanguageOpen(false)} />
        <SafeAreaView edges={['bottom']} style={[s.sheet, { maxHeight: '85%' }]}>
          <View style={s.sheetGrip} /><View style={s.sheetHeader}><Text accessibilityRole="header" style={s.sheetTitle}>{t('language')}</Text><Pressable accessibilityRole="button" style={s.touch} onPress={() => setLanguageOpen(false)} accessibilityLabel={t('closeLanguage')}><Icon name="x" /></Pressable></View>
          <ScrollView>{languages.map(option => <Pressable key={option.code} accessibilityRole="radio" accessibilityState={{ checked: language === option.code, disabled: languageSaving }} disabled={languageSaving} onPress={() => void selectLanguage(option.code)} style={[s.languageOption, language === option.code && { backgroundColor: '#ECF2FF' }]}><Text style={[s.languageText, { writingDirection: option.rtl ? 'rtl' : 'ltr' }]}>{option.name}</Text>{language === option.code && <Icon name="check" color={blue} size={20} />}</Pressable>)}</ScrollView>
        </SafeAreaView>
      </View>
    </Modal><Modal visible={sheet} transparent animationType="slide" onRequestClose={close} onShow={() => input.current?.focus()}><KeyboardAvoidingView style={s.modal} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><Pressable accessibilityLabel={t('closeAdd')} style={StyleSheet.absoluteFill} onPress={close} /><SafeAreaView edges={['bottom']} style={s.sheet}><View style={s.sheetGrip} /><View style={s.sheetHeader}><Text style={s.sheetTitle}>{t('sheetTitle')}</Text><Pressable style={s.touch} onPress={close} accessibilityLabel={t('cancel')}><Icon name="x" /></Pressable></View><Text style={s.sheetSubtitle}>{t('sheetSubtitle')}</Text><TextInput ref={input} value={title} onChangeText={setTitle} placeholder={t('placeholder')} placeholderTextColor="#9BA5B4" style={s.input} maxLength={240} returnKeyType="done" onSubmitEditing={submit} accessibilityLabel={t('taskTitle')} /><Text style={s.sheetNote}>{t('sheetNote')}</Text><Pressable accessibilityRole="button" disabled={!title.trim()} onPress={submit} style={[s.submit, !title.trim() && { opacity: 0.4 }]}><Icon name="plus" color="white" size={20} /><Text style={s.fabText}>{t('add')}</Text></Pressable></SafeAreaView></KeyboardAvoidingView></Modal>
  </SafeAreaView></SafeAreaProvider></GestureHandlerRootView>;
}
