import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, View, Text, StyleSheet, Pressable, StatusBar, TextInput, ScrollView, ActivityIndicator, Alert } from 'react-native';
import DeusEye3D from './src/components/DeusEye3D';
import { colors } from './src/theme/colors';
import { eyeModeColor, eyeModeLabel, type EyeMode } from './src/lib/eyeState';
import { supabase } from './src/lib/supabase';

const modes: EyeMode[] = ['idle', 'thinking', 'speaking', 'action'];

export default function App() {
  const [mode, setMode] = useState<EyeMode>('idle');
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const statusColor = useMemo(() => eyeModeColor[mode], [mode]);

  async function loadAccount(user: { id: string; email?: string }) {
    if (!supabase) return;
    setUserId(user.id);
    setUserEmail(user.email ?? null);
    const { data, error } = await supabase.from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    setWorkspaceId(data?.workspace_id ?? null);
    setConversationId(null);
  }

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      if (!supabase) return;
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.user || !active) return;
      try { await loadAccount(data.session.user); } catch (e) { console.warn('Could not load D.E.U.S. workspace', e); }
    }
    void restoreSession();
    const { data: listener } = supabase?.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (!session?.user) {
        setUserEmail(null); setUserId(null); setWorkspaceId(null); setConversationId(null);
      }
    }) ?? { data: { subscription: { unsubscribe: () => undefined } } };
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  async function signInOrUp(create: boolean) {
    if (!supabase) { Alert.alert('Supabase not configured', 'Add the EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY values to the local environment.'); return; }
    if (!email.trim() || password.length < 8) { Alert.alert('Check your details', 'Enter a valid email and a password with at least 8 characters.'); return; }
    setBusy(true);
    try {
      const result = create
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (result.data.session?.user) {
        await loadAccount(result.data.session.user);
        setAuthOpen(false);
        Alert.alert(create ? 'Account created' : 'Welcome back', create ? 'Your D.E.U.S. account is ready.' : 'You are signed in.');
      } else {
        Alert.alert('Confirm your email', 'Supabase created the account. Open the confirmation email, then sign in here.');
      }
    } catch (e: any) { Alert.alert('Authentication error', e?.message ?? 'Unable to authenticate.'); }
    finally { setBusy(false); }
  }

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Sign-out error', error.message);
    else { setUserEmail(null); setUserId(null); setWorkspaceId(null); setConversationId(null); }
  }

  async function sendMessage() {
    const prompt = message.trim();
    if (!prompt) return;
    if (!supabase || !userId) { setReply('Sign in to your D.E.U.S. account to start a private AI conversation.'); return; }
    if (!workspaceId) { setReply('Your account is signed in, but its personal workspace is not available yet. Try signing out and back in.'); return; }
    setBusy(true); setMode('thinking');
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const session = sessionData.session;
      if (!session) throw new Error('Please sign in again.');
      let activeConversationId = conversationId;
      if (!activeConversationId) {
        const { data: conversation, error: createError } = await supabase
          .from('assistant_conversations')
          .insert({ workspace_id: workspaceId, user_id: userId, title: prompt.slice(0, 72) })
          .select('id')
          .single();
        if (createError || !conversation) throw createError ?? new Error('Could not create a conversation.');
        activeConversationId = conversation.id;
        setConversationId(activeConversationId);
      }
      const { data, error } = await supabase.functions.invoke('deus-chat', {
        body: { message: prompt, conversationId: activeConversationId },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      setReply(data?.message?.content ?? 'D.E.U.S. returned an empty response.');
      setMode('speaking');
    } catch (e: any) { setReply(e?.message ?? 'Unable to reach D.E.U.S.'); setMode('idle'); }
    finally { setBusy(false); setMessage(''); }
  }

  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="light-content" />
    <View style={s.header}>
      <View><Text style={s.brand}>D.E.U.S.</Text><Text style={s.tagline}>THE LIVING EYE</Text></View>
      <Pressable style={s.profile} onPress={() => setAuthOpen(v => !v)}><Text style={s.profileText}>{userEmail ? '●' : '＋'}</Text></Pressable>
    </View>
    {authOpen ? <View style={s.authPanel}>
      <Text style={s.panelTitle}>{userEmail ? 'CONNECTED ACCOUNT' : 'CONNECT YOUR ACCOUNT'}</Text>
      {userEmail ? <><Text style={s.muted}>{userEmail}</Text><Pressable onPress={signOut}><Text style={s.link}>SIGN OUT</Text></Pressable></> : <>
        <TextInput style={s.input} placeholder="Email address" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={s.input} placeholder="Password (8+ characters)" placeholderTextColor={colors.muted} secureTextEntry value={password} onChangeText={setPassword} />
        <View style={s.authActions}><Pressable disabled={busy} style={s.smallButton} onPress={() => signInOrUp(false)}><Text style={s.smallButtonText}>SIGN IN</Text></Pressable><Pressable disabled={busy} style={s.smallButton} onPress={() => signInOrUp(true)}><Text style={s.smallButtonText}>CREATE ACCOUNT</Text></Pressable></View>
      </>}
    </View> : null}
    <View style={s.eyeStage}>
      <DeusEye3D mode={mode} />
      <View pointerEvents="none" style={s.eyeCaption}><View style={[s.liveDot, { backgroundColor: statusColor }]} /><Text style={[s.modeText, { color: statusColor }]}>{eyeModeLabel[mode]}</Text></View>
    </View>
    <View style={s.footer}>
      <Text style={s.sectionLabel}>SYSTEM STATE</Text>
      <View style={s.modeRow}>{modes.map(m => <Pressable key={m} onPress={() => setMode(m)} style={[s.modeChip, mode === m && { borderColor: eyeModeColor[m], backgroundColor: `${eyeModeColor[m]}16` }]}><Text style={[s.modeChipText, mode === m && { color: eyeModeColor[m] }]}>{eyeModeLabel[m]}</Text></Pressable>)}</View>
      {reply ? <ScrollView style={s.replyBox}><Text style={s.replyText}>{reply}</Text></ScrollView> : <Text style={s.hint}>Touch the eye to guide its gaze.</Text>}
      <View style={s.composer}><TextInput style={s.messageInput} value={message} onChangeText={setMessage} placeholder="Talk to D.E.U.S..." placeholderTextColor={colors.muted} multiline /><Pressable disabled={busy} style={s.sendButton} onPress={sendMessage}>{busy ? <ActivityIndicator color="#041016" /> : <Text style={s.sendText}>↑</Text>}</Pressable></View>
      <Text style={s.footnote}>{userEmail ? 'ACCOUNT CONNECTED · PRIVATE WORKSPACE' : 'SUPABASE CONNECTED · SIGN IN REQUIRED'}</Text>
    </View>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { height: 68, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#102331' },
  brand: { color: colors.text, fontSize: 20, fontWeight: '700', letterSpacing: 5 }, tagline: { color: colors.muted, fontSize: 8, letterSpacing: 3, marginTop: 3 },
  profile: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.panelBorder, alignItems: 'center', justifyContent: 'center' }, profileText: { color: colors.cyan, fontSize: 18 },
  eyeStage: { flex: 1, minHeight: 250, marginHorizontal: 10, marginTop: 6, marginBottom: 8 }, eyeCaption: { position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#07121BCC', borderWidth: 1, borderColor: '#244050', borderRadius: 20, paddingHorizontal: 13, paddingVertical: 7 }, liveDot: { width: 6, height: 6, borderRadius: 3 }, modeText: { fontSize: 9, letterSpacing: 2, fontWeight: '700' },
  footer: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderTopColor: '#102331' }, sectionLabel: { color: colors.muted, fontSize: 9, letterSpacing: 2, marginBottom: 10 }, modeRow: { flexDirection: 'row', gap: 6 }, modeChip: { flex: 1, paddingVertical: 9, borderWidth: 1, borderColor: colors.panelBorder, borderRadius: 8, alignItems: 'center' }, modeChipText: { color: colors.muted, fontSize: 7, letterSpacing: 0.7, fontWeight: '700' }, hint: { color: colors.muted, fontSize: 11, textAlign: 'center', marginVertical: 13 },
  composer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.panelBorder, borderRadius: 14, paddingLeft: 14, paddingRight: 7, minHeight: 52 }, messageInput: { flex: 1, color: colors.text, fontSize: 13, maxHeight: 80, paddingVertical: 10 }, sendButton: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.cyan, alignItems: 'center', justifyContent: 'center' }, sendText: { color: '#06121A', fontSize: 22, fontWeight: '700', marginTop: -3 }, footnote: { color: '#55717F', textAlign: 'center', fontSize: 8, letterSpacing: 1.3, marginTop: 10 },
  authPanel: { margin: 14, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.panelBorder, backgroundColor: colors.panel }, panelTitle: { color: colors.cyan, fontSize: 10, letterSpacing: 2, marginBottom: 12 }, input: { color: colors.text, backgroundColor: '#050C13', borderColor: colors.panelBorder, borderWidth: 1, borderRadius: 8, padding: 11, marginBottom: 8, fontSize: 13 }, authActions: { flexDirection: 'row', gap: 8 }, smallButton: { flex: 1, borderRadius: 8, borderWidth: 1, borderColor: colors.cyan, padding: 10, alignItems: 'center' }, smallButtonText: { color: colors.cyan, fontSize: 9, letterSpacing: 1 }, muted: { color: colors.muted, fontSize: 12 }, link: { color: colors.cyan, marginTop: 12, fontSize: 10, letterSpacing: 1 }, replyBox: { maxHeight: 74, marginVertical: 8, padding: 10, backgroundColor: '#09151F', borderRadius: 8 }, replyText: { color: colors.text, fontSize: 12, lineHeight: 18 },
});

