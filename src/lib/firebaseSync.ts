import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from './firebase';
import type {
  ChatMessage,
  ConnectedAppRecord,
  JarvisPreferences,
  MemoryCategory,
  MemoryNote,
} from '../types/jarvis';

export interface AccountSettings {
  requireLoginOnStart: boolean;
  email: string;
  displayName: string;
  photoUrl: string;
}

function sanitizeDocId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return cleaned || `id_${Date.now()}`;
}

export async function ensureUserAccountRecords(user: User): Promise<AccountSettings> {
  const uid = user.uid;
  const displayName = (user.displayName || user.email?.split('@')[0] || 'Usuario Jarvis').slice(
    0,
    100
  );
  const photoUrl = (user.photoURL || '').slice(0, 500);
  const email = (user.email || '').slice(0, 200);

  const profilePath = `users/${uid}`;
  const profileRef = doc(db, 'users', uid);
  try {
    const snap = await getDoc(profileRef);
    if (!snap.exists()) {
      await setDoc(profileRef, {
        uid,
        displayName,
        photoUrl,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(profileRef, {
        displayName,
        photoUrl,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, profilePath);
  }

  const accountPath = `users/${uid}/private/account`;
  const accountRef = doc(db, 'users', uid, 'private', 'account');
  let requireLoginOnStart = false;
  try {
    const accSnap = await getDoc(accountRef);
    if (!accSnap.exists()) {
      await setDoc(accountRef, {
        uid,
        email,
        requireLoginOnStart: false,
        lastLoginAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existingData = accSnap.data();
      requireLoginOnStart = Boolean(existingData?.requireLoginOnStart);
      await updateDoc(accountRef, {
        email,
        lastLoginAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, accountPath);
  }

  return {
    requireLoginOnStart,
    email,
    displayName,
    photoUrl,
  };
}

export async function updateRequireLoginOnStart(
  user: User,
  requireLoginOnStart: boolean
): Promise<void> {
  const accountPath = `users/${user.uid}/private/account`;
  const accountRef = doc(db, 'users', user.uid, 'private', 'account');
  try {
    await updateDoc(accountRef, {
      requireLoginOnStart,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, accountPath);
  }
}

export async function saveUserPreferencesToCloud(
  uid: string,
  prefs: JarvisPreferences
): Promise<void> {
  const path = `users/${uid}/private/preferences`;
  const ref = doc(db, 'users', uid, 'private', 'preferences');
  const payload = {
    uid,
    activePreset: String(prefs.activePreset || 'chat-simple').slice(0, 80),
    engineRoute: ['local-first-hybrid', 'cloud-reasoning', 'low-latency-edge'].includes(
      prefs.engineRoute
    )
      ? prefs.engineRoute
      : 'low-latency-edge',
    activeVoice: ['Charon', 'Kore', 'Zephyr', 'Puck', 'Fenrir'].includes(
      prefs.activeVoice
    )
      ? prefs.activeVoice
      : 'Charon',
    voiceStyle: String(prefs.voiceStyle || '').slice(0, 300),
    ttsModel: ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'].includes(
      prefs.ttsModel
    )
      ? prefs.ttsModel
      : 'gemini-3.8-flash-lite-tts',
    playbackRate: Math.min(2.5, Math.max(0.5, Number(prefs.playbackRate) || 1.0)),
    autoSpeak: Boolean(prefs.autoSpeak),
    darkMode: Boolean(prefs.darkMode),
    updatedAt: serverTimestamp(),
  };

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, payload);
    } else {
      await updateDoc(ref, {
        activePreset: payload.activePreset,
        engineRoute: payload.engineRoute,
        activeVoice: payload.activeVoice,
        voiceStyle: payload.voiceStyle,
        ttsModel: payload.ttsModel,
        playbackRate: payload.playbackRate,
        autoSpeak: payload.autoSpeak,
        darkMode: payload.darkMode,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncMemoryNoteToCloud(uid: string, note: MemoryNote): Promise<void> {
  const docId = sanitizeDocId(note.id);
  const path = `users/${uid}/memories/${docId}`;
  const ref = doc(db, 'users', uid, 'memories', docId);
  const validCategory: MemoryCategory = [
    'preferencia',
    'proyecto',
    'persona',
    'contexto',
  ].includes(note.category)
    ? note.category
    : 'contexto';

  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, {
        uid,
        category: validCategory,
        content: note.content.slice(0, 4000) || 'Nota',
        createdAtLabel: (note.createdAt || 'Hoy').slice(0, 40),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        category: validCategory,
        content: note.content.slice(0, 4000) || 'Nota',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteMemoryNoteFromCloud(
  uid: string,
  noteId: string
): Promise<void> {
  const docId = sanitizeDocId(noteId);
  const path = `users/${uid}/memories/${docId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'memories', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function syncConnectedAppToCloud(
  uid: string,
  app: ConnectedAppRecord
): Promise<void> {
  const docId = sanitizeDocId(app.id);
  const path = `users/${uid}/connectedApps/${docId}`;
  const ref = doc(db, 'users', uid, 'connectedApps', docId);

  const validAppTypes = [
    'device_app',
    'pwa_web',
    'rest_api',
    'webhook',
    'mcp_bridge',
    'local_service',
  ] as const;
  const validPlatforms = ['desktop', 'mobile', 'web', 'localhost'] as const;
  const validMethods = ['GET', 'POST', 'PUT', 'DELETE'] as const;
  const validStatuses = ['online', 'offline', 'unknown'] as const;

  const normalized = {
    uid,
    name: String(app.name || 'App').slice(0, 120),
    appType: validAppTypes.includes(app.appType) ? app.appType : 'device_app',
    platform:
      app.platform && validPlatforms.includes(app.platform) ? app.platform : 'web',
    launchUri: String(app.launchUri || '').slice(0, 500),
    packageOrExecutable: String(app.packageOrExecutable || '').slice(0, 240),
    executionMode: app.executionMode === 'server_proxy' ? 'server_proxy' : 'browser_local',
    baseUrl: String(app.baseUrl || '').slice(0, 500),
    healthPath: String(app.healthPath || '').slice(0, 200),
    defaultMethod: validMethods.includes(app.defaultMethod) ? app.defaultMethod : 'GET',
    description: String(app.description || '').slice(0, 1000),
    status: app.status === 'paused' ? 'paused' : 'active',
    lastCheckStatus: validStatuses.includes(app.lastCheckStatus)
      ? app.lastCheckStatus
      : 'unknown',
  };

  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, {
        ...normalized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        name: normalized.name,
        appType: normalized.appType,
        platform: normalized.platform,
        launchUri: normalized.launchUri,
        packageOrExecutable: normalized.packageOrExecutable,
        executionMode: normalized.executionMode,
        baseUrl: normalized.baseUrl,
        healthPath: normalized.healthPath,
        defaultMethod: normalized.defaultMethod,
        description: normalized.description,
        status: normalized.status,
        lastCheckStatus: normalized.lastCheckStatus,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteConnectedAppFromCloud(
  uid: string,
  appId: string
): Promise<void> {
  const docId = sanitizeDocId(appId);
  const path = `users/${uid}/connectedApps/${docId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'connectedApps', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function syncMessageToCloud(uid: string, msg: ChatMessage): Promise<void> {
  if (msg.streaming || msg.error) return;
  const docId = sanitizeDocId(msg.id);
  const path = `users/${uid}/messages/${docId}`;
  const ref = doc(db, 'users', uid, 'messages', docId);
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) return;
    await setDoc(ref, {
      uid,
      role: msg.role,
      content: (msg.content || (msg.attachments?.length ? '[Foto adjunta]' : '')).slice(
        0,
        16000
      ),
      timestampLabel: (msg.timestamp || 'Ahora').slice(0, 40),
      preset: String(msg.preset || 'chat-simple').slice(0, 80),
      ...(msg.agentLabel ? { agentLabel: msg.agentLabel.slice(0, 120) } : {}),
      ...(msg.modelUsed ? { modelUsed: msg.modelUsed.slice(0, 80) } : {}),
      ...(typeof msg.latencyMs === 'number' && msg.latencyMs >= 0
        ? { latencyMs: msg.latencyMs }
        : {}),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function loadUserCloudWorkspace(uid: string): Promise<{
  prefs: Partial<JarvisPreferences> | null;
  memories: MemoryNote[];
  connectedApps: ConnectedAppRecord[];
  messages: ChatMessage[];
}> {
  let prefs: Partial<JarvisPreferences> | null = null;
  const prefsPath = `users/${uid}/private/preferences`;
  try {
    const prefSnap = await getDoc(doc(db, 'users', uid, 'private', 'preferences'));
    if (prefSnap.exists()) {
      const d = prefSnap.data();
      prefs = {
        activePreset: d.activePreset,
        engineRoute: d.engineRoute,
        activeVoice: d.activeVoice,
        voiceStyle: d.voiceStyle,
        ttsModel: d.ttsModel,
        playbackRate: d.playbackRate,
        autoSpeak: d.autoSpeak,
        darkMode: d.darkMode,
      };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, prefsPath);
  }

  const memories: MemoryNote[] = [];
  const memoriesPath = `users/${uid}/memories`;
  try {
    const memQ = query(collection(db, 'users', uid, 'memories'), where('uid', '==', uid));
    const memSnap = await getDocs(memQ);
    const items = memSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        category: data.category as MemoryCategory,
        content: String(data.content || ''),
        createdAt: String(data.createdAtLabel || 'Guardada'),
        sortMs: data.createdAt?.toMillis?.() ?? 0,
      };
    });
    items.sort((a, b) => b.sortMs - a.sortMs);
    for (const item of items) {
      memories.push({
        id: item.id,
        category: item.category,
        content: item.content,
        createdAt: item.createdAt,
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, memoriesPath);
  }

  const connectedApps: ConnectedAppRecord[] = [];
  const appsPath = `users/${uid}/connectedApps`;
  try {
    const appsQ = query(
      collection(db, 'users', uid, 'connectedApps'),
      where('uid', '==', uid)
    );
    const appsSnap = await getDocs(appsQ);
    const items = appsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: String(data.name || ''),
        appType: data.appType,
        platform: data.platform,
        launchUri: String(data.launchUri || ''),
        packageOrExecutable: String(data.packageOrExecutable || ''),
        executionMode: data.executionMode,
        baseUrl: String(data.baseUrl || ''),
        healthPath: String(data.healthPath || ''),
        defaultMethod: data.defaultMethod,
        authHeaderName: '',
        authHeaderValue: '',
        description: String(data.description || ''),
        status: data.status,
        lastCheckStatus: data.lastCheckStatus,
        lastCheckLatencyMs: 0,
        lastCheckedAtMs: 0,
        sortMs: data.createdAt?.toMillis?.() ?? 0,
      };
    });
    items.sort((a, b) => b.sortMs - a.sortMs);
    for (const item of items) {
      const { sortMs: _ignore, ...record } = item;
      connectedApps.push(record);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, appsPath);
  }

  const messages: ChatMessage[] = [];
  const msgsPath = `users/${uid}/messages`;
  try {
    const msgsQ = query(collection(db, 'users', uid, 'messages'), where('uid', '==', uid));
    const msgsSnap = await getDocs(msgsQ);
    const items = msgsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        role: data.role as 'user' | 'assistant',
        content: String(data.content || ''),
        timestamp: String(data.timestampLabel || ''),
        preset: String(data.preset || 'chat-simple'),
        agentLabel: data.agentLabel,
        modelUsed: data.modelUsed,
        latencyMs: data.latencyMs,
        sortMs: data.createdAt?.toMillis?.() ?? 0,
      };
    });
    items.sort((a, b) => a.sortMs - b.sortMs);
    for (const item of items.slice(-60)) {
      const { sortMs: _ignore, ...msg } = item;
      messages.push(msg);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, msgsPath);
  }

  return {
    prefs,
    memories,
    connectedApps,
    messages,
  };
}
