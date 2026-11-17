import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { BrandMark } from './components/BrandMark';
import { LoginScreen } from './components/LoginScreen';
import { AccountModal } from './components/AccountModal';
import { AssistantView } from './components/AssistantView';
import { AgentsView, MemoryView } from './components/AgentsMemoryView';
import { VoicesView } from './components/VoicesView';
import { TracesView } from './components/TracesView';
import { AppBuilderView } from './components/AppBuilderView';
import { RouterManagerView } from './components/RouterManagerView';
import { ConnectedAppsManager } from './components/ConnectedAppsManager';
import { SpectatorView } from './components/SpectatorView';
import { VideoStudioView } from './components/VideoStudioView';
import { SearchWebReaderView } from './components/SearchWebReaderView';
import { AutonomousAgentView } from './components/AutonomousAgentView';
import {
  auth,
  onAuthStateChanged,
  signInWithGithub,
  signInWithGoogle,
  signOutUser,
  type User,
} from './lib/firebase';
import {
  deleteConnectedAppFromCloud,
  deleteMemoryNoteFromCloud,
  ensureUserAccountRecords,
  loadUserCloudWorkspace,
  saveUserPreferencesToCloud,
  syncConnectedAppToCloud,
  syncMemoryNoteToCloud,
  syncMessageToCloud,
  updateRequireLoginOnStart,
} from './lib/firebaseSync';
import {
  playBase64Wav,
  streamAndPlayTtsAudio,
  type StreamPlaybackHandle,
} from './utils/audioPlayer';
import {
  AGENT_PRESETS,
  VOICE_PROFILES,
  type AgentPreset,
  type AgentPresetId,
  type ChatImageAttachment,
  type ChatMessage,
  type ConnectedAppRecord,
  type EngineRouteId,
  type JarvisPreferences,
  type LaunchAction,
  type MemoryCategory,
  type MemoryNote,
  type NavTabId,
  type PublishedAppRecord,
  type RouterProfileRecord,
  type TraceRecord,
  type TtsModelId,
  type VoiceId,
} from './types/jarvis';

const DEFAULT_PREFS: JarvisPreferences = {
  activePreset: 'chat-simple',
  engineRoute: 'low-latency-edge',
  activeVoice: 'Charon',
  voiceStyle: VOICE_PROFILES[0].defaultStyle,
  ttsModel: 'gemini-3.8-flash-lite-tts',
  playbackRate: 1.0,
  autoSpeak: false,
  darkMode: true,
};

function formatTime(): string {
  return new Date().toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function estimateEnergyWh(promptTokens: number, outputTokens: number): number {
  const total = Math.max(1, promptTokens + outputTokens);
  return Number(((total / 1000) * 0.00045).toFixed(5));
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTabId>('consola');
  const [prefs, setPrefs] = useState<JarvisPreferences>(DEFAULT_PREFS);
  const [customAgents, setCustomAgents] = useState<AgentPreset[]>([]);
  const [memories, setMemories] = useState<MemoryNote[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [traces, setTraces] = useState<TraceRecord[]>([]);
  const [publishedApps, setPublishedApps] = useState<PublishedAppRecord[]>([]);
  const [connectedApps, setConnectedApps] = useState<ConnectedAppRecord[]>([]);
  const [routerProfiles, setRouterProfiles] = useState<RouterProfileRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [isSending, setIsSending] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [synthesizingMessageId, setSynthesizingMessageId] = useState<string | null>(null);
  const [previewingVoice, setPreviewingVoice] = useState<VoiceId | null>(null);
  const [synthesizingVoice, setSynthesizingVoice] = useState<VoiceId | null>(null);
  const [lastGeneratedAudio, setLastGeneratedAudio] = useState<{
    voiceId: VoiceId;
    audioBase64: string;
    latencyMs: number;
    model: string;
  } | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Firebase Account & Login Mode state
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [requireLoginOnStart, setRequireLoginOnStart] = useState<boolean>(() => {
    try {
      return localStorage.getItem('jarvis_require_login') === '1';
    } catch {
      return false;
    }
  });
  const [guestEntered, setGuestEntered] = useState<boolean>(() => {
    try {
      const reqLogin = localStorage.getItem('jarvis_require_login') === '1';
      return !reqLogin && sessionStorage.getItem('jarvis_guest_mode') === '1';
    } catch {
      return false;
    }
  });
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const cloudHydratedUidRef = useRef<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamHandleRef = useRef<StreamPlaybackHandle | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);

  // Sync darkMode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [prefs.darkMode]);

  // Initial state hydration from server persistent store
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/jarvis/state');
        if (res.ok && active) {
          const data = await res.json();
          if (Array.isArray(data.memories)) setMemories(data.memories);
          if (Array.isArray(data.customAgents)) setCustomAgents(data.customAgents);
          if (Array.isArray(data.publishedApps)) setPublishedApps(data.publishedApps);
          if (Array.isArray(data.connectedApps)) setConnectedApps(data.connectedApps);
          if (Array.isArray(data.routerProfiles)) setRouterProfiles(data.routerProfiles);
          if (Array.isArray(data.traces)) setTraces(data.traces);
          if (Array.isArray(data.messages)) {
            const cleanMsgs = (data.messages as ChatMessage[])
              .filter(
                (m) =>
                  m &&
                  ((typeof m.content === 'string' && m.content.trim().length > 0) ||
                    (Array.isArray(m.attachments) && m.attachments.length > 0))
              )
              .map((m) => ({ ...m, streaming: false }));
            setMessages(cleanMsgs);
          }
          if (data.prefs) setPrefs((p) => ({ ...p, ...data.prefs }));
        }
      } catch {
        // Fallback silently if offline
      } finally {
        if (active) setHydrated(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Debounced persistence to server
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      void fetch('/api/jarvis/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memories,
          customAgents,
          publishedApps,
          connectedApps,
          routerProfiles,
          traces: traces.slice(0, 200),
          messages: messages
            .filter(
              (m) =>
                !m.streaming &&
                (m.content.trim().length > 0 || (m.attachments && m.attachments.length > 0))
            )
            .slice(-60)
            .map((m) => ({
              ...m,
              streaming: undefined,
              audioBase64: undefined, // keep state file compact
              attachments: m.attachments?.map((att) => ({
                id: att.id,
                name: att.name,
                mimeType: att.mimeType,
                data: '',
                previewUrl: att.previewUrl,
              })),
            })),
          prefs,
        }),
      }).catch(() => {});
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    hydrated,
    memories,
    customAgents,
    publishedApps,
    connectedApps,
    routerProfiles,
    traces,
    messages,
    prefs,
  ]);

  // Listen to Firebase Auth state & sync cloud workspace for signed-in users
  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;
      setAuthUser(user);
      setAuthReady(true);

      if (!user) {
        cloudHydratedUidRef.current = null;
        setSyncStatus('idle');
        return;
      }

      if (!user.emailVerified) {
        cloudHydratedUidRef.current = null;
        setSyncStatus('idle');
        return;
      }

      setSyncStatus('syncing');
      try {
        const account = await ensureUserAccountRecords(user);
        if (!active) return;
        setRequireLoginOnStart(account.requireLoginOnStart);
        try {
          localStorage.setItem(
            'jarvis_require_login',
            account.requireLoginOnStart ? '1' : '0'
          );
        } catch {
          // ignore storage errors
        }

        const cloud = await loadUserCloudWorkspace(user.uid);
        if (!active) return;

        if (cloud.prefs) {
          setPrefs((prev) => ({ ...prev, ...cloud.prefs }));
        } else {
          await saveUserPreferencesToCloud(user.uid, prefs);
        }

        if (cloud.memories.length > 0) {
          setMemories(cloud.memories);
        } else if (memories.length > 0) {
          await Promise.all(
            memories.slice(0, 20).map((m) => syncMemoryNoteToCloud(user.uid, m))
          );
        }

        if (cloud.connectedApps.length > 0) {
          setConnectedApps(cloud.connectedApps);
        } else if (connectedApps.length > 0) {
          await Promise.all(
            connectedApps.slice(0, 30).map((c) => syncConnectedAppToCloud(user.uid, c))
          );
        }

        if (cloud.messages.length > 0) {
          setMessages(cloud.messages);
        }

        cloudHydratedUidRef.current = user.uid;
        setSyncStatus('synced');
      } catch (err) {
        if (active) {
          setSyncStatus('error');
          setAuthError(
            err instanceof Error
              ? 'No se pudo sincronizar con la nube en este momento.'
              : 'Error de sincronización.'
          );
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced cloud sync of preferences when signed in
  useEffect(() => {
    if (!authUser || cloudHydratedUidRef.current !== authUser.uid) return;
    const timer = window.setTimeout(() => {
      setSyncStatus('syncing');
      void saveUserPreferencesToCloud(authUser.uid, prefs)
        .then(() => setSyncStatus('synced'))
        .catch(() => setSyncStatus('error'));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [authUser, prefs]);

  const formatFirebaseAuthError = useCallback((err: unknown, providerLabel: string): string => {
    const code = String((err as { code?: unknown })?.code || '');
    if (code === 'auth/popup-closed-by-user') {
      return 'Cerraste la ventana de inicio de sesión antes de terminar.';
    }
    if (code === 'auth/popup-blocked') {
      return 'El navegador bloqueó la ventana emergente. Permite ventanas emergentes e inténtalo de nuevo.';
    }
    if (code === 'auth/account-exists-with-different-credential') {
      return 'Ya existe una cuenta registrada con ese correo usando otro método (como Google). Inicia sesión con ese proveedor.';
    }
    if (code === 'auth/operation-not-allowed') {
      return `El acceso con ${providerLabel} aún no está habilitado en Firebase Console para este proyecto.`;
    }
    return err instanceof Error ? err.message : `No se pudo iniciar sesión con ${providerLabel}.`;
  }, []);

  const handleSignInWithGoogle = useCallback(async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInWithGoogle();
      setIsAccountModalOpen(false);
    } catch (err: unknown) {
      setAuthError(formatFirebaseAuthError(err, 'Google'));
    } finally {
      setAuthLoading(false);
    }
  }, [formatFirebaseAuthError]);

  const handleSignInWithGithub = useCallback(async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInWithGithub();
      setIsAccountModalOpen(false);
    } catch (err: unknown) {
      setAuthError(formatFirebaseAuthError(err, 'GitHub'));
    } finally {
      setAuthLoading(false);
    }
  }, [formatFirebaseAuthError]);

  const handleContinueAsGuest = useCallback(() => {
    setAuthError(null);
    try {
      sessionStorage.setItem('jarvis_guest_mode', '1');
    } catch {
      // ignore storage errors
    }
    setGuestEntered(true);
  }, []);

  const handleSignOut = useCallback(async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signOutUser();
      cloudHydratedUidRef.current = null;
      try {
        sessionStorage.removeItem('jarvis_guest_mode');
      } catch {
        // ignore
      }
      setGuestEntered(false);
      setIsAccountModalOpen(false);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'No se pudo cerrar sesión.'
      );
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const handleToggleRequireLogin = useCallback(async () => {
    const next = !requireLoginOnStart;
    setRequireLoginOnStart(next);
    try {
      localStorage.setItem('jarvis_require_login', next ? '1' : '0');
    } catch {
      // ignore
    }
    if (authUser && authUser.emailVerified) {
      try {
        await updateRequireLoginOnStart(authUser, next);
      } catch {
        setAuthError('No se pudo actualizar la preferencia en la nube.');
      }
    }
  }, [authUser, requireLoginOnStart]);

  const allAgents = useMemo(
    () => [...AGENT_PRESETS, ...customAgents],
    [customAgents]
  );

  const activeVoiceProfile = useMemo(
    () => VOICE_PROFILES.find((v) => v.id === prefs.activeVoice) || VOICE_PROFILES[0],
    [prefs.activeVoice]
  );

  const stopAllAudio = useCallback(() => {
    if (streamHandleRef.current) {
      streamHandleRef.current.stop();
      streamHandleRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setPlayingMessageId(null);
    setSynthesizingMessageId(null);
    setPreviewingVoice(null);
    setSynthesizingVoice(null);
  }, []);

  useEffect(() => {
    return () => stopAllAudio();
  }, [stopAllAudio]);

  const appendTrace = useCallback(
    (trace: Omit<TraceRecord, 'id' | 'timestamp'>) => {
      setTraces((prev) => [
        {
          ...trace,
          id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: formatTime(),
        },
        ...prev,
      ]);
    },
    []
  );

  const speakTextDirect = useCallback(
    (text: string, voiceOverride?: VoiceId, styleOverride?: string) => {
      if (!text.trim()) return;
      stopAllAudio();
      const targetVoice = voiceOverride || prefs.activeVoice;
      const targetStyle = styleOverride ?? prefs.voiceStyle;
      setSynthesizingVoice(targetVoice);
      streamHandleRef.current = streamAndPlayTtsAudio(
        {
          text,
          voiceName: targetVoice,
          style: targetStyle,
          ttsModel: prefs.ttsModel,
        },
        prefs.playbackRate,
        {
          onFirstAudioChunk: () => {
            setSynthesizingVoice(null);
            setPreviewingVoice(targetVoice);
          },
          onComplete: (tts) => {
            setSynthesizingVoice(null);
            setLastGeneratedAudio({
              voiceId: targetVoice,
              audioBase64: tts.audioBase64,
              latencyMs: tts.latencyMs,
              model: tts.model,
            });
            appendTrace({
              operation: 'tts',
              preset: prefs.activePreset,
              model: tts.model,
              voice: targetVoice,
              latencyMs: tts.latencyMs,
              promptTokens: tts.promptTokens,
              outputTokens: tts.outputTokens,
              estimatedEnergyWh: estimateEnergyWh(tts.promptTokens, tts.outputTokens),
              toolsUsed: ['tts_stream'],
              status: 'ok',
            });
          },
          onEnded: () => {
            setPreviewingVoice(null);
            setSynthesizingVoice(null);
            streamHandleRef.current = null;
          },
          onError: (msg) => {
            setPreviewingVoice(null);
            setSynthesizingVoice(null);
            setGlobalError(msg);
          },
        }
      );
    },
    [
      appendTrace,
      prefs.activePreset,
      prefs.activeVoice,
      prefs.playbackRate,
      prefs.ttsModel,
      prefs.voiceStyle,
      stopAllAudio,
    ]
  );

  const handleSpeakMessage = useCallback(
    (msg: ChatMessage, voiceOverride?: VoiceId) => {
      stopAllAudio();
      const targetVoice = voiceOverride || prefs.activeVoice;
      if (msg.audioBase64 && msg.voiceUsed === targetVoice) {
        setPlayingMessageId(msg.id);
        audioRef.current = playBase64Wav(
          msg.audioBase64,
          prefs.playbackRate,
          () => setPlayingMessageId(null),
          (err) => setGlobalError(err)
        );
        return;
      }

      setSynthesizingMessageId(msg.id);
      streamHandleRef.current = streamAndPlayTtsAudio(
        {
          text: msg.content,
          voiceName: targetVoice,
          style: prefs.voiceStyle,
          ttsModel: prefs.ttsModel,
        },
        prefs.playbackRate,
        {
          onFirstAudioChunk: () => {
            setSynthesizingMessageId(null);
            setPlayingMessageId(msg.id);
          },
          onComplete: (tts) => {
            setSynthesizingMessageId(null);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msg.id
                  ? { ...m, audioBase64: tts.audioBase64, voiceUsed: targetVoice }
                  : m
              )
            );
            appendTrace({
              operation: 'tts',
              preset: msg.preset,
              model: tts.model,
              voice: targetVoice,
              latencyMs: tts.latencyMs,
              promptTokens: tts.promptTokens,
              outputTokens: tts.outputTokens,
              estimatedEnergyWh: estimateEnergyWh(tts.promptTokens, tts.outputTokens),
              toolsUsed: ['tts_stream'],
              status: 'ok',
            });
          },
          onEnded: () => {
            setPlayingMessageId(null);
            setSynthesizingMessageId(null);
            streamHandleRef.current = null;
          },
          onError: (errMsg) => {
            setSynthesizingMessageId(null);
            setPlayingMessageId(null);
            setGlobalError(errMsg);
          },
        }
      );
    },
    [
      appendTrace,
      prefs.activeVoice,
      prefs.playbackRate,
      prefs.ttsModel,
      prefs.voiceStyle,
      stopAllAudio,
    ]
  );

  const handlePreviewVoice = useCallback(
    (voiceId: VoiceId, customText?: string, overrideStyle?: string) => {
      if (previewingVoice === voiceId && !customText) {
        stopAllAudio();
        return;
      }
      const profile =
        VOICE_PROFILES.find((v) => v.id === voiceId) || VOICE_PROFILES[0];
      const textToSpeak = customText?.trim() || profile.samplePhrase;
      const styleToUse =
        overrideStyle !== undefined
          ? overrideStyle
          : voiceId === prefs.activeVoice
            ? prefs.voiceStyle
            : profile.defaultStyle;
      speakTextDirect(textToSpeak, voiceId, styleToUse);
    },
    [prefs.activeVoice, prefs.voiceStyle, previewingVoice, speakTextDirect, stopAllAudio]
  );

  const triggerLaunchAction = useCallback((act: LaunchAction): boolean => {
    const uri = act.launchUri;
    if (!uri) return false;
    const isHttp = /^https?:\/\//i.test(uri);
    try {
      const link = document.createElement('a');
      link.href = uri;
      link.target = isHttp ? '_blank' : '_self';
      link.rel = 'noopener noreferrer';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      window.setTimeout(() => link.remove(), 300);
      return true;
    } catch {
      return false;
    }
  }, []);

  const handleSendMessage = async (
    text: string,
    options?: {
      isRetry?: boolean;
      attachments?: ChatImageAttachment[];
      forceSpeak?: boolean;
    }
  ) => {
    setGlobalError(null);
    const isRetry = Boolean(options?.isRetry);
    const attachments = options?.attachments || [];
    const forceSpeak = Boolean(options?.forceSpeak);
    const presetConfig =
      allAgents.find((p) => p.id === prefs.activePreset) || allAgents[0];
    const historyForReq = isRetry ? messages.slice(0, -1) : messages;

    const streamingId = `msg-a-${Date.now()}`;
    const streamingPlaceholder: ChatMessage = {
      id: streamingId,
      role: 'assistant',
      content: '',
      timestamp: formatTime(),
      preset: presetConfig.id,
      agentLabel: presetConfig.label,
      streaming: true,
    };

    if (!isRetry) {
      const userMsg: ChatMessage = {
        id: `msg-u-${Date.now()}`,
        role: 'user',
        content: text.trim(),
        attachments: attachments.length > 0 ? attachments : undefined,
        timestamp: formatTime(),
        preset: prefs.activePreset,
      };
      setMessages((prev) => [...prev, userMsg, streamingPlaceholder]);
      if (authUser && cloudHydratedUidRef.current === authUser.uid) {
        void syncMessageToCloud(authUser.uid, userMsg).catch(() => {});
      }
    } else {
      setMessages((prev) => [...prev.slice(0, -1), streamingPlaceholder]);
    }

    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;
    let streamedText = '';

    setIsSending(true);
    try {
      const res = await fetch('/api/jarvis/chat-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: text.trim(),
          attachments: attachments.map((att) => ({
            name: att.name,
            mimeType: att.mimeType,
            data: att.data || (att.previewUrl?.split('base64,')[1] ?? ''),
          })),
          history: historyForReq.map((m) => ({
            role: m.role,
            content:
              m.content ||
              (m.attachments && m.attachments.length > 0 ? '[Foto adjunta]' : ''),
          })),
          preset: presetConfig.id,
          systemPrompt: presetConfig.systemPrompt,
          thinkingLevel: presetConfig.thinkingLevel,
          usesSearch: presetConfig.usesSearch,
          memories,
          publishedApps: publishedApps.map((a) => ({
            slug: a.slug,
            title: a.title,
            summary: a.summary,
            status: a.status,
          })),
          connectedApps: connectedApps.map((c) => ({
            id: c.id,
            name: c.name,
            appType: c.appType,
            platform: c.platform,
            launchUri: c.launchUri,
            packageOrExecutable: c.packageOrExecutable,
            baseUrl: c.baseUrl,
            healthPath: c.healthPath,
            defaultMethod: c.defaultMethod,
            description: c.description,
            status: c.status,
            lastCheckStatus: c.lastCheckStatus,
          })),
          routerProfiles,
          activeVoice: prefs.activeVoice,
          engineRoute: prefs.engineRoute,
        }),
      });

      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'No se pudo obtener respuesta.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalPayload: Record<string, any> | null = null;

      const processSseBlock = (block: string) => {
        const line = block.split('\n').find((l) => l.startsWith('data: '));
        if (!line) return;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) return;
        let evt: Record<string, any>;
        try {
          evt = JSON.parse(jsonStr) as Record<string, any>;
        } catch {
          return;
        }
        if (evt.error) {
          throw new Error(String(evt.error));
        }
        if (typeof evt.delta === 'string' && evt.delta.length > 0) {
          streamedText += evt.delta;
          const currentText = streamedText;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingId ? { ...m, content: currentText } : m
            )
          );
        }
        if (evt.done) {
          finalPayload = evt;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          processSseBlock(block);
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) {
        for (const block of buffer.split('\n\n')) {
          processSseBlock(block);
        }
      }

      const data: Record<string, any> =
        (finalPayload as Record<string, any> | null) ?? {
          reply: streamedText || 'Listo.',
        };

      // Apply tool side-effects
      if (Array.isArray(data.addedMemories) && data.addedMemories.length > 0) {
        const newNotes: MemoryNote[] = data.addedMemories.map(
          (m: { category: string; content: string }, i: number) => ({
            id: `mem-${Date.now()}-${i}`,
            category: (['preferencia', 'proyecto', 'persona', 'contexto'].includes(
              m.category
            )
              ? m.category
              : 'contexto') as MemoryCategory,
            content: m.content,
            createdAt: formatTime(),
          })
        );
        setMemories((prev) => [...newNotes, ...prev]);
        if (authUser && cloudHydratedUidRef.current === authUser.uid) {
          for (const note of newNotes) {
            void syncMemoryNoteToCloud(authUser.uid, note).catch(() => {});
          }
        }
      }

      if (data.nextVoice) {
        setPrefs((p) => ({
          ...p,
          activeVoice: data.nextVoice as VoiceId,
          ...(data.nextVoiceStyle ? { voiceStyle: data.nextVoiceStyle } : {}),
        }));
      }

      if (data.nextPreset) {
        const matched = allAgents.find((a) => a.id === data.nextPreset);
        if (matched) {
          setPrefs((p) => ({ ...p, activePreset: matched.id }));
        }
      }

      if (Array.isArray(data.appStatusUpdates) && data.appStatusUpdates.length > 0) {
        for (const upd of data.appStatusUpdates) {
          if (upd.kind === 'published') {
            setPublishedApps((prev) =>
              prev.map((a) =>
                a.id === upd.identifier || a.slug === upd.identifier
                  ? { ...a, status: upd.status }
                  : a
              )
            );
          } else {
            setConnectedApps((prev) =>
              prev.map((c) =>
                c.id === upd.identifier ||
                c.name.toLowerCase() === String(upd.identifier).toLowerCase()
                  ? { ...c, status: upd.status }
                  : c
              )
            );
          }
        }
      }

      const rawLaunchActions: LaunchAction[] | undefined = Array.isArray(data.launchActions)
        ? (data.launchActions as LaunchAction[]).map((act) => {
            const shouldAutoClick = act.autoClick !== false;
            const clicked = shouldAutoClick ? triggerLaunchAction(act) : false;
            return {
              ...act,
              autoClicked: clicked,
            };
          })
        : undefined;

      const assistantMsg: ChatMessage = {
        id: streamingId,
        role: 'assistant',
        content: String(data.reply || streamedText || 'Listo.'),
        timestamp: formatTime(),
        preset: presetConfig.id,
        agentLabel: presetConfig.label,
        modelUsed: data.modelUsed,
        latencyMs: data.latencyMs,
        promptTokens: data.promptTokens,
        outputTokens: data.outputTokens,
        toolsUsed: data.toolsUsed,
        sources: data.sources,
        launchActions: rawLaunchActions,
        streaming: false,
      };

      setMessages((prev) =>
        prev.map((m) => (m.id === streamingId ? assistantMsg : m))
      );

      if (authUser && cloudHydratedUidRef.current === authUser.uid) {
        void syncMessageToCloud(authUser.uid, assistantMsg).catch(() => {});
      }

      appendTrace({
        operation: 'chat',
        preset: presetConfig.label,
        model: data.modelUsed || 'gemini-3.1-flash-lite',
        latencyMs: data.latencyMs || 0,
        promptTokens: data.promptTokens || 0,
        outputTokens: data.outputTokens || 0,
        estimatedEnergyWh: estimateEnergyWh(
          data.promptTokens || 0,
          data.outputTokens || 0
        ),
        toolsUsed: data.toolsUsed || [],
        status: 'ok',
      });

      if (prefs.autoSpeak || forceSpeak) {
        handleSpeakMessage(assistantMsg, data.nextVoice as VoiceId | undefined);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setMessages((prev) =>
          streamedText.trim()
            ? prev.map((m) =>
                m.id === streamingId ? { ...m, content: streamedText, streaming: false } : m
              )
            : prev.filter((m) => m.id !== streamingId)
        );
      } else {
        const msgText =
          err instanceof Error ? err.message : 'Error al comunicar con Jarvis.';
        const errMsg: ChatMessage = {
          id: streamingId,
          role: 'assistant',
          content: msgText,
          timestamp: formatTime(),
          preset: presetConfig.id,
          agentLabel: presetConfig.label,
          streaming: false,
          error: true,
        };
        setMessages((prev) =>
          prev.map((m) => (m.id === streamingId ? errMsg : m))
        );
        appendTrace({
          operation: 'chat',
          preset: presetConfig.label,
          model: 'gemini-3.1-flash-lite',
          latencyMs: 0,
          promptTokens: 0,
          outputTokens: 0,
          estimatedEnergyWh: 0,
          toolsUsed: [],
          status: 'error',
          detail: msgText,
        });
      }
    } finally {
      if (chatAbortRef.current === controller) {
        chatAbortRef.current = null;
      }
      setIsSending(false);
    }
  };

  const handleStopChat = useCallback(() => {
    chatAbortRef.current?.abort();
  }, []);

  const handleRetryLast = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      void handleSendMessage(lastUser.content, {
        isRetry: true,
        attachments: lastUser.attachments,
      });
    }
  };

  if (!authReady) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <BrandMark size={52} active />
          <div className="mono-label">iniciando sesión</div>
        </div>
      </div>
    );
  }

  if (!authUser && (!guestEntered || requireLoginOnStart)) {
    return (
      <LoginScreen
        isLoading={authLoading}
        error={authError}
        allowGuestMode={!requireLoginOnStart}
        onSignInWithGoogle={() => void handleSignInWithGoogle()}
        onSignInWithGithub={() => void handleSignInWithGithub()}
        onContinueAsGuest={handleContinueAsGuest}
      />
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground lg:flex-row">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        activeVoiceProfile={activeVoiceProfile}
        isPreviewingVoice={previewingVoice === prefs.activeVoice}
        onQuickPreviewVoice={() => handlePreviewVoice(prefs.activeVoice)}
        engineRoute={prefs.engineRoute}
        darkMode={prefs.darkMode}
        onToggleDarkMode={() => setPrefs((p) => ({ ...p, darkMode: !p.darkMode }))}
        memoryCount={memories.length}
        connectedAppsCount={connectedApps.length}
        publishedAppsCount={publishedApps.length}
        routerCount={routerProfiles.length}
        tracesCount={traces.length}
        user={authUser}
        onOpenAccount={() => {
          setAuthError(null);
          setIsAccountModalOpen(true);
        }}
      />

      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {globalError ? (
          <div className="flex items-center justify-between gap-2 border-b border-red-500/40 bg-red-950/30 px-4 py-2 text-xs text-red-300">
            <span>{globalError}</span>
            <button
              type="button"
              onClick={() => setGlobalError(null)}
              className="underline"
            >
              Cerrar
            </button>
          </div>
        ) : null}

        {activeTab === 'consola' ? (
          <AssistantView
            messages={messages}
            agents={allAgents}
            activePreset={prefs.activePreset}
            onSelectPreset={(id: AgentPresetId) =>
              setPrefs((p) => ({ ...p, activePreset: id }))
            }
            engineRoute={prefs.engineRoute}
            onSelectEngineRoute={(route: EngineRouteId) =>
              setPrefs((p) => ({ ...p, engineRoute: route }))
            }
            activeVoice={prefs.activeVoice}
            autoSpeak={prefs.autoSpeak}
            onToggleAutoSpeak={() =>
              setPrefs((p) => ({ ...p, autoSpeak: !p.autoSpeak }))
            }
            isSending={isSending}
            onSendMessage={(txt, opts) => void handleSendMessage(txt, opts)}
            onStopChat={handleStopChat}
            onRetryLast={handleRetryLast}
            onClearChat={() => setMessages([])}
            playingMessageId={playingMessageId}
            synthesizingMessageId={synthesizingMessageId}
            onSpeakMessage={(msg) => handleSpeakMessage(msg)}
            onStopAudio={stopAllAudio}
            onNavigate={setActiveTab}
          />
        ) : null}

        {activeTab === 'agentes' ? (
          <AgentsView
            agents={allAgents}
            activePreset={prefs.activePreset}
            onSelectPreset={(id) => setPrefs((p) => ({ ...p, activePreset: id }))}
            onAddCustomAgent={(agent) => setCustomAgents((prev) => [...prev, agent])}
            onDeleteCustomAgent={(id) => {
              setCustomAgents((prev) => prev.filter((a) => a.id !== id));
              if (prefs.activePreset === id) {
                setPrefs((p) => ({ ...p, activePreset: 'chat-simple' }));
              }
            }}
            engineRoute={prefs.engineRoute}
            onSelectEngineRoute={(route) =>
              setPrefs((p) => ({ ...p, engineRoute: route }))
            }
          />
        ) : null}

        {activeTab === 'memoria' ? (
          <MemoryView
            memories={memories}
            onAddMemory={(category, content) => {
              const note: MemoryNote = {
                id: `mem-${Date.now()}`,
                category,
                content,
                createdAt: formatTime(),
              };
              setMemories((prev) => [note, ...prev]);
              if (authUser && cloudHydratedUidRef.current === authUser.uid) {
                void syncMemoryNoteToCloud(authUser.uid, note).catch(() => {});
              }
            }}
            onDeleteMemory={(id) => {
              setMemories((prev) => prev.filter((m) => m.id !== id));
              if (authUser && cloudHydratedUidRef.current === authUser.uid) {
                void deleteMemoryNoteFromCloud(authUser.uid, id).catch(() => {});
              }
            }}
          />
        ) : null}

        {activeTab === 'voces' ? (
          <VoicesView
            activeVoice={prefs.activeVoice}
            onSelectVoice={(voice) => setPrefs((p) => ({ ...p, activeVoice: voice }))}
            voiceStyle={prefs.voiceStyle}
            onChangeVoiceStyle={(style) =>
              setPrefs((p) => ({ ...p, voiceStyle: style }))
            }
            ttsModel={prefs.ttsModel}
            onChangeTtsModel={(ttsModel: TtsModelId) =>
              setPrefs((p) => ({ ...p, ttsModel }))
            }
            playbackRate={prefs.playbackRate}
            onChangePlaybackRate={(playbackRate) =>
              setPrefs((p) => ({ ...p, playbackRate }))
            }
            previewingVoice={previewingVoice}
            synthesizingVoice={synthesizingVoice}
            onPreviewVoice={handlePreviewVoice}
            onStopAudio={stopAllAudio}
            lastGeneratedAudio={lastGeneratedAudio}
          />
        ) : null}

        {activeTab === 'trazas' ? (
          <TracesView traces={traces} onClearTraces={() => setTraces([])} />
        ) : null}

        {activeTab === 'constructor' ? (
          <AppBuilderView
            publishedApps={publishedApps}
            engineRoute={prefs.engineRoute}
            onSaveApp={(app) =>
              setPublishedApps((prev) => {
                const exists = prev.some((a) => a.id === app.id);
                return exists
                  ? prev.map((a) => (a.id === app.id ? app : a))
                  : [app, ...prev];
              })
            }
            onToggleAppStatus={(id) =>
              setPublishedApps((prev) =>
                prev.map((a) =>
                  a.id === id
                    ? { ...a, status: a.status === 'active' ? 'paused' : 'active' }
                    : a
                )
              )
            }
            onDeleteApp={(id) =>
              setPublishedApps((prev) => prev.filter((a) => a.id !== id))
            }
            onRecordTrace={(t) =>
              appendTrace({
                ...t,
                preset: prefs.activePreset,
                estimatedEnergyWh: estimateEnergyWh(t.promptTokens, t.outputTokens),
              })
            }
          />
        ) : null}

        {activeTab === 'router' ? (
          <RouterManagerView
            routers={routerProfiles}
            engineRoute={prefs.engineRoute}
            onSaveRouter={(router) =>
              setRouterProfiles((prev) => {
                const exists = prev.some((r) => r.id === router.id);
                return exists
                  ? prev.map((r) => (r.id === router.id ? router : r))
                  : [router, ...prev];
              })
            }
            onDeleteRouter={(id) =>
              setRouterProfiles((prev) => prev.filter((r) => r.id !== id))
            }
            onRecordTrace={(t) =>
              appendTrace({
                ...t,
                preset: prefs.activePreset,
                estimatedEnergyWh: estimateEnergyWh(t.promptTokens, t.outputTokens),
              })
            }
          />
        ) : null}

        {activeTab === 'conectadas' ? (
          <ConnectedAppsManager
            connectedApps={connectedApps}
            onSaveApp={(app) => {
              setConnectedApps((prev) => {
                const exists = prev.some((c) => c.id === app.id);
                return exists
                  ? prev.map((c) => (c.id === app.id ? app : c))
                  : [app, ...prev];
              });
              if (authUser && cloudHydratedUidRef.current === authUser.uid) {
                void syncConnectedAppToCloud(authUser.uid, app).catch(() => {});
              }
            }}
            onToggleStatus={(id) => {
              setConnectedApps((prev) =>
                prev.map((c) => {
                  if (c.id !== id) return c;
                  const updated: ConnectedAppRecord = {
                    ...c,
                    status: c.status === 'active' ? 'paused' : 'active',
                  };
                  if (authUser && cloudHydratedUidRef.current === authUser.uid) {
                    void syncConnectedAppToCloud(authUser.uid, updated).catch(() => {});
                  }
                  return updated;
                })
              );
            }}
            onDeleteApp={(id) => {
              setConnectedApps((prev) => prev.filter((c) => c.id !== id));
              if (authUser && cloudHydratedUidRef.current === authUser.uid) {
                void deleteConnectedAppFromCloud(authUser.uid, id).catch(() => {});
              }
            }}
          />
        ) : null}

        {activeTab === 'espectador' ? (
          <SpectatorView
            engineRoute={prefs.engineRoute}
            onSpeakLine={(line) => speakTextDirect(line)}
            onRecordTrace={(t) =>
              appendTrace({
                ...t,
                preset: prefs.activePreset,
                estimatedEnergyWh: estimateEnergyWh(t.promptTokens, t.outputTokens),
              })
            }
          />
        ) : null}

        {activeTab === 'video' ? (
          <VideoStudioView
            activeVoice={prefs.activeVoice}
            onRecordTrace={(t) =>
              appendTrace({
                ...t,
                preset: prefs.activePreset,
                estimatedEnergyWh: estimateEnergyWh(t.promptTokens, t.outputTokens),
              })
            }
          />
        ) : null}

        {activeTab === 'buscador' ? (
          <SearchWebReaderView
            engineRoute={prefs.engineRoute}
            onSpeakText={(txt) => speakTextDirect(txt)}
            onRecordTrace={(t) =>
              appendTrace({
                ...t,
                preset: prefs.activePreset,
                estimatedEnergyWh: estimateEnergyWh(t.promptTokens, t.outputTokens),
              })
            }
          />
        ) : null}

        {activeTab === 'autonomo' ? (
          <AutonomousAgentView
            connectedApps={connectedApps}
            publishedApps={publishedApps}
            engineRoute={prefs.engineRoute}
            onApplyAppStatusChanges={(changes) => {
              for (const ch of changes) {
                if (ch.kind === 'published') {
                  setPublishedApps((prev) =>
                    prev.map((a) => (a.id === ch.id ? { ...a, status: ch.status } : a))
                  );
                } else {
                  setConnectedApps((prev) =>
                    prev.map((c) => (c.id === ch.id ? { ...c, status: ch.status } : c))
                  );
                }
              }
            }}
            onSpeakLine={(line) => speakTextDirect(line)}
            onRecordTrace={(t) =>
              appendTrace({
                ...t,
                preset: prefs.activePreset,
                estimatedEnergyWh: estimateEnergyWh(t.promptTokens, t.outputTokens),
              })
            }
          />
        ) : null}
      </main>

      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        user={authUser}
        isLoading={authLoading}
        syncStatus={syncStatus}
        requireLoginOnStart={requireLoginOnStart}
        error={authError}
        onSignInWithGoogle={() => void handleSignInWithGoogle()}
        onSignInWithGithub={() => void handleSignInWithGithub()}
        onSignOut={() => void handleSignOut()}
        onToggleRequireLogin={() => void handleToggleRequireLogin()}
        onOpenLoginScreen={() => {
          setIsAccountModalOpen(false);
          try {
            sessionStorage.removeItem('jarvis_guest_mode');
          } catch {
            // ignore
          }
          setGuestEntered(false);
        }}
      />
    </div>
  );
}
