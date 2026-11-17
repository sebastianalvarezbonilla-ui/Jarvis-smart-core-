import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  GoogleGenAI,
  ThinkingLevel,
  Type,
  type Content,
  type FunctionDeclaration,
} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'jarvis-state.json');

const VALID_VOICES = ['Charon', 'Kore', 'Zephyr', 'Puck', 'Fenrir'] as const;

interface PersistentState {
  memories: Array<{
    id: string;
    category: string;
    content: string;
    createdAt: string;
  }>;
  customAgents: Array<Record<string, unknown>>;
  publishedApps: Array<{
    id: string;
    slug: string;
    title: string;
    summary: string;
    prompt: string;
    htmlCode: string;
    status: 'active' | 'paused';
    designStyle: string;
    createdAtMs: number;
    updatedAtMs: number;
  }>;
  connectedApps: Array<Record<string, unknown>>;
  routerProfiles: Array<Record<string, unknown>>;
  traces: Array<Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;
  prefs: Record<string, unknown>;
}

const DEFAULT_STATE: PersistentState = {
  memories: [
    {
      id: 'mem-init-1',
      category: 'preferencia',
      content: 'Idioma principal en español con respuestas directas y listas para lectura en voz alta.',
      createdAt: 'Inicial',
    },
    {
      id: 'mem-init-2',
      category: 'proyecto',
      content: 'Consola Jarvis Smart Core con agentes configurables, constructor web, router, espectador y estudio de video.',
      createdAt: 'Inicial',
    },
  ],
  customAgents: [],
  publishedApps: [],
  connectedApps: [],
  routerProfiles: [],
  traces: [],
  messages: [],
  prefs: {
    activePreset: 'chat-simple',
    engineRoute: 'low-latency-edge',
    activeVoice: 'Charon',
    voiceStyle: 'Sereno, articulado, tono de asistente personal técnico con pausas claras',
    ttsModel: 'gemini-3.8-flash-lite-tts',
    playbackRate: 1.0,
    autoSpeak: false,
    darkMode: true,
  },
};

function loadState(): PersistentState {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STATE_FILE)) {
      fs.writeFileSync(STATE_FILE, JSON.stringify(DEFAULT_STATE, null, 2), 'utf8');
      return { ...DEFAULT_STATE };
    }
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistentState>;
    return {
      memories: Array.isArray(parsed.memories) ? parsed.memories : DEFAULT_STATE.memories,
      customAgents: Array.isArray(parsed.customAgents) ? parsed.customAgents : [],
      publishedApps: Array.isArray(parsed.publishedApps) ? parsed.publishedApps : [],
      connectedApps: Array.isArray(parsed.connectedApps) ? parsed.connectedApps : [],
      routerProfiles: Array.isArray(parsed.routerProfiles) ? parsed.routerProfiles : [],
      traces: Array.isArray(parsed.traces) ? parsed.traces : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      prefs: parsed.prefs && typeof parsed.prefs === 'object' ? { ...DEFAULT_STATE.prefs, ...parsed.prefs } : DEFAULT_STATE.prefs,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState(next: PersistentState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmpFile, STATE_FILE);
}

function getAiClient(apiVersion?: string): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada en el entorno del servidor.');
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function mapThinkingLevel(level?: string): ThinkingLevel {
  switch ((level || '').toUpperCase()) {
    case 'HIGH':
      return ThinkingLevel.HIGH;
    case 'MEDIUM':
      return ThinkingLevel.MEDIUM;
    default:
      return ThinkingLevel.LOW;
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout (${ms}ms) en ${label}`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function callWithRetryAndFallback<T>(
  chain: Array<{ model: string; retries: number; timeoutMs: number }>,
  fn: (model: string) => Promise<T>
): Promise<{ result: T; modelUsed: string }> {
  let lastError: unknown;
  for (const step of chain) {
    for (let attempt = 0; attempt <= step.retries; attempt++) {
      try {
        const result = await withTimeout(fn(step.model), step.timeoutMs, step.model);
        return { result, modelUsed: step.model };
      } catch (err) {
        lastError = err;
        if (attempt < step.retries) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
    }
  }
  throw lastError;
}

function parseGeminiError(err: unknown): {
  statusCode: number;
  userMessage: string;
  apiStatus?: string;
} {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('GEMINI_API_KEY')) {
    return {
      statusCode: 500,
      userMessage: 'Falta la clave GEMINI_API_KEY en Settings > Secrets.',
      apiStatus: 'MISSING_API_KEY',
    };
  }
  if (raw.includes('403') || raw.includes('PERMISSION_DENIED')) {
    return {
      statusCode: 403,
      userMessage: 'Permiso denegado en la API de Gemini. Revisa tu clave en Settings > Secrets.',
      apiStatus: 'PERMISSION_DENIED',
    };
  }
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
    return {
      statusCode: 429,
      userMessage: 'Cuota temporalmente agotada. Espera unos segundos o verifica tu plan en Secrets.',
      apiStatus: 'RESOURCE_EXHAUSTED',
    };
  }
  if (raw.includes('404') || raw.includes('NOT_FOUND')) {
    return {
      statusCode: 404,
      userMessage: 'Modelo no encontrado o no disponible en esta cuenta.',
      apiStatus: 'NOT_FOUND',
    };
  }
  if (raw.includes('Timeout') || raw.includes('ETIMEDOUT') || raw.includes('AbortError')) {
    return {
      statusCode: 504,
      userMessage: 'La respuesta tardó demasiado en responder. Inténtalo de nuevo o usa Motor: Edge Rápido.',
      apiStatus: 'DEADLINE_EXCEEDED',
    };
  }
  return {
    statusCode: 500,
    userMessage: raw || 'Error inesperado al consultar Gemini.',
    apiStatus: 'INTERNAL',
  };
}

function isPrivateOrRestrictedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) {
    return true;
  }
  const match172 = host.match(/^172\.(\d+)\./);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function resolveSafeAppUrl(baseUrl: string, subPath = ''): string {
  const normalizedBase = /^https?:\/\//i.test(baseUrl.trim())
    ? baseUrl.trim()
    : `https://${baseUrl.trim()}`;
  const parsed = new URL(normalizedBase);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Solo se permiten URLs http o https.');
  }
  if (isPrivateOrRestrictedHost(parsed.hostname)) {
    throw new Error(
      `El host ${parsed.hostname} es de red privada/local y no es accesible directamente desde el servidor en la nube.`
    );
  }
  if (subPath && subPath.trim()) {
    const cleanSub = subPath.trim().startsWith('/') ? subPath.trim() : `/${subPath.trim()}`;
    return new URL(cleanSub, parsed).toString();
  }
  return parsed.toString();
}

function buildRouterAuthHeaders(
  authScheme: string,
  username: string,
  password: string
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, text/html',
  };
  if (authScheme === 'basic' && (username || password)) {
    const token = Buffer.from(`${username}:${password}`).toString('base64');
    headers.Authorization = `Basic ${token}`;
  } else if (authScheme === 'bearer' && password) {
    headers.Authorization = `Bearer ${password}`;
  }
  return headers;
}

async function fetchAndExtractWebPage(rawUrl: string): Promise<{
  url: string;
  title: string;
  description: string;
  wordCount: number;
  extractedText: string;
  headings: string[];
  links: Array<{ text: string; url: string }>;
}> {
  const targetUrl = resolveSafeAppUrl(rawUrl, '');
  const resp = await fetch(targetUrl, {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; JarvisWebReader/1.0; +https://jarvis.local)',
      Accept: 'text/html,application/xhtml+xml,text/plain',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} al leer ${targetUrl}`);
  }
  const html = await resp.text();

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = (titleMatch?.[1] || targetUrl).replace(/\s+/g, ' ').trim();

  const descMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const description = (descMatch?.[1] || '').trim();

  const headings: string[] = [];
  const headingRegex = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let hMatch: RegExpExecArray | null;
  while ((hMatch = headingRegex.exec(html)) !== null && headings.length < 20) {
    const clean = hMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (clean && !headings.includes(clean)) headings.push(clean);
  }

  const links: Array<{ text: string; url: string }> = [];
  const linkRegex = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let lMatch: RegExpExecArray | null;
  while ((lMatch = linkRegex.exec(html)) !== null && links.length < 20) {
    const href = lMatch[1].trim();
    const label = lMatch[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!label || !href || href.startsWith('javascript:')) continue;
    try {
      const absUrl = new URL(href, targetUrl).toString();
      links.push({ text: label.slice(0, 90), url: absUrl });
    } catch {
      // ignore invalid relative link
    }
  }

  const strippedText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

  const wordCount = strippedText ? strippedText.split(/\s+/).length : 0;
  return {
    url: targetUrl,
    title,
    description,
    wordCount,
    extractedText: strippedText.slice(0, 24000),
    headings,
    links,
  };
}

// Tool declarations for Jarvis Chat
const saveMemoryTool: FunctionDeclaration = {
  name: 'save_memory',
  description: 'Guarda un dato o preferencia importante del usuario en su memoria persistente.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      category: {
        type: Type.STRING,
        enum: ['preferencia', 'proyecto', 'persona', 'contexto'],
      },
      content: { type: Type.STRING },
    },
    required: ['category', 'content'],
  },
};

const searchMemoryTool: FunctionDeclaration = {
  name: 'search_memory',
  description: 'Busca entradas guardadas en la memoria del usuario.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING },
    },
    required: ['query'],
  },
};

const switchVoiceTool: FunctionDeclaration = {
  name: 'switch_voice',
  description: 'Cambia la voz neuronal activa de Jarvis.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      voiceId: {
        type: Type.STRING,
        enum: ['Charon', 'Kore', 'Zephyr', 'Puck', 'Fenrir'],
      },
      style: { type: Type.STRING },
    },
    required: ['voiceId'],
  },
};

const switchPresetTool: FunctionDeclaration = {
  name: 'switch_preset',
  description: 'Cambia el agente o preset activo de Jarvis.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      presetId: { type: Type.STRING },
    },
    required: ['presetId'],
  },
};

const listUserAppsTool: FunctionDeclaration = {
  name: 'list_user_apps',
  description: 'Lista las aplicaciones publicadas y conectadas del usuario.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

const toggleAppStatusTool: FunctionDeclaration = {
  name: 'toggle_app_status',
  description: 'Activa o pausa una aplicación publicada o conectada.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      kind: { type: Type.STRING, enum: ['published', 'connected'] },
      identifier: { type: Type.STRING },
      status: { type: Type.STRING, enum: ['active', 'paused'] },
    },
    required: ['kind', 'identifier', 'status'],
  },
};

const executeConnectedAppTool: FunctionDeclaration = {
  name: 'execute_connected_app',
  description: 'Ejecuta una petición HTTP contra una aplicación conectada del usuario.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      appIdOrName: { type: Type.STRING },
      path: { type: Type.STRING },
      method: { type: Type.STRING, enum: ['GET', 'POST', 'PUT', 'DELETE'] },
    },
    required: ['appIdOrName'],
  },
};

const readWebPageTool: FunctionDeclaration = {
  name: 'read_web_page',
  description: 'Lee y extrae el contenido de una URL pública.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      url: { type: Type.STRING },
    },
    required: ['url'],
  },
};

const launchDeviceAppTool: FunctionDeclaration = {
  name: 'launch_device_app',
  description:
    'Abre o hace clic automáticamente en una aplicación del dispositivo del usuario (como Spotify, WhatsApp, YouTube, Discord, Telegram, VS Code, Notion, etc.) y opcionalmente busca o reproduce contenido dentro de ella.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      appIdOrName: {
        type: Type.STRING,
        description: 'Nombre o ID de la aplicación (ej. Spotify, WhatsApp, YouTube).',
      },
      query: {
        type: Type.STRING,
        description:
          'Opcional: canción, artista, playlist o término de búsqueda para abrir directamente en la app.',
      },
      preferWeb: {
        type: Type.BOOLEAN,
        description:
          'Opcional: true si el usuario pidió abrir la versión web en el navegador.',
      },
    },
    required: ['appIdOrName'],
  },
};

interface DeviceAppLaunchCandidate {
  id: string;
  name: string;
  platform?: string;
  launchUri?: string;
  baseUrl?: string;
  aliases?: string[];
}

const BUILTIN_DEVICE_APPS: DeviceAppLaunchCandidate[] = [
  {
    id: 'builtin-spotify',
    name: 'Spotify',
    platform: 'desktop',
    launchUri: 'spotify://',
    baseUrl: 'https://open.spotify.com',
    aliases: ['spotify', 'espotify', 'spotifi', 'spotify web'],
  },
  {
    id: 'builtin-whatsapp',
    name: 'WhatsApp',
    platform: 'mobile',
    launchUri: 'whatsapp://send',
    baseUrl: 'https://web.whatsapp.com',
    aliases: ['whatsapp', 'wasap', 'wsp', 'whatsapp web'],
  },
  {
    id: 'builtin-youtube',
    name: 'YouTube',
    platform: 'web',
    launchUri: 'https://www.youtube.com',
    baseUrl: 'https://www.youtube.com',
    aliases: ['youtube', 'yt', 'yutub', 'youtube web'],
  },
  {
    id: 'builtin-vscode',
    name: 'Visual Studio Code',
    platform: 'desktop',
    launchUri: 'vscode://',
    baseUrl: 'https://vscode.dev',
    aliases: ['visual studio code', 'vscode', 'vs code', 'code'],
  },
  {
    id: 'builtin-telegram',
    name: 'Telegram',
    platform: 'mobile',
    launchUri: 'tg://',
    baseUrl: 'https://web.telegram.org',
    aliases: ['telegram', 'tg', 'telegram web'],
  },
  {
    id: 'builtin-notion',
    name: 'Notion',
    platform: 'desktop',
    launchUri: 'notion://',
    baseUrl: 'https://www.notion.so',
    aliases: ['notion'],
  },
  {
    id: 'builtin-discord',
    name: 'Discord',
    platform: 'desktop',
    launchUri: 'discord://',
    baseUrl: 'https://discord.com/app',
    aliases: ['discord', 'discord web'],
  },
  {
    id: 'builtin-obsidian',
    name: 'Obsidian',
    platform: 'desktop',
    launchUri: 'obsidian://open',
    baseUrl: 'https://obsidian.md',
    aliases: ['obsidian'],
  },
  {
    id: 'builtin-calendar',
    name: 'Google Calendar',
    platform: 'web',
    launchUri: 'https://calendar.google.com',
    baseUrl: 'https://calendar.google.com',
    aliases: ['google calendar', 'calendario', 'calendar'],
  },
];

function normalizeAppLookupKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function findDeviceAppCandidate(
  appIdOrName: string,
  connectedApps: DeviceAppLaunchCandidate[]
): DeviceAppLaunchCandidate | undefined {
  const rawKey = normalizeAppLookupKey(appIdOrName);
  const cleanKey = rawKey.replace(/\b(web|en navegador|navegador|app)\b/g, '').trim() || rawKey;
  if (!cleanKey) return undefined;

  const fromConnected = connectedApps.find((c) => {
    const idNorm = normalizeAppLookupKey(c.id);
    const nameNorm = normalizeAppLookupKey(c.name);
    return (
      idNorm === cleanKey ||
      nameNorm === cleanKey ||
      nameNorm.includes(cleanKey) ||
      cleanKey.includes(nameNorm)
    );
  });
  if (fromConnected) return fromConnected;

  return BUILTIN_DEVICE_APPS.find((b) => {
    const nameNorm = normalizeAppLookupKey(b.name);
    if (nameNorm === cleanKey || nameNorm.includes(cleanKey)) return true;
    return (b.aliases || []).some(
      (alias) => alias === rawKey || alias === cleanKey || cleanKey === alias
    );
  });
}

function resolveDeviceAppLaunch(
  args: { appIdOrName: string; query?: string; preferWeb?: boolean },
  connectedApps: DeviceAppLaunchCandidate[]
): {
  ok: boolean;
  action?: {
    id: string;
    name: string;
    launchUri: string;
    fallbackUri?: string;
    query?: string;
    autoClick: boolean;
    platform?: string;
  };
  error?: string;
} {
  const target = findDeviceAppCandidate(args.appIdOrName, connectedApps);
  if (!target) {
    return {
      ok: false,
      error: 'No encontré esa aplicación en tu lista de dispositivo ni en el catálogo.',
    };
  }

  const query = typeof args.query === 'string' ? args.query.trim().slice(0, 120) : '';
  const preferWeb =
    Boolean(args.preferWeb) || /\b(web|navegador)\b/i.test(args.appIdOrName);
  const isSpotify =
    normalizeAppLookupKey(target.name).includes('spotify') ||
    (target.launchUri || '').toLowerCase().startsWith('spotify:');
  const isYoutube =
    normalizeAppLookupKey(target.name).includes('youtube') ||
    (target.baseUrl || '').toLowerCase().includes('youtube.com');

  let launchUri = target.launchUri || target.baseUrl || '';
  let fallbackUri: string | undefined =
    target.baseUrl && target.baseUrl !== launchUri ? target.baseUrl : undefined;

  if (isSpotify) {
    const nativeUri = query
      ? `spotify:search:${encodeURIComponent(query)}`
      : target.launchUri && !/^https?:\/\//i.test(target.launchUri)
        ? target.launchUri
        : 'spotify://';
    const webUri = query
      ? `https://open.spotify.com/search/${encodeURIComponent(query)}`
      : target.baseUrl && /^https?:\/\//i.test(target.baseUrl)
        ? target.baseUrl
        : 'https://open.spotify.com';
    launchUri = preferWeb ? webUri : nativeUri;
    fallbackUri = preferWeb ? nativeUri : webUri;
  } else if (isYoutube) {
    const webUri = query
      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
      : target.launchUri || target.baseUrl || 'https://www.youtube.com';
    launchUri = webUri;
    fallbackUri = undefined;
  } else if (preferWeb && target.baseUrl) {
    fallbackUri = target.launchUri && target.launchUri !== target.baseUrl ? target.launchUri : undefined;
    launchUri = target.baseUrl;
  }

  if (!launchUri) {
    return {
      ok: false,
      error: `La aplicación ${target.name} no tiene una URI de lanzamiento configurada.`,
    };
  }

  return {
    ok: true,
    action: {
      id: target.id,
      name: target.name,
      launchUri,
      fallbackUri,
      query: query || undefined,
      autoClick: true,
      platform: target.platform,
    },
  };
}

function detectDirectAppLaunchIntent(
  rawMessage: string,
  connectedApps: DeviceAppLaunchCandidate[]
): { appIdOrName: string; query?: string; preferWeb?: boolean } | null {
  const trimmed = rawMessage.trim();
  if (!trimmed || trimmed.length > 120 || trimmed.includes('?')) return null;

  const normalized = normalizeAppLookupKey(trimmed);
  if (
    /\b(explica|explicame|resume|resumeme|analiza|traduce|escribe un|programa|crea una app|como funciona)\b/.test(
      normalized
    )
  ) {
    return null;
  }

  const preferWeb = /\b(web|navegador|browser)\b/.test(normalized);

  // e.g. "pon bad bunny en spotify", "busca lofi en youtube", "reproduce rock en spotify web"
  const inAppMatch = trimmed.match(
    /^(?:por\s+favor\s+)?(?:jarvis[,\s]+)?(?:pon(?:me)?|reproduce|busca|buscar|escuchar|toca|abre|abrir)\s+(.+?)\s+(?:en|dentro\s+de)\s+([a-z0-9áéíóúüñ ._-]+?)\s*$/i
  );
  if (inAppMatch) {
    const rawQuery = inAppMatch[1]
      .replace(/^(?:la\s+cancion\s+(?:de\s+)?|musica\s+(?:de\s+)?|algo\s+de\s+|un\s+video\s+de\s+)/i, '')
      .trim();
    const candidateApp = inAppMatch[2].trim();
    if (findDeviceAppCandidate(candidateApp, connectedApps)) {
      return {
        appIdOrName: candidateApp,
        query: rawQuery || undefined,
        preferWeb,
      };
    }
  }

  // e.g. "dale clic en spotify", "abre spotify", "clic a spotify", "inicia whatsapp"
  const directMatch = trimmed.match(
    /^(?:por\s+favor\s+)?(?:jarvis[,\s]+)?(?:(?:dale|haz|hacer|darle)\s+cli[ck]\s+(?:en|a)|cli[ck]\s+(?:en|a)|abre|abrir|inicia|iniciar|lanza|lanzar|ejecuta|ejecutar|entra\s+a|pon(?:me)?)\s+(?:la\s+app\s+(?:de\s+)?|aplicacion\s+(?:de\s+)?)?([a-z0-9áéíóúüñ ._-]+?)\s*$/i
  );
  if (directMatch) {
    const candidateApp = directMatch[1].trim();
    if (findDeviceAppCandidate(candidateApp, connectedApps)) {
      return { appIdOrName: candidateApp, preferWeb };
    }
  }

  // bare "spotify" or "spotify web"
  if (/^(?:jarvis[,\s]+)?spotify(?:\s+web)?$/i.test(normalized)) {
    return { appIdOrName: 'Spotify', preferWeb };
  }

  return null;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'jarvis-smart-core',
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  // Persistent Local State Sync
  app.get('/api/jarvis/state', (_req, res) => {
    res.json(loadState());
  });

  app.put('/api/jarvis/state', (req, res) => {
    try {
      const current = loadState();
      const incoming = req.body as Partial<PersistentState>;
      const merged: PersistentState = {
        memories: Array.isArray(incoming.memories) ? incoming.memories : current.memories,
        customAgents: Array.isArray(incoming.customAgents)
          ? incoming.customAgents
          : current.customAgents,
        publishedApps: Array.isArray(incoming.publishedApps)
          ? incoming.publishedApps
          : current.publishedApps,
        connectedApps: Array.isArray(incoming.connectedApps)
          ? incoming.connectedApps
          : current.connectedApps,
        routerProfiles: Array.isArray(incoming.routerProfiles)
          ? incoming.routerProfiles
          : current.routerProfiles,
        traces: Array.isArray(incoming.traces)
          ? incoming.traces.slice(0, 200)
          : current.traces,
        messages: Array.isArray(incoming.messages)
          ? incoming.messages.slice(-80)
          : current.messages,
        prefs:
          incoming.prefs && typeof incoming.prefs === 'object'
            ? { ...current.prefs, ...incoming.prefs }
            : current.prefs,
      };
      saveState(merged);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'No se pudo guardar el estado.',
      });
    }
  });

  interface ChatRequestPayload {
    message?: string;
    attachments?: Array<{ name?: string; mimeType: string; data: string }>;
    history?: Array<{ role: string; content: string }>;
    preset?: string;
    systemPrompt?: string;
    thinkingLevel?: string;
    usesSearch?: boolean;
    memories?: Array<{ category: string; content: string }>;
    publishedApps?: Array<{ slug: string; title: string; summary: string; status: string }>;
    connectedApps?: Array<{
      id: string;
      name: string;
      appType: string;
      platform?: string;
      launchUri?: string;
      packageOrExecutable?: string;
      baseUrl: string;
      healthPath: string;
      defaultMethod: string;
      description: string;
      status: string;
      lastCheckStatus: string;
    }>;
    routerProfiles?: Array<Record<string, unknown>>;
    activeVoice?: string;
    engineRoute?: string;
  }

  function prepareChatSetup(body: ChatRequestPayload) {
    const {
      message = '',
      attachments = [],
      history = [],
      preset = 'chat-simple',
      systemPrompt = '',
      thinkingLevel = 'LOW',
      usesSearch = false,
      memories = [],
      publishedApps = [],
      connectedApps = [],
      routerProfiles = [],
      activeVoice = 'Charon',
      engineRoute = 'low-latency-edge',
    } = body;

    const rawMessage = typeof message === 'string' ? message.trim() : '';
    const validAttachments = Array.isArray(attachments)
      ? attachments
          .filter(
            (att) =>
              att &&
              typeof att.mimeType === 'string' &&
              att.mimeType.startsWith('image/') &&
              typeof att.data === 'string' &&
              att.data.trim().length > 0
          )
          .slice(0, 6)
      : [];

    const memorySummary =
      memories.length > 0
        ? memories.map((m) => `- [${m.category}] ${m.content}`).join('\n')
        : 'Sin entradas guardadas aún.';

    const appsSummaryLines: string[] = [];
    if (publishedApps.length > 0) {
      appsSummaryLines.push(
        'Aplicaciones publicadas (/p/:slug):\n' +
          publishedApps
            .map((a) => `- ${a.title} (slug: ${a.slug}, estado: ${a.status}): ${a.summary}`)
            .join('\n')
      );
    }
    if (connectedApps.length > 0) {
      appsSummaryLines.push(
        'Aplicaciones del dispositivo y conectadas:\n' +
          connectedApps
            .map(
              (c) =>
                `- ${c.name} (id: ${c.id}, tipo: ${c.appType}, plataforma: ${c.platform || 'web'}, uri: ${c.launchUri || c.baseUrl}, estado: ${c.status}, salud: ${c.lastCheckStatus}): ${c.description}`
            )
            .join('\n')
      );
    }
    if (routerProfiles.length > 0) {
      appsSummaryLines.push(
        'Routers registrados:\n' +
          routerProfiles
            .map(
              (r) =>
                `- ${String(r.name)} (marca: ${String(r.vendor)}, estado: ${String(r.connectionStatus)}, salud: ${String(r.lastDiagnosticHealth)}, Wi-Fi: ${String(r.wifiName)}): ${String(r.lastDiagnosticSummary || 'Sin diagnóstico previo')}`
            )
            .join('\n')
      );
    }

    const appsContext =
      appsSummaryLines.length > 0
        ? appsSummaryLines.join('\n')
        : 'Sin aplicaciones publicadas ni conectadas en esta sesión.';

    const fullSystemInstruction = [
      systemPrompt ||
        'Eres Jarvis, una consola personal de IA con memoria, agentes configurables y herramientas integradas.',
      `Agente activo: ${preset}. Estrategia de motor: ${engineRoute}. Voz activa: ${activeVoice}.`,
      `Memoria local disponible:\n${memorySummary}`,
      `Aplicaciones y routers del usuario:\n${appsContext}`,
      'Si el usuario adjunta fotos o capturas, analízalas con precisión y responde a su petición sobre ellas.',
      'Si el usuario pide recordar algo, usa save_memory. Si pide cambiar de voz, usa switch_voice. Si pide cambiar de agente, usa switch_preset. Si pide abrir, lanzar, reproducir o darle clic a una aplicación (como Spotify, WhatsApp, YouTube, Discord, etc.), usa SIEMPRE launch_device_app inmediatamente (pasando query si pidió buscar/reproducir una canción o tema); la consola ejecutará el clic automático al instante. Si pide listar o controlar sus apps, usa list_user_apps, toggle_app_status o execute_connected_app. Si pide leer un enlace web, usa read_web_page.',
      'Responde en español claro, directo y cómodo de leer en voz alta.',
    ].join('\n\n');

    const contents: Content[] = history
      .slice(-10)
      .filter((item) => item && typeof item.content === 'string' && item.content.trim())
      .map((item) => ({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: item.content }],
      }));

    const userParts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [];
    for (const att of validAttachments) {
      const cleanBase64 = att.data.includes('base64,')
        ? att.data.split('base64,').pop() || ''
        : att.data;
      if (cleanBase64) {
        userParts.push({
          inlineData: {
            mimeType: att.mimeType,
            data: cleanBase64,
          },
        });
      }
    }
    userParts.push({
      text:
        rawMessage ||
        (validAttachments.length === 1
          ? 'Analiza esta foto en detalle y dime qué ves o cómo puedes ayudarme con ella.'
          : 'Analiza estas fotos en detalle y dime qué ves.'),
    });
    contents.push({ role: 'user', parts: userParts });

    const functionDeclarations = [
      saveMemoryTool,
      searchMemoryTool,
      switchVoiceTool,
      switchPresetTool,
      listUserAppsTool,
      toggleAppStatusTool,
      executeConnectedAppTool,
      readWebPageTool,
      launchDeviceAppTool,
    ];

    const tools: Array<Record<string, unknown>> = [{ functionDeclarations }];
    if (usesSearch) {
      tools.unshift({ googleSearch: {} });
    }

    const buildConfigForModel = (model: string): Record<string, unknown> => {
      const cfg: Record<string, unknown> = {
        systemInstruction: fullSystemInstruction,
        tools,
      };
      if (model === 'gemini-4-hydrogen') {
        cfg.thinkingConfig = {
          thinkingLevel:
            engineRoute === 'cloud-reasoning'
              ? mapThinkingLevel(thinkingLevel)
              : ThinkingLevel.LOW,
        };
      }
      if (usesSearch) {
        cfg.toolConfig = { includeServerSideToolInvocations: true };
      }
      return cfg;
    };

    const chatModelChain =
      engineRoute === 'cloud-reasoning'
        ? [
            { model: 'gemini-4-hydrogen', retries: 0, timeoutMs: 3500 },
            { model: 'gemini-3.1-flash-lite', retries: 0, timeoutMs: 10000 },
          ]
        : [
            { model: 'gemini-3.1-flash-lite', retries: 0, timeoutMs: 9000 },
            { model: 'gemini-4-hydrogen', retries: 0, timeoutMs: 10000 },
          ];

    return {
      rawMessage,
      validAttachments,
      contents,
      buildConfigForModel,
      chatModelChain,
      memories,
      publishedApps,
      connectedApps,
      activeVoice,
      preset,
    };
  }

  async function executeJarvisToolCalls(
    calls: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>,
    ctx: {
      memories: Array<{ category: string; content: string }>;
      publishedApps: Array<{ slug: string; title: string; summary: string; status: string }>;
      connectedApps: Array<{
        id: string;
        name: string;
        appType: string;
        platform?: string;
        launchUri?: string;
        baseUrl: string;
        healthPath: string;
        defaultMethod: string;
      }>;
      activeVoice: string;
      preset: string;
    },
    stateOut: {
      toolsUsed: string[];
      addedMemories: Array<{ category: string; content: string }>;
      launchActions: Array<{
        id: string;
        name: string;
        launchUri: string;
        fallbackUri?: string;
        query?: string;
        autoClick?: boolean;
        platform?: string;
      }>;
      appStatusUpdates: Array<{
        kind: 'published' | 'connected';
        identifier: string;
        status: 'active' | 'paused';
      }>;
      nextVoice?: string;
      nextVoiceStyle?: string;
      nextPreset?: string;
    }
  ) {
    return Promise.all(
      calls.map(async (call) => {
        const name = call.name || 'unknown';
        stateOut.toolsUsed.push(name);
        const args = (call.args || {}) as Record<string, unknown>;

        if (name === 'save_memory') {
          const category = String(args.category || 'contexto');
          const content = String(args.content || '').trim();
          if (content) stateOut.addedMemories.push({ category, content });
          return {
            functionResponse: {
              id: call.id,
              name,
              response: { saved: Boolean(content), category, content },
            },
          };
        }

        if (name === 'search_memory') {
          const q = String(args.query || '').toLowerCase();
          const matches = ctx.memories.filter(
            (m) =>
              m.content.toLowerCase().includes(q) ||
              m.category.toLowerCase().includes(q)
          );
          return {
            functionResponse: {
              id: call.id,
              name,
              response: { matches },
            },
          };
        }

        if (name === 'switch_voice') {
          const v = String(args.voiceId || 'Charon');
          if (VALID_VOICES.includes(v as (typeof VALID_VOICES)[number])) {
            stateOut.nextVoice = v;
          }
          if (typeof args.style === 'string' && args.style.trim()) {
            stateOut.nextVoiceStyle = args.style.trim();
          }
          return {
            functionResponse: {
              id: call.id,
              name,
              response: {
                switched: Boolean(stateOut.nextVoice),
                voiceId: stateOut.nextVoice || ctx.activeVoice,
              },
            },
          };
        }

        if (name === 'switch_preset') {
          stateOut.nextPreset = String(args.presetId || ctx.preset);
          return {
            functionResponse: {
              id: call.id,
              name,
              response: { switched: true, presetId: stateOut.nextPreset },
            },
          };
        }

        if (name === 'list_user_apps') {
          return {
            functionResponse: {
              id: call.id,
              name,
              response: {
                publishedApps: ctx.publishedApps,
                connectedApps: ctx.connectedApps,
              },
            },
          };
        }

        if (name === 'toggle_app_status') {
          const kind = args.kind === 'connected' ? 'connected' : 'published';
          const identifier = String(args.identifier || '');
          const status = args.status === 'paused' ? 'paused' : 'active';
          if (identifier) {
            stateOut.appStatusUpdates.push({ kind, identifier, status });
          }
          return {
            functionResponse: {
              id: call.id,
              name,
              response: { updated: Boolean(identifier), kind, identifier, status },
            },
          };
        }

        if (name === 'execute_connected_app') {
          const key = String(args.appIdOrName || '').toLowerCase();
          const target = ctx.connectedApps.find(
            (c) => c.id.toLowerCase() === key || c.name.toLowerCase().includes(key)
          );
          if (!target) {
            return {
              functionResponse: {
                id: call.id,
                name,
                response: { ok: false, error: 'Aplicación conectada no encontrada.' },
              },
            };
          }
          try {
            const subPath = String(args.path || target.healthPath || '');
            const url = resolveSafeAppUrl(target.baseUrl, subPath);
            const method = String(args.method || target.defaultMethod || 'GET').toUpperCase();
            const upstream = await fetch(url, {
              method,
              signal: AbortSignal.timeout(8000),
            });
            const text = (await upstream.text()).slice(0, 3000);
            return {
              functionResponse: {
                id: call.id,
                name,
                response: { ok: upstream.ok, status: upstream.status, body: text },
              },
            };
          } catch (err) {
            return {
              functionResponse: {
                id: call.id,
                name,
                response: {
                  ok: false,
                  error: err instanceof Error ? err.message : 'Error de red',
                },
              },
            };
          }
        }

        if (name === 'read_web_page') {
          try {
            const extracted = await fetchAndExtractWebPage(String(args.url || ''));
            return {
              functionResponse: {
                id: call.id,
                name,
                response: {
                  title: extracted.title,
                  url: extracted.url,
                  excerpt: extracted.extractedText.slice(0, 4000),
                },
              },
            };
          } catch (err) {
            return {
              functionResponse: {
                id: call.id,
                name,
                response: {
                  ok: false,
                  error: err instanceof Error ? err.message : 'No se pudo leer la URL',
                },
              },
            };
          }
        }

        if (name === 'launch_device_app') {
          const resolved = resolveDeviceAppLaunch(
            {
              appIdOrName: String(args.appIdOrName || ''),
              query: typeof args.query === 'string' ? args.query : undefined,
              preferWeb: Boolean(args.preferWeb),
            },
            ctx.connectedApps
          );
          if (!resolved.ok || !resolved.action) {
            return {
              functionResponse: {
                id: call.id,
                name,
                response: {
                  ok: false,
                  error:
                    resolved.error ||
                    'No encontré esa aplicación en tu lista de dispositivo.',
                },
              },
            };
          }

          stateOut.launchActions.push(resolved.action);
          return {
            functionResponse: {
              id: call.id,
              name,
              response: {
                ok: true,
                name: resolved.action.name,
                launchUri: resolved.action.launchUri,
                fallbackUri: resolved.action.fallbackUri,
                autoClickTriggered: true,
                note: 'Clic automático enviado para abrir la aplicación y accesos listos en pantalla.',
              },
            },
          };
        }

        return {
          functionResponse: {
            id: call.id,
            name,
            response: { ok: false },
          },
        };
      })
    );
  }

  // Chat + Tool Execution + Grounding (Non-streaming JSON)
  app.post('/api/jarvis/chat', async (req, res) => {
    const startTime = Date.now();
    try {
      const setup = prepareChatSetup(req.body as ChatRequestPayload);
      if (!setup.rawMessage && setup.validAttachments.length === 0) {
        res.status(400).json({ error: 'El mensaje o una imagen no pueden estar vacíos.' });
        return;
      }

      const ai = getAiClient();
      let { result: response, modelUsed } = await callWithRetryAndFallback(
        setup.chatModelChain,
        (model) =>
          ai.models.generateContent({
            model,
            contents: setup.contents,
            config: setup.buildConfigForModel(model),
          })
      );

      const stateOut: {
        toolsUsed: string[];
        addedMemories: Array<{ category: string; content: string }>;
        launchActions: Array<{
          id: string;
          name: string;
          launchUri: string;
          fallbackUri?: string;
          query?: string;
          autoClick?: boolean;
          platform?: string;
        }>;
        appStatusUpdates: Array<{
          kind: 'published' | 'connected';
          identifier: string;
          status: 'active' | 'paused';
        }>;
        nextVoice?: string;
        nextVoiceStyle?: string;
        nextPreset?: string;
      } = {
        toolsUsed: [],
        addedMemories: [],
        launchActions: [],
        appStatusUpdates: [],
      };

      let totalPromptTokens = response.usageMetadata?.promptTokenCount ?? 0;
      let totalOutputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

      const currentContents = [...setup.contents];
      for (let round = 0; round < 3; round++) {
        const calls = response.functionCalls;
        if (!calls || calls.length === 0) break;
        const previousContent = response.candidates?.[0]?.content;
        if (!previousContent) break;

        const functionResponses = await executeJarvisToolCalls(calls, setup, stateOut);
        currentContents.push(previousContent);
        currentContents.push({
          role: 'user',
          parts: functionResponses,
        });

        const nextRes = await callWithRetryAndFallback(setup.chatModelChain, (model) =>
          ai.models.generateContent({
            model,
            contents: currentContents,
            config: setup.buildConfigForModel(model),
          })
        );
        response = nextRes.result;
        modelUsed = nextRes.modelUsed;
        totalPromptTokens += response.usageMetadata?.promptTokenCount ?? 0;
        totalOutputTokens += response.usageMetadata?.candidatesTokenCount ?? 0;
      }

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const seenUrls = new Set<string>();
      const sources = chunks
        .map((c) => {
          const web = (c as { web?: { title?: string; uri?: string } }).web;
          if (!web?.uri || seenUrls.has(web.uri)) return null;
          seenUrls.add(web.uri);
          return { title: web.title || web.uri, url: web.uri };
        })
        .filter((x): x is { title: string; url: string } => x !== null);

      res.json({
        reply: (response.text ?? '').trim() || 'Listo.',
        modelUsed,
        latencyMs: Date.now() - startTime,
        promptTokens: totalPromptTokens,
        outputTokens: totalOutputTokens,
        toolsUsed: Array.from(new Set(stateOut.toolsUsed)),
        addedMemories: stateOut.addedMemories,
        appStatusUpdates: stateOut.appStatusUpdates,
        launchActions: stateOut.launchActions,
        nextVoice: stateOut.nextVoice,
        nextVoiceStyle: stateOut.nextVoiceStyle,
        nextPreset: stateOut.nextPreset,
        sources,
      });
    } catch (err) {
      const parsed = parseGeminiError(err);
      res.status(parsed.statusCode).json({ error: parsed.userMessage });
    }
  });

  // Real-time Streaming Chat via SSE (Near-instant first token)
  app.post('/api/jarvis/chat-stream', async (req, res) => {
    const startTime = Date.now();
    try {
      const setup = prepareChatSetup(req.body as ChatRequestPayload);
      if (!setup.rawMessage && setup.validAttachments.length === 0) {
        res.status(400).json({ error: 'El mensaje o una imagen no pueden estar vacíos.' });
        return;
      }

      const ai = getAiClient();
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      let closed = false;
      res.on('close', () => {
        if (!res.writableFinished) {
          closed = true;
        }
      });

      const sendEvent = (payload: Record<string, unknown>) => {
        if (!closed && !res.writableEnded) {
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        }
      };

      const stateOut: {
        toolsUsed: string[];
        addedMemories: Array<{ category: string; content: string }>;
        launchActions: Array<{
          id: string;
          name: string;
          launchUri: string;
          fallbackUri?: string;
          query?: string;
          autoClick?: boolean;
          platform?: string;
        }>;
        appStatusUpdates: Array<{
          kind: 'published' | 'connected';
          identifier: string;
          status: 'active' | 'paused';
        }>;
        nextVoice?: string;
        nextVoiceStyle?: string;
        nextPreset?: string;
      } = {
        toolsUsed: [],
        addedMemories: [],
        launchActions: [],
        appStatusUpdates: [],
      };

      let totalPromptTokens = 0;
      let totalOutputTokens = 0;
      let finalModelUsed = setup.chatModelChain[0].model;
      let fullReply = '';
      let firstTokenMs: number | undefined;
      const groundingChunksAll: Array<{ web?: { title?: string; uri?: string } }> = [];

      const streamSingleRound = async (roundContents: Content[]) => {
        let lastErr: unknown;
        for (const step of setup.chatModelChain) {
          if (closed) return null;
          let streamedAnyDelta = false;
          const ac = new AbortController();
          try {
            const cfg = setup.buildConfigForModel(step.model);
            const stream = await withTimeout(
              ai.models.generateContentStream({
                model: step.model,
                contents: roundContents,
                config: { ...cfg, abortSignal: ac.signal },
              }),
              step.timeoutMs,
              step.model
            );

            let roundText = '';
            const roundParts: Array<Record<string, unknown>> = [];
            const roundCalls: Array<{
              id?: string;
              name?: string;
              args?: Record<string, unknown>;
            }> = [];
            let roundPromptTokens = 0;
            let roundOutputTokens = 0;

            const iterator = stream[Symbol.asyncIterator]();
            while (true) {
              if (closed) {
                ac.abort();
                break;
              }
              const chunkWaitMs = streamedAnyDelta ? 12000 : step.timeoutMs;
              const nextStep = await withTimeout(
                iterator.next(),
                chunkWaitMs,
                step.model
              );
              if (nextStep.done) break;
              const chunk = nextStep.value;

              let deltaText = '';
              const candParts = chunk.candidates?.[0]?.content?.parts;
              if (Array.isArray(candParts)) {
                for (const part of candParts) {
                  roundParts.push(part as Record<string, unknown>);
                  const p = part as { text?: string; thought?: boolean; functionCall?: unknown };
                  if (typeof p.text === 'string' && p.text.length > 0 && !p.thought) {
                    deltaText += p.text;
                  }
                }
              } else if (typeof chunk.text === 'string' && chunk.text.length > 0) {
                deltaText = chunk.text;
              }

              if (Array.isArray(chunk.functionCalls) && chunk.functionCalls.length > 0) {
                for (const fc of chunk.functionCalls) {
                  roundCalls.push(fc);
                }
              }
              const gChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
              if (Array.isArray(gChunks)) {
                for (const gc of gChunks) {
                  groundingChunksAll.push(gc as { web?: { title?: string; uri?: string } });
                }
              }
              if (chunk.usageMetadata?.promptTokenCount) {
                roundPromptTokens = chunk.usageMetadata.promptTokenCount;
              }
              if (chunk.usageMetadata?.candidatesTokenCount) {
                roundOutputTokens = chunk.usageMetadata.candidatesTokenCount;
              }

              if (deltaText) {
                if (firstTokenMs === undefined) {
                  firstTokenMs = Date.now() - startTime;
                }
                streamedAnyDelta = true;
                roundText += deltaText;
                sendEvent({ delta: deltaText });
              }
            }

            finalModelUsed = step.model;
            totalPromptTokens += roundPromptTokens;
            totalOutputTokens += roundOutputTokens;

            return {
              roundText,
              roundParts,
              roundCalls,
            };
          } catch (err) {
            ac.abort();
            lastErr = err;
            if (streamedAnyDelta) {
              throw err;
            }
          }
        }
        throw lastErr || new Error('No se pudo completar la respuesta.');
      };

      const directIntent =
        setup.validAttachments.length === 0
          ? detectDirectAppLaunchIntent(setup.rawMessage, setup.connectedApps)
          : null;

      if (directIntent) {
        const directResolved = resolveDeviceAppLaunch(directIntent, setup.connectedApps);
        if (directResolved.ok && directResolved.action) {
          stateOut.toolsUsed.push('launch_device_app');
          stateOut.launchActions.push(directResolved.action);
          const instantReply = directResolved.action.query
            ? `Listo, abriendo "${directResolved.action.query}" en ${directResolved.action.name}.`
            : `Listo, haciendo clic para abrir ${directResolved.action.name}.`;
          sendEvent({ delta: instantReply });
          sendEvent({
            done: true,
            reply: instantReply,
            modelUsed: 'instant-action-router',
            latencyMs: Date.now() - startTime,
            firstTokenMs: Date.now() - startTime,
            promptTokens: 0,
            outputTokens: 0,
            toolsUsed: ['launch_device_app'],
            addedMemories: [],
            appStatusUpdates: [],
            launchActions: stateOut.launchActions,
            sources: [],
          });
          return;
        }
      }

      const currentContents = [...setup.contents];
      for (let round = 0; round < 3; round++) {
        const roundRes = await streamSingleRound(currentContents);
        if (!roundRes || closed) break;
        if (roundRes.roundText) {
          fullReply += roundRes.roundText;
        }
        if (roundRes.roundCalls.length === 0) {
          break;
        }

        const functionResponses = await executeJarvisToolCalls(
          roundRes.roundCalls,
          setup,
          stateOut
        );
        const modelParts =
          roundRes.roundParts.length > 0
            ? (roundRes.roundParts as Content['parts'])
            : (roundRes.roundCalls.map((fc) => ({ functionCall: fc })) as Content['parts']);
        currentContents.push({
          role: 'model',
          parts: modelParts,
        });
        currentContents.push({
          role: 'user',
          parts: functionResponses,
        });
      }

      if (!closed) {
        const seenUrls = new Set<string>();
        const sources = groundingChunksAll
          .map((c) => {
            const web = c.web;
            if (!web?.uri || seenUrls.has(web.uri)) return null;
            seenUrls.add(web.uri);
            return { title: web.title || web.uri, url: web.uri };
          })
          .filter((x): x is { title: string; url: string } => x !== null);

        sendEvent({
          done: true,
          reply: fullReply.trim() || 'Listo.',
          modelUsed: finalModelUsed,
          latencyMs: Date.now() - startTime,
          firstTokenMs: firstTokenMs ?? Date.now() - startTime,
          promptTokens: totalPromptTokens,
          outputTokens: totalOutputTokens,
          toolsUsed: Array.from(new Set(stateOut.toolsUsed)),
          addedMemories: stateOut.addedMemories,
          appStatusUpdates: stateOut.appStatusUpdates,
          launchActions: stateOut.launchActions,
          nextVoice: stateOut.nextVoice,
          nextVoiceStyle: stateOut.nextVoiceStyle,
          nextPreset: stateOut.nextPreset,
          sources,
        });
      }
    } catch (err) {
      const parsed = parseGeminiError(err);
      if (!res.headersSent) {
        res.status(parsed.statusCode).json({ error: parsed.userMessage });
      } else if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: parsed.userMessage })}\n\n`);
      }
    } finally {
      if (res.headersSent && !res.writableEnded) {
        res.end();
      }
    }
  });

  // Neural TTS (Single WAV)
  app.post('/api/jarvis/tts', async (req, res) => {
    const startTime = Date.now();
    try {
      const {
        text,
        voiceName = 'Charon',
        style = '',
        ttsModel = 'gemini-3.8-flash-lite-tts',
      } = req.body as {
        text: string;
        voiceName?: string;
        style?: string;
        ttsModel?: string;
      };

      if (!text || !text.trim()) {
        res.status(400).json({ error: 'Se requiere texto para sintetizar audio.' });
        return;
      }

      const selectedVoice = VALID_VOICES.includes(
        voiceName as (typeof VALID_VOICES)[number]
      )
        ? voiceName
        : 'Charon';
      const selectedModel =
        ttsModel === 'gemini-3.8-flash-tts'
          ? 'gemini-3.8-flash-tts'
          : 'gemini-3.8-flash-lite-tts';
      const alternateModel =
        selectedModel === 'gemini-3.8-flash-lite-tts'
          ? 'gemini-3.8-flash-tts'
          : 'gemini-3.8-flash-lite-tts';

      const cleanedText = text
        .replace(/```[\s\S]*?```/g, ' bloque de código omitido en lectura. ')
        .replace(/[#*_`>]/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1400);

      const ai = getAiClient('v1beta');
      const part: Record<string, unknown> = { text: cleanedText };
      if (style && style.trim()) {
        part.speechMetadata = { style: style.trim() };
      }

      const { result: response, modelUsed } = await callWithRetryAndFallback(
        [
          { model: selectedModel, retries: 1, timeoutMs: 25000 },
          { model: alternateModel, retries: 1, timeoutMs: 25000 },
        ],
        (model) =>
          ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [part] }],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: selectedVoice },
                },
              },
            },
          })
      );

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({ error: 'El modelo TTS no devolvió audio.' });
        return;
      }

      res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
        voiceName: selectedVoice,
        model: modelUsed,
        latencyMs: Date.now() - startTime,
        promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      });
    } catch (err) {
      const parsed = parseGeminiError(err);
      res.status(parsed.statusCode).json({ error: parsed.userMessage });
    }
  });

  // Streaming Neural TTS (SSE raw PCM 24kHz)
  app.post('/api/jarvis/tts-stream', async (req, res) => {
    const startTime = Date.now();
    try {
      const {
        text,
        voiceName = 'Charon',
        style = '',
        ttsModel = 'gemini-3.8-flash-lite-tts',
      } = req.body as {
        text: string;
        voiceName?: string;
        style?: string;
        ttsModel?: string;
      };

      if (!text || !text.trim()) {
        res.status(400).json({ error: 'Se requiere texto para sintetizar audio.' });
        return;
      }

      const selectedVoice = VALID_VOICES.includes(
        voiceName as (typeof VALID_VOICES)[number]
      )
        ? voiceName
        : 'Charon';
      const selectedModel =
        ttsModel === 'gemini-3.8-flash-tts'
          ? 'gemini-3.8-flash-tts'
          : 'gemini-3.8-flash-lite-tts';
      const alternateModel =
        selectedModel === 'gemini-3.8-flash-lite-tts'
          ? 'gemini-3.8-flash-tts'
          : 'gemini-3.8-flash-lite-tts';

      const cleanedText = text
        .replace(/```[\s\S]*?```/g, ' bloque de código omitido en lectura. ')
        .replace(/[#*_`>]/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1400);

      const ai = getAiClient('v1beta');
      const part: Record<string, unknown> = { text: cleanedText };
      if (style && style.trim()) {
        part.speechMetadata = { style: style.trim() };
      }

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      let clientDisconnected = false;
      res.on('close', () => {
        if (!res.writableFinished) clientDisconnected = true;
      });

      const sendEvent = (payload: Record<string, unknown>) => {
        if (!clientDisconnected && !res.writableEnded) {
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        }
      };

      let succeeded = false;
      let lastError: unknown;
      for (const model of [selectedModel, alternateModel]) {
        if (clientDisconnected) break;
        try {
          const stream = await withTimeout(
            ai.models.generateContentStream({
              model,
              contents: [{ role: 'user', parts: [part] }],
              config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: selectedVoice },
                  },
                },
              },
            }),
            12000,
            model
          );

          let chunkCount = 0;
          let promptTokens = 0;
          let outputTokens = 0;
          for await (const chunk of stream) {
            if (clientDisconnected) break;
            if (chunk.usageMetadata) {
              promptTokens = chunk.usageMetadata.promptTokenCount ?? promptTokens;
              outputTokens = chunk.usageMetadata.candidatesTokenCount ?? outputTokens;
            }
            const data = chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (data) {
              chunkCount++;
              sendEvent({ pcmBase64: data, model });
            }
          }

          if (chunkCount === 0 && !clientDisconnected) {
            throw new Error(`El modelo ${model} no emitió chunks de audio.`);
          }

          sendEvent({
            done: true,
            model,
            voiceName: selectedVoice,
            latencyMs: Date.now() - startTime,
            promptTokens,
            outputTokens,
          });
          succeeded = true;
          break;
        } catch (err) {
          lastError = err;
        }
      }

      if (!succeeded && !clientDisconnected) {
        const parsed = parseGeminiError(lastError);
        sendEvent({ error: parsed.userMessage, code: parsed.statusCode });
      }
      if (!res.writableEnded) res.end();
    } catch (err) {
      const parsed = parseGeminiError(err);
      if (!res.headersSent) {
        res.status(parsed.statusCode).json({ error: parsed.userMessage });
      } else if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: parsed.userMessage })}\n\n`);
        res.end();
      }
    }
  });

  // Audio Transcription (STT)
  app.post('/api/jarvis/transcribe', async (req, res) => {
    const startTime = Date.now();
    try {
      const { audioBase64, mimeType = 'audio/webm' } = req.body as {
        audioBase64: string;
        mimeType?: string;
      };
      if (!audioBase64) {
        res.status(400).json({ error: 'Se requiere audio para transcribir.' });
        return;
      }

      const ai = getAiClient();
      const { result: response, modelUsed } = await callWithRetryAndFallback(
        [
          { model: 'gemini-3.5-transcribe', retries: 2, timeoutMs: 20000 },
          { model: 'gemini-4-hydrogen', retries: 1, timeoutMs: 18000 },
        ],
        (model) =>
          ai.models.generateContent({
            model,
            contents: {
              parts: [
                { inlineData: { mimeType, data: audioBase64 } },
                {
                  text: 'Transcribe el audio fielmente en su idioma original con puntuación natural. Devuelve únicamente el texto transcrito.',
                },
              ],
            },
          })
      );

      res.json({
        text: (response.text ?? '').trim(),
        model: modelUsed,
        latencyMs: Date.now() - startTime,
        promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      });
    } catch (err) {
      const parsed = parseGeminiError(err);
      res.status(parsed.statusCode).json({ error: parsed.userMessage });
    }
  });

  const GITHUB_IGNORE_DIR_REGEX =
    /(^|\/)(node_modules|\.git|dist|build|\.next|\.nuxt|out|coverage|\.venv|venv|__pycache__|target|vendor)(\/|$)/i;
  const GITHUB_BINARY_EXT_REGEX =
    /\.(png|jpe?g|gif|webp|ico|bmp|svgz|woff2?|ttf|eot|otf|mp3|wav|ogg|mp4|webm|mov|zip|tar|gz|7z|rar|pdf|exe|dll|so|dylib|class|jar|pyc|wasm|lock)$/i;
  const GITHUB_LOCKFILE_REGEX =
    /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|composer\.lock|Cargo\.lock|poetry\.lock)$/i;

  function parseGithubRepoUrl(rawInput: string): {
    owner: string;
    repo: string;
    branch?: string;
    subpath?: string;
  } {
    let cleaned = rawInput.trim();
    if (!cleaned) {
      throw new Error('Ingresa la URL de un repositorio público de GitHub.');
    }
    if (!/^https?:\/\//i.test(cleaned) && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/.test(cleaned)) {
      cleaned = `https://github.com/${cleaned}`;
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(cleaned);
    } catch {
      throw new Error('URL de GitHub inválida. Usa el formato https://github.com/usuario/repositorio.');
    }
    if (
      parsedUrl.hostname !== 'github.com' &&
      parsedUrl.hostname !== 'www.github.com'
    ) {
      throw new Error('La URL debe pertenecer a github.com.');
    }
    const parts = parsedUrl.pathname
      .replace(/^\/+|\/+$/g, '')
      .split('/')
      .filter(Boolean);
    if (parts.length < 2) {
      throw new Error('La URL debe incluir usuario y repositorio (ej. https://github.com/usuario/repo).');
    }
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, '');
    const validSlug = /^[A-Za-z0-9_.-]+$/;
    if (!validSlug.test(owner) || !validSlug.test(repo)) {
      throw new Error('Nombre de usuario o repositorio de GitHub inválido.');
    }

    let branch: string | undefined;
    let subpath: string | undefined;
    if (parts.length >= 4 && (parts[2] === 'tree' || parts[2] === 'blob')) {
      branch = decodeURIComponent(parts[3]);
      if (parts.length > 4) {
        subpath = parts.slice(4).map((p) => decodeURIComponent(p)).join('/');
      }
    }
    return { owner, repo, branch, subpath };
  }

  function scoreGithubFilePath(filePath: string, preferredSubpath?: string): number {
    const lower = filePath.toLowerCase();
    let score = 0;

    if (preferredSubpath) {
      if (filePath === preferredSubpath) score += 200;
      else if (filePath.startsWith(`${preferredSubpath}/`)) score += 80;
    }

    if (lower === 'package.json') score += 120;
    else if (lower === 'readme.md' || lower === 'readme') score += 110;
    else if (lower === 'index.html' || lower === 'public/index.html') score += 105;
    else if (lower === 'metadata.json') score += 95;
    else if (
      /^(src\/)?(app|main|index)\.(tsx|ts|jsx|js|vue|svelte|py)$/i.test(filePath) ||
      /^app\/(page|layout)\.(tsx|ts|jsx|js)$/i.test(filePath)
    ) {
      score += 100;
    } else if (/^(server|api|app|main)\.(ts|js|py|go)$/i.test(filePath)) {
      score += 90;
    } else if (/^src\/(components|pages|views|routes|hooks|lib|types|utils)\//i.test(filePath)) {
      score += 75;
    } else if (/^(components|pages|app|src|lib)\//i.test(filePath)) {
      score += 65;
    }

    if (/\.(tsx|jsx|ts|js|html|css|vue|svelte|py)$/i.test(lower)) score += 25;
    else if (/\.(json|md|yml|yaml|toml)$/i.test(lower)) score += 10;

    if (/(\.test\.|\.spec\.|__tests__|eslint|tsconfig|prettier|gitignore)/i.test(lower)) {
      score -= 40;
    }

    const depth = filePath.split('/').length;
    score -= Math.max(0, depth - 2) * 4;
    return score;
  }

  async function fetchRawGithubFile(
    owner: string,
    repo: string,
    branch: string,
    filePath: string
  ): Promise<string | null> {
    const encodedPath = filePath
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(
      repo
    )}/${encodeURIComponent(branch)}/${encodedPath}`;
    try {
      const resp = await fetch(rawUrl, {
        headers: { 'User-Agent': 'jarvis-smart-core' },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return null;
      const text = await resp.text();
      if (!text || text.includes('\u0000')) return null;
      return text;
    } catch {
      return null;
    }
  }

  // GitHub Repository Inspector for Constructor
  app.post('/api/jarvis/github/inspect', async (req, res) => {
    const startTime = Date.now();
    try {
      const { repoUrl = '' } = req.body as { repoUrl?: string };
      const parsed = parseGithubRepoUrl(repoUrl);
      const { owner, repo } = parsed;
      const fullName = `${owner}/${repo}`;
      const canonicalRepoUrl = `https://github.com/${owner}/${repo}`;

      const ghHeaders: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'jarvis-smart-core',
      };

      let branch = parsed.branch || '';
      let description = '';
      let language = '';
      let stars = 0;
      let topics: string[] = [];
      let allTreePaths: string[] = [];
      let usedFallback = false;

      const metaResp = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        { headers: ghHeaders, signal: AbortSignal.timeout(10000) }
      );

      if (metaResp.status === 404) {
        res.status(404).json({
          error:
            'Repositorio no encontrado o privado. Verifica que la URL sea correcta y el repo sea público.',
        });
        return;
      }

      if (metaResp.ok) {
        const meta = (await metaResp.json()) as {
          default_branch?: string;
          description?: string;
          language?: string;
          stargazers_count?: number;
          topics?: string[];
        };
        if (!branch) branch = meta.default_branch || 'main';
        description = meta.description || '';
        language = meta.language || '';
        stars = meta.stargazers_count || 0;
        topics = Array.isArray(meta.topics) ? meta.topics : [];

        const treeResp = await fetch(
          `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
            repo
          )}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
          { headers: ghHeaders, signal: AbortSignal.timeout(12000) }
        );

        if (treeResp.ok) {
          const treeData = (await treeResp.json()) as {
            tree?: Array<{ path?: string; type?: string; size?: number }>;
          };
          allTreePaths = (treeData.tree || [])
            .filter(
              (entry) =>
                entry.type === 'blob' &&
                typeof entry.path === 'string' &&
                !GITHUB_IGNORE_DIR_REGEX.test(entry.path) &&
                !GITHUB_BINARY_EXT_REGEX.test(entry.path) &&
                !GITHUB_LOCKFILE_REGEX.test(entry.path) &&
                (entry.size ?? 0) <= 180000
            )
            .map((entry) => entry.path as string);
        }
      } else {
        // Fallback via raw.githubusercontent.com if GitHub REST API is rate-limited (403/429)
        usedFallback = true;
        const candidateBranches = branch ? [branch] : ['main', 'master'];
        for (const cand of candidateBranches) {
          const probeReadme = await fetchRawGithubFile(owner, repo, cand, 'README.md');
          const probePkg = await fetchRawGithubFile(owner, repo, cand, 'package.json');
          if (probeReadme !== null || probePkg !== null) {
            branch = cand;
            break;
          }
        }
        if (!branch) {
          res.status(metaResp.status === 403 || metaResp.status === 429 ? 429 : 502).json({
            error:
              'GitHub API alcanzó el límite temporal de consultas o rechazó la lectura. Intenta de nuevo en unos minutos.',
          });
          return;
        }
        allTreePaths = [
          parsed.subpath || '',
          'README.md',
          'package.json',
          'index.html',
          'src/App.tsx',
          'src/App.jsx',
          'src/main.tsx',
          'src/index.css',
          'app/page.tsx',
          'app/layout.tsx',
          'server.ts',
          'index.js',
          'app.py',
        ].filter(Boolean);
      }

      const rankedPaths = [...allTreePaths]
        .sort(
          (a, b) =>
            scoreGithubFilePath(b, parsed.subpath) - scoreGithubFilePath(a, parsed.subpath)
        )
        .slice(0, 22);

      const rawResults = await Promise.all(
        rankedPaths.map(async (filePath) => {
          const content = await fetchRawGithubFile(owner, repo, branch, filePath);
          if (content === null) return null;
          return {
            path: filePath,
            size: content.length,
            content: content.slice(0, 14000),
          };
        })
      );

      const loadedFiles: Array<{ path: string; size: number; content: string }> = [];
      let charBudget = 0;
      for (const item of rawResults) {
        if (!item) continue;
        if (charBudget + item.content.length > 72000 && loadedFiles.length >= 4) break;
        loadedFiles.push(item);
        charBudget += item.content.length;
      }

      if (loadedFiles.length === 0) {
        res.status(404).json({
          error:
            'No se pudieron descargar archivos fuente legibles de este repositorio.',
        });
        return;
      }

      res.json({
        owner,
        repo,
        fullName,
        repoUrl: canonicalRepoUrl,
        branch: branch || 'main',
        subpath: parsed.subpath,
        description,
        language,
        stars,
        topics,
        totalTreeFiles: allTreePaths.length,
        treePaths: allTreePaths.slice(0, 150),
        files: loadedFiles,
        usedFallback,
        latencyMs: Date.now() - startTime,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'No se pudo inspeccionar el repositorio.',
      });
    }
  });

  // Prompt-to-App & Repo-to-App Generator
  app.post('/api/jarvis/generate-app', async (req, res) => {
    const startTime = Date.now();
    try {
      const {
        prompt = '',
        currentHtml = '',
        designStyle = 'editorial-suiza',
        engineRoute = 'local-first-hybrid',
        repoContext,
      } = req.body as {
        prompt?: string;
        currentHtml?: string;
        designStyle?: string;
        engineRoute?: string;
        repoContext?: {
          fullName?: string;
          repoUrl?: string;
          branch?: string;
          description?: string;
          language?: string;
          treePaths?: string[];
          files?: Array<{ path: string; content: string }>;
        };
      };

      const hasRepo = Boolean(
        repoContext && Array.isArray(repoContext.files) && repoContext.files.length > 0
      );

      if ((!prompt || !prompt.trim()) && !hasRepo) {
        res.status(400).json({
          error: 'Describe la aplicación que quieres crear o carga un repositorio de GitHub.',
        });
        return;
      }

      const ai = getAiClient();
      const designDirectionMap: Record<string, string> = {
        'editorial-suiza':
          'Dirección de arte EDITORIAL SUIZA: fondo papel cálido (#FAFAF8) o blanco puro (#FFFFFF), tinta grafito (#111827), un único acento azul cobalto (#1D4ED8), tipografía Plus Jakarta Sans + DM Sans + JetBrains Mono vía Google Fonts, rejilla asimétrica estricta, líneas finas de 1px (#E5E7EB).',
        'revista-lujo':
          'Dirección de arte REVISTA / LUJO SILENCIOSO: fondo marfil suave (#F7F5F0), tinta negro carbón (#141413), acento verde bosque profundo (#14532D), tipografía Fraunces / Playfair Display y Source Serif 4 / DM Sans, espaciado generoso.',
        'producto-saas':
          'Dirección de arte PRODUCTO SAAS SOBRIO: superficie neutra (#F8FAFC / #FFFFFF), bordes nítidos de 1px (#E2E8F0), tipografía Manrope + Public Sans + JetBrains Mono con tabular-nums obligatorio en métricas, tablas de alta legibilidad.',
        'estudio-creativo':
          'Dirección de arte ESTUDIO CREATIVO CONTEMPORÁNEO: contraste editorial claro u oscuro refinado (#0F1115 o #F4F4F0), tipografía Outfit + DM Sans, bloques asimétricos con líneas divisorias precisas.',
      };

      const selectedDirection =
        designDirectionMap[designStyle] || designDirectionMap['editorial-suiza'];

      const appBuilderInstruction = [
        'Eres un director de arte senior y arquitecto frontend en Jarvis.',
        'Genera una aplicación web HTML5 completa, funcional e interactiva en un único documento autocontenido (<!doctype html>...</html>).',
        selectedDirection,
        hasRepo
          ? 'MODO REALIZACIÓN DE REPOSITORIO GITHUB: Analiza a fondo la estructura, pantallas, componentes, flujos, reglas de negocio, datos y marca del repositorio entregado y REALIZA una implementación web en vivo fiel, completa y 100% utilizable en navegador sin depender de build local ni imports de archivos externos.'
          : '',
        'REGLAS ESTRICTAS DE DISEÑO E IMPLEMENTACIÓN:',
        '- Carga Google Fonts acordes a la dirección de arte (evita Inter y Roboto).',
        '- Evita gradientes morados/neón, puntos decorativos parpadeantes, bordes gruesos border-l-4 o puntajes inventados.',
        '- Usa Tailwind CSS vía CDN (<script src="https://cdn.tailwindcss.com"></script>) y JavaScript limpio autocontenido (sin import/export relativos rotos ni JSX sin compilar) para que toda la interactividad funcione al instante en iframe.',
        '- Nunca uses alert() ni confirm() del navegador ni URLs de imágenes externas rotas. Idioma: español (salvo nombres propios del repo).',
      ]
        .filter(Boolean)
        .join('\n');

      let repoPromptBlock = '';
      if (hasRepo && repoContext) {
        const treePreview = (repoContext.treePaths || []).slice(0, 120).join('\n');
        let filesSection = '';
        let budget = 0;
        for (const f of repoContext.files || []) {
          if (!f?.path || !f?.content) continue;
          const snippet = f.content.slice(0, 12000);
          if (budget + snippet.length > 64000) break;
          filesSection += `\n--- ARCHIVO: ${f.path} ---\n${snippet}\n`;
          budget += snippet.length;
        }
        repoPromptBlock = [
          `REPOSITORIO DE GITHUB: ${repoContext.fullName || 'repo'} (${repoContext.repoUrl || ''})`,
          `Rama: ${repoContext.branch || 'main'} | Lenguaje principal: ${repoContext.language || 'N/A'}`,
          repoContext.description ? `Descripción: ${repoContext.description}` : '',
          treePreview ? `ÁRBOL DE ARCHIVOS:\n${treePreview}` : '',
          `CÓDIGO FUENTE EXTRAÍDO:${filesSection}`,
        ]
          .filter(Boolean)
          .join('\n\n');
      }

      const effectivePrompt =
        prompt.trim() ||
        'Realiza fielmente todas las pantallas, funciones y lógica principal de este repositorio en una aplicación web interactiva completa.';

      const userContent = currentHtml.trim()
        ? `Aplica estos cambios manteniendo el diseño profesional limpio:\n\nSOLICITUD:\n${effectivePrompt}\n\n${
            repoPromptBlock ? `${repoPromptBlock}\n\n` : ''
          }CÓDIGO HTML ACTUAL:\n${currentHtml.slice(0, 80000)}`
        : hasRepo
        ? `Lee este repositorio de GitHub y realiza su aplicación web completa y funcional:\n\nINSTRUCCIONES DEL USUARIO:\n${effectivePrompt}\n\n${repoPromptBlock}`
        : `Crea una aplicación web completa y funcional basada en este prompt:\n\n${effectivePrompt}`;

      const timeoutMs = hasRepo ? 40000 : 22000;
      const modelChain =
        engineRoute === 'cloud-reasoning'
          ? [
              { model: 'gemini-4-hydrogen', retries: 0, timeoutMs: 8000 },
              { model: 'gemini-3.1-flash-lite', retries: 1, timeoutMs },
            ]
          : [
              { model: 'gemini-3.1-flash-lite', retries: 1, timeoutMs },
              { model: 'gemini-4-hydrogen', retries: 0, timeoutMs: 15000 },
            ];

      const { result: response, modelUsed } = await callWithRetryAndFallback(
        modelChain,
        (model) =>
          ai.models.generateContent({
            model,
            contents: userContent,
            config: {
              systemInstruction: appBuilderInstruction,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  suggestedSlug: { type: Type.STRING },
                  htmlCode: { type: Type.STRING },
                },
                required: ['title', 'summary', 'suggestedSlug', 'htmlCode'],
              },
              ...(model === 'gemini-4-hydrogen'
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
            },
          })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        title?: string;
        summary?: string;
        suggestedSlug?: string;
        htmlCode?: string;
      };

      if (!parsed.htmlCode || parsed.htmlCode.length < 20) {
        throw new Error('No se pudo generar el código HTML de la aplicación.');
      }

      const cleanSlug = (parsed.suggestedSlug || parsed.title || 'mi-app')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);

      res.json({
        title: (parsed.title || 'Aplicación Jarvis').slice(0, 120),
        summary: (parsed.summary || 'Aplicación web generada a partir de prompt.').slice(0, 300),
        suggestedSlug:
          cleanSlug.length >= 3
            ? `${cleanSlug}-${Math.random().toString(36).slice(2, 6)}`
            : `app-${Math.random().toString(36).slice(2, 7)}`,
        htmlCode: parsed.htmlCode,
        model: modelUsed,
        latencyMs: Date.now() - startTime,
        promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      });
    } catch (err) {
      const parsed = parseGeminiError(err);
      res.status(parsed.statusCode).json({ error: parsed.userMessage });
    }
  });

  // Design Audit & AI-Slop Refiner
  app.post('/api/jarvis/design/audit', async (req, res) => {
    const startTime = Date.now();
    try {
      const { htmlCode = '', designStyle = 'editorial-suiza' } = req.body as {
        htmlCode: string;
        designStyle?: string;
      };
      if (!htmlCode.trim()) {
        res.status(400).json({ error: 'Se requiere código HTML para auditar.' });
        return;
      }

      const ai = getAiClient();
      const { result: response, modelUsed } = await callWithRetryAndFallback(
        [
          { model: 'gemini-3.1-flash-lite', retries: 1, timeoutMs: 22000 },
          { model: 'gemini-4-hydrogen', retries: 0, timeoutMs: 12000 },
        ],
        (model) =>
          ai.models.generateContent({
            model,
            contents: [
              `Eres un director de arte editorial auditando una web con estilo objetivo "${designStyle}".`,
              'Detecta cualquier cliché visual de IA (gradientes morados/neón, pills excesivos, puntos decorativos, tipografía genérica, tarjetas anidadas) y devuelve una versión HTML refinada con Google Fonts acordes y 100% de la funcionalidad intacta.',
              `HTML ACTUAL:\n${htmlCode.slice(0, 75000)}`,
            ].join('\n\n'),
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  scoreLabel: { type: Type.STRING },
                  typographyPairing: { type: Type.STRING },
                  aiTellsFound: { type: Type.ARRAY, items: { type: Type.STRING } },
                  improvementsApplied: { type: Type.ARRAY, items: { type: Type.STRING } },
                  refinedHtml: { type: Type.STRING },
                },
                required: [
                  'scoreLabel',
                  'typographyPairing',
                  'aiTellsFound',
                  'improvementsApplied',
                  'refinedHtml',
                ],
              },
              ...(model === 'gemini-4-hydrogen'
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
            },
          })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        scoreLabel?: string;
        typographyPairing?: string;
        aiTellsFound?: string[];
        improvementsApplied?: string[];
        refinedHtml?: string;
      };

      res.json({
        scoreLabel: parsed.scoreLabel || 'Diseño editorial refinado',
        typographyPairing: parsed.typographyPairing || 'Plus Jakarta Sans + DM Sans',
        aiTellsFound: Array.isArray(parsed.aiTellsFound) ? parsed.aiTellsFound : [],
        improvementsApplied: Array.isArray(parsed.improvementsApplied)
          ? parsed.improvementsApplied
          : [],
        refinedHtml: parsed.refinedHtml || htmlCode,
        model: modelUsed,
        latencyMs: Date.now() - startTime,
        promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      });
    } catch (err) {
      const parsed = parseGeminiError(err);
      res.status(parsed.statusCode).json({ error: parsed.userMessage });
    }
  });

  // Connected Apps Live Health Check & Command Dispatch Proxy
  app.post('/api/jarvis/apps/ping', async (req, res) => {
    const startTime = Date.now();
    try {
      const { baseUrl = '', healthPath = '', authHeaderName = '', authHeaderValue = '' } =
        req.body as {
          baseUrl: string;
          healthPath?: string;
          authHeaderName?: string;
          authHeaderValue?: string;
        };
      const targetUrl = resolveSafeAppUrl(baseUrl, healthPath);
      const headers: Record<string, string> = {
        Accept: 'application/json, text/plain, text/html',
      };
      if (authHeaderName.trim() && authHeaderValue.trim()) {
        headers[authHeaderName.trim()] = authHeaderValue.trim();
      }
      const upstream = await fetch(targetUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(8000),
      });
      const latencyMs = Date.now() - startTime;
      const preview = (await upstream.text()).slice(0, 1200);
      res.json({
        online: upstream.ok,
        httpStatus: upstream.status,
        latencyMs,
        targetUrl,
        preview,
      });
    } catch (err) {
      res.status(400).json({
        online: false,
        httpStatus: 0,
        latencyMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : 'No se pudo conectar con el servicio.',
      });
    }
  });

  app.post('/api/jarvis/apps/dispatch', async (req, res) => {
    const startTime = Date.now();
    try {
      const {
        baseUrl = '',
        path: subPath = '',
        method = 'GET',
        authHeaderName = '',
        authHeaderValue = '',
        bodyText = '',
      } = req.body as {
        baseUrl: string;
        path?: string;
        method?: string;
        authHeaderName?: string;
        authHeaderValue?: string;
        bodyText?: string;
      };
      const targetUrl = resolveSafeAppUrl(baseUrl, subPath);
      const cleanMethod = method.toUpperCase();
      if (!['GET', 'POST', 'PUT', 'DELETE'].includes(cleanMethod)) {
        res.status(400).json({ error: 'Método HTTP no permitido.' });
        return;
      }

      const headers: Record<string, string> = {
        Accept: 'application/json, text/plain, text/html',
      };
      if (authHeaderName.trim() && authHeaderValue.trim()) {
        headers[authHeaderName.trim()] = authHeaderValue.trim();
      }
      const fetchInit: RequestInit = {
        method: cleanMethod,
        headers,
        signal: AbortSignal.timeout(12000),
      };
      if ((cleanMethod === 'POST' || cleanMethod === 'PUT') && bodyText.trim()) {
        headers['Content-Type'] = 'application/json';
        fetchInit.body = bodyText;
      }

      const upstream = await fetch(targetUrl, fetchInit);
      const latencyMs = Date.now() - startTime;
      const responseText = (await upstream.text()).slice(0, 8000);
      res.json({
        ok: upstream.ok,
        httpStatus: upstream.status,
        latencyMs,
        contentType: upstream.headers.get('content-type') || '',
        bodyText: responseText,
        targetUrl,
      });
    } catch (err) {
      res.status(400).json({
        ok: false,
        httpStatus: 0,
        latencyMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : 'Error al ejecutar comando.',
      });
    }
  });

  // Router Diagnostics, Simplify Config & Apply Config
  app.post('/api/jarvis/router/diagnose', async (req, res) => {
    const startTime = Date.now();
    try {
      const {
        name = 'Router Principal',
        vendor = 'openwrt',
        hostUrl = '',
        adminUsername = 'admin',
        adminPassword = '',
        authScheme = 'basic',
        probePath = '',
        diagnosticSnapshot = '',
        simplifiedConfig,
        engineRoute = 'local-first-hybrid',
      } = req.body as {
        name?: string;
        vendor?: string;
        hostUrl?: string;
        adminUsername?: string;
        adminPassword?: string;
        authScheme?: string;
        probePath?: string;
        diagnosticSnapshot?: string;
        simplifiedConfig?: Record<string, unknown>;
        engineRoute?: string;
      };

      const cleanUrl = String(hostUrl || '').trim();
      let reachable = false;
      let httpStatus = 0;
      let probeLatencyMs = 0;
      let isPrivateLan = false;
      let liveNote = '';
      let capturedTelemetry = '';

      if (cleanUrl) {
        const withProtocol = /^https?:\/\//i.test(cleanUrl)
          ? cleanUrl
          : `http://${cleanUrl}`;
        try {
          const parsedUrl = new URL(withProtocol);
          if (isPrivateOrRestrictedHost(parsedUrl.hostname)) {
            isPrivateLan = true;
            liveNote = `La dirección ${parsedUrl.hostname} pertenece a una red local privada. Analizando configuración actual y reporte pegado.`;
          } else {
            const targetUrl = resolveSafeAppUrl(withProtocol, probePath);
            const headers = buildRouterAuthHeaders(authScheme, adminUsername, adminPassword);
            const t0 = Date.now();
            const upstream = await fetch(targetUrl, {
              method: 'GET',
              headers,
              signal: AbortSignal.timeout(8000),
            });
            probeLatencyMs = Date.now() - t0;
            httpStatus = upstream.status;
            reachable = upstream.ok;
            const bodySnippet = (await upstream.text()).slice(0, 4000);
            capturedTelemetry = `HTTP ${httpStatus} (${probeLatencyMs}ms) desde ${targetUrl}:\n${bodySnippet}`;
            liveNote = upstream.ok
              ? `Conectado con el router (HTTP ${httpStatus}) en ${probeLatencyMs} ms.`
              : `El router respondió HTTP ${httpStatus}. Verifica usuario o esquema de autenticación.`;
          }
        } catch (probeErr) {
          liveNote =
            probeErr instanceof Error
              ? `No se pudo contactar el router: ${probeErr.message}`
              : 'No se pudo contactar la URL del router.';
        }
      } else {
        liveNote = 'Evaluando configuración actual y telemetría proporcionada.';
      }

      const ai = getAiClient();
      const diagnosticPrompt = [
        'Eres el especialista en redes domésticas y empresariales de Jarvis.',
        'Genera un DIAGNÓSTICO DETALLADO del router explicado en lenguaje sencillo y claro, sin inventar velocidades ni dispositivos ficticios.',
        `Datos del router:\n- Nombre: ${name}\n- Marca/Sistema: ${vendor}\n- URL/Host: ${cleanUrl || 'No especificada'}\n- Estado de conexión: ${liveNote}`,
        `Configuración simplificada actual:\n${JSON.stringify(simplifiedConfig || {}, null, 2)}`,
        capturedTelemetry ? `Telemetría en vivo:\n${capturedTelemetry}` : '',
        diagnosticSnapshot.trim()
          ? `Reporte pegado por el usuario:\n${diagnosticSnapshot.slice(0, 12000)}`
          : '',
        'Evalúa obligatoriamente estas 5 áreas en `areas`: 1) "Internet y Conexión", 2) "Wi-Fi y Cobertura", 3) "Dispositivos y Red Local", 4) "Seguridad y Clave de Admin", 5) "Rendimiento del Router".',
        'Sugiere entre 2 y 3 `quickFixes` accionables.',
      ]
        .filter(Boolean)
        .join('\n\n');

      const modelChain =
        engineRoute === 'cloud-reasoning'
          ? [
              { model: 'gemini-4-hydrogen', retries: 0, timeoutMs: 7000 },
              { model: 'gemini-3.1-flash-lite', retries: 1, timeoutMs: 18000 },
            ]
          : [
              { model: 'gemini-3.1-flash-lite', retries: 1, timeoutMs: 18000 },
              { model: 'gemini-4-hydrogen', retries: 0, timeoutMs: 12000 },
            ];

      const { result: response, modelUsed } = await callWithRetryAndFallback(
        modelChain,
        (model) =>
          ai.models.generateContent({
            model,
            contents: diagnosticPrompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  overallHealth: { type: Type.STRING, enum: ['optimal', 'attention', 'critical'] },
                  overallTitle: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  areas: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        area: { type: Type.STRING },
                        status: { type: Type.STRING, enum: ['optimal', 'attention', 'critical'] },
                        headline: { type: Type.STRING },
                        plainExplanation: { type: Type.STRING },
                        technicalDetail: { type: Type.STRING },
                        recommendation: { type: Type.STRING },
                      },
                      required: [
                        'area',
                        'status',
                        'headline',
                        'plainExplanation',
                        'technicalDetail',
                        'recommendation',
                      ],
                    },
                  },
                  quickFixes: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        label: { type: Type.STRING },
                        effectDescription: { type: Type.STRING },
                        reachMode: { type: Type.STRING },
                        securityLevel: { type: Type.STRING },
                        priorityMode: { type: Type.STRING },
                        dnsProtection: { type: Type.STRING },
                        guestWifiEnabled: { type: Type.BOOLEAN },
                        autoOptimizeChannel: { type: Type.BOOLEAN },
                      },
                      required: ['label', 'effectDescription'],
                    },
                  },
                },
                required: ['overallHealth', 'overallTitle', 'summary', 'areas', 'quickFixes'],
              },
            },
          })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
      res.json({
        overallHealth: parsed.overallHealth || 'attention',
        overallTitle: parsed.overallTitle || 'Diagnóstico completado',
        summary: parsed.summary || 'Evaluación completada.',
        areas: Array.isArray(parsed.areas) ? parsed.areas : [],
        quickFixes: Array.isArray(parsed.quickFixes) ? parsed.quickFixes : [],
        connectionObserved: {
          reachable,
          httpStatus,
          latencyMs: probeLatencyMs,
          isPrivateLan,
          note: liveNote,
        },
        model: modelUsed,
        latencyMs: Date.now() - startTime,
      });
    } catch (err) {
      const parsed = parseGeminiError(err);
      res.status(parsed.statusCode).json({ error: parsed.userMessage });
    }
  });

  app.post('/api/jarvis/router/simplify-config', async (req, res) => {
    const startTime = Date.now();
    try {
      const { instruction = '', currentConfig = {} } = req.body as {
        instruction: string;
        currentConfig?: Record<string, unknown>;
      };
      if (!instruction.trim()) {
        res.status(400).json({ error: 'Describe qué mejora deseas en tu Wi-Fi o router.' });
        return;
      }

      const ai = getAiClient();
      const { result: response, modelUsed } = await callWithRetryAndFallback(
        [{ model: 'gemini-3.1-flash-lite', retries: 2, timeoutMs: 18000 }],
        (model) =>
          ai.models.generateContent({
            model,
            contents: `Traduce esta petición en lenguaje natural a la configuración simplificada del router.\nPetición: "${instruction.trim()}"\nConfiguración actual:\n${JSON.stringify(currentConfig)}`,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  explanation: { type: Type.STRING },
                  reachMode: {
                    type: Type.STRING,
                    enum: ['balanced', 'max_range', 'low_interference'],
                  },
                  securityLevel: {
                    type: Type.STRING,
                    enum: ['standard', 'strict_family', 'maximum'],
                  },
                  priorityMode: {
                    type: Type.STRING,
                    enum: [
                      'balanced',
                      'calls_and_work',
                      'streaming_4k',
                      'gaming_low_ping',
                    ],
                  },
                  dnsProtection: {
                    type: Type.STRING,
                    enum: ['isp_default', 'fast_private', 'family_safe'],
                  },
                  guestWifiEnabled: { type: Type.BOOLEAN },
                  autoOptimizeChannel: { type: Type.BOOLEAN },
                },
                required: ['explanation'],
              },
            },
          })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
      res.json({
        ...parsed,
        model: modelUsed,
        latencyMs: Date.now() - startTime,
      });
    } catch (err) {
      const parsed = parseGeminiError(err);
      res.status(parsed.statusCode).json({ error: parsed.userMessage });
    }
  });

  app.post('/api/jarvis/router/apply-config', async (req, res) => {
    const startTime = Date.now();
    try {
      const {
        hostUrl = '',
        applyEndpointPath = '',
        adminUsername = 'admin',
        adminPassword = '',
        authScheme = 'basic',
        simplifiedConfig = {},
      } = req.body as {
        hostUrl?: string;
        applyEndpointPath?: string;
        adminUsername?: string;
        adminPassword?: string;
        authScheme?: string;
        simplifiedConfig?: Record<string, unknown>;
      };

      if (!hostUrl.trim() || !applyEndpointPath.trim()) {
        res.json({
          remoteApplied: false,
          note: 'Perfil guardado en consola. Para aplicar por red se requiere URL pública/túnel y endpoint de API.',
          latencyMs: Date.now() - startTime,
        });
        return;
      }

      const targetUrl = resolveSafeAppUrl(hostUrl, applyEndpointPath);
      const headers = buildRouterAuthHeaders(authScheme, adminUsername, adminPassword);
      headers['Content-Type'] = 'application/json';
      const upstream = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(simplifiedConfig),
        signal: AbortSignal.timeout(8000),
      });

      res.json({
        remoteApplied: upstream.ok,
        httpStatus: upstream.status,
        note: upstream.ok
          ? `Configuración enviada al router (HTTP ${upstream.status}).`
          : `El router respondió HTTP ${upstream.status}.`,
        latencyMs: Date.now() - startTime,
      });
    } catch (err) {
      res.json({
        remoteApplied: false,
        note: err instanceof Error ? err.message : 'No se pudo enviar al router remoto.',
        latencyMs: Date.now() - startTime,
      });
    }
  });

  // Live Spectator Screen & Visual Context Inspector
  app.post('/api/jarvis/vision/inspect', async (req, res) => {
    const startTime = Date.now();
    try {
      const {
        imageBase64,
        mimeType = 'image/jpeg',
        question = '',
        mode = 'spectator',
        engineRoute = 'local-first-hybrid',
      } = req.body as {
        imageBase64: string;
        mimeType?: string;
        question?: string;
        mode?: string;
        engineRoute?: string;
      };
      if (!imageBase64) {
        res.status(400).json({ error: 'Se requiere una captura de pantalla para analizar.' });
        return;
      }

      const ai = getAiClient();
      const modeInstructions: Record<string, string> = {
        spectator:
          'Estás en modo Pantalla de Espectador observando en vivo lo que ocurre en pantalla. Describe con claridad qué aplicación o acción está ocurriendo y sugiere acciones útiles.',
        game:
          'Estás en modo Espectador de Videojuego. Identifica el estado del juego, obstáculos o situación táctica y recomienda el siguiente movimiento concreto.',
        reels:
          'Estás en modo Espectador de Reels / Videos / Feed Social. Resume el tema visual del clip, lee textos visibles y sugiere si guardar o pasar al siguiente.',
        design:
          'Estás en modo Crítico de Diseño Editorial. Evalúa el diseño visible en pantalla y señala qué mejorar para que luzca más profesional.',
      };

      const promptText = [
        modeInstructions[mode] || modeInstructions.spectator,
        question.trim()
          ? `Pregunta específica del usuario: "${question.trim()}"`
          : 'Analiza la captura en español claro y conciso.',
      ].join('\n\n');

      const modelChain =
        engineRoute === 'cloud-reasoning'
          ? [
              { model: 'gemini-4-hydrogen', retries: 0, timeoutMs: 7000 },
              { model: 'gemini-3.1-flash-lite', retries: 1, timeoutMs: 16000 },
            ]
          : [
              { model: 'gemini-3.1-flash-lite', retries: 1, timeoutMs: 16000 },
              { model: 'gemini-4-hydrogen', retries: 0, timeoutMs: 12000 },
            ];

      const { result: response, modelUsed } = await callWithRetryAndFallback(
        modelChain,
        (model) =>
          ai.models.generateContent({
            model,
            contents: {
              parts: [
                { inlineData: { mimeType, data: imageBase64 } },
                { text: promptText },
              ],
            },
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  contextLabel: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  spokenLine: { type: Type.STRING },
                  suggestedActions: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['contextLabel', 'summary', 'spokenLine', 'suggestedActions'],
              },
              ...(model === 'gemini-4-hydrogen'
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
            },
          })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        contextLabel?: string;
        summary?: string;
        spokenLine?: string;
        suggestedActions?: string[];
      };

      res.json({
        contextLabel: parsed.contextLabel || 'Pantalla observada',
        summary: parsed.summary || 'Captura analizada correctamente.',
        spokenLine: parsed.spokenLine || parsed.summary || 'Observación completada.',
        suggestedActions: Array.isArray(parsed.suggestedActions)
          ? parsed.suggestedActions
          : [],
        model: modelUsed,
        latencyMs: Date.now() - startTime,
        promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      });
    } catch (err) {
      const parsed = parseGeminiError(err);
      res.status(parsed.statusCode).json({ error: parsed.userMessage });
    }
  });

  // Video Storyboard, Narration & Timed Subtitles
  app.post('/api/jarvis/video/plan', async (req, res) => {
    const startTime = Date.now();
    try {
      const {
        topic = '',
        style = 'editorial',
        aspectRatio = '16:9',
        durationSec = 18,
        subtitleTheme = 'cinematic_bottom',
      } = req.body as {
        topic: string;
        style?: string;
        aspectRatio?: string;
        durationSec?: number;
        subtitleTheme?: string;
      };

      if (!topic.trim()) {
        res.status(400).json({ error: 'Describe el tema o guión del video.' });
        return;
      }

      const targetSec = Math.max(8, Math.min(45, Number(durationSec) || 18));
      const ai = getAiClient();
      const { result: response, modelUsed } = await callWithRetryAndFallback(
        [
          { model: 'gemini-3.1-flash-lite', retries: 2, timeoutMs: 22000 },
          { model: 'gemini-4-hydrogen', retries: 1, timeoutMs: 20000 },
        ],
        (model) =>
          ai.models.generateContent({
            model,
            contents: [
              'Eres un director creativo y editor de video profesional.',
              `Crea un plan completo de producción audiovisual en español para un video sobre: "${topic.trim()}".`,
              `Estilo visual: ${style}. Formato: ${aspectRatio}. Duración total aproximada: ${targetSec} segundos. Estilo de subtítulos: ${subtitleTheme}.`,
              'Genera entre 3 y 5 escenas cuya suma de `durationSec` sea aproximadamente la duración total, una `narrationScript` fluida para voz en off, una paleta de alto contraste y `subtitles` sincronizados de inicio a fin.',
            ].join('\n\n'),
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  palette: {
                    type: Type.OBJECT,
                    properties: {
                      bgHex: { type: Type.STRING },
                      accentHex: { type: Type.STRING },
                      textHex: { type: Type.STRING },
                    },
                    required: ['bgHex', 'accentHex', 'textHex'],
                  },
                  narrationScript: { type: Type.STRING },
                  scenes: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        durationSec: { type: Type.NUMBER },
                        headline: { type: Type.STRING },
                        visualPrompt: { type: Type.STRING },
                        captionText: { type: Type.STRING },
                        motionType: {
                          type: Type.STRING,
                          enum: ['zoom_in', 'pan_left', 'pan_right', 'static_focus'],
                        },
                        layoutType: {
                          type: Type.STRING,
                          enum: ['title_hero', 'split_stat', 'quote_frame', 'lower_third'],
                        },
                      },
                      required: [
                        'id',
                        'durationSec',
                        'headline',
                        'visualPrompt',
                        'captionText',
                        'motionType',
                        'layoutType',
                      ],
                    },
                  },
                  subtitles: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        index: { type: Type.INTEGER },
                        startSec: { type: Type.NUMBER },
                        endSec: { type: Type.NUMBER },
                        text: { type: Type.STRING },
                      },
                      required: ['index', 'startSec', 'endSec', 'text'],
                    },
                  },
                },
                required: ['title', 'palette', 'narrationScript', 'scenes', 'subtitles'],
              },
            },
          })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
      res.json({
        title: String(parsed.title || 'Producción Jarvis'),
        palette: parsed.palette || {
          bgHex: '#0A0F14',
          accentHex: '#2EE5CB',
          textHex: '#F3F7FA',
        },
        subtitleTheme,
        narrationScript: String(parsed.narrationScript || ''),
        scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
        subtitles: Array.isArray(parsed.subtitles) ? parsed.subtitles : [],
        model: modelUsed,
        latencyMs: Date.now() - startTime,
        promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      });
    } catch (err) {
      const parsed = parseGeminiError(err);
      res.status(parsed.statusCode).json({ error: parsed.userMessage });
    }
  });

  app.post('/api/jarvis/video/auto-subtitles', async (req, res) => {
    const startTime = Date.now();
    try {
      const {
        audioBase64 = '',
        mimeType = 'audio/webm',
        scriptText = '',
        totalDurationSec = 15,
      } = req.body as {
        audioBase64?: string;
        mimeType?: string;
        scriptText?: string;
        totalDurationSec?: number;
      };

      const ai = getAiClient();
      let finalTranscript = scriptText.trim();
      let modelUsed = 'gemini-3.1-flash-lite';

      if (audioBase64 && !finalTranscript) {
        const sttRes = await callWithRetryAndFallback(
          [
            { model: 'gemini-3.5-transcribe', retries: 2, timeoutMs: 20000 },
            { model: 'gemini-4-hydrogen', retries: 1, timeoutMs: 18000 },
          ],
          (model) =>
            ai.models.generateContent({
              model,
              contents: {
                parts: [
                  { inlineData: { mimeType, data: audioBase64 } },
                  {
                    text: 'Transcribe el audio completo en su idioma original con puntuación clara. Devuelve únicamente el texto transcrito.',
                  },
                ],
              },
            })
        );
        finalTranscript = (sttRes.result.text ?? '').trim();
        modelUsed = sttRes.modelUsed;
      }

      if (!finalTranscript) {
        res.status(400).json({ error: 'No se detectó texto ni audio para subtitular.' });
        return;
      }

      const dur = Math.max(3, Math.min(300, Number(totalDurationSec) || 15));
      const words = finalTranscript.split(/\s+/).filter(Boolean);
      const chunkSize = Math.max(
        4,
        Math.min(8, Math.ceil(words.length / Math.max(2, Math.round(dur / 2.5))))
      );
      const phrases: string[] = [];
      for (let i = 0; i < words.length; i += chunkSize) {
        phrases.push(words.slice(i, i + chunkSize).join(' '));
      }
      const step = dur / Math.max(1, phrases.length);
      const subtitles = phrases.map((txt, idx) => ({
        index: idx + 1,
        startSec: Number((idx * step).toFixed(2)),
        endSec: Number(((idx + 1) * step).toFixed(2)),
        text: txt,
      }));

      res.json({
        transcript: finalTranscript,
        subtitles,
        model: modelUsed,
        latencyMs: Date.now() - startTime,
      });
    } catch (err) {
      const parsed = parseGeminiError(err);
      res.status(parsed.statusCode).json({ error: parsed.userMessage });
    }
  });

  // Live Web Search (Google Search Grounding)
  app.post('/api/jarvis/search', async (req, res) => {
    const startTime = Date.now();
    try {
      const { query = '', engineRoute = 'local-first-hybrid' } = req.body as {
        query: string;
        engineRoute?: string;
      };
      if (!query.trim()) {
        res.status(400).json({ error: 'Escribe qué deseas buscar.' });
        return;
      }

      const ai = getAiClient();
      const modelChain =
        engineRoute === 'cloud-reasoning'
          ? [
              { model: 'gemini-4-hydrogen', retries: 0, timeoutMs: 7000 },
              { model: 'gemini-3.1-flash-lite', retries: 1, timeoutMs: 15000 },
            ]
          : [
              { model: 'gemini-3.1-flash-lite', retries: 1, timeoutMs: 15000 },
              { model: 'gemini-4-hydrogen', retries: 0, timeoutMs: 12000 },
            ];

      const { result: response, modelUsed } = await callWithRetryAndFallback(
        modelChain,
        (model) =>
          ai.models.generateContent({
            model,
            contents: `Busca información actualizada y verídica en la web sobre: "${query.trim()}". Responde en español con un resumen directo, puntos clave verificables y datos concretos.`,
            config: {
              tools: [{ googleSearch: {} }],
              ...(model === 'gemini-4-hydrogen'
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
            },
          })
      );

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const seen = new Set<string>();
      const results = chunks
        .map((chunk) => {
          const web = (chunk as { web?: { title?: string; uri?: string } }).web;
          if (!web?.uri || seen.has(web.uri)) return null;
          seen.add(web.uri);
          let domain = 'web';
          try {
            domain = new URL(web.uri).hostname.replace(/^www\./, '');
          } catch {
            // keep default
          }
          return {
            title: web.title || domain,
            url: web.uri,
            snippet: `Fuente verificada en ${domain}`,
            domain,
          };
        })
        .filter((x): x is { title: string; url: string; snippet: string; domain: string } => x !== null);

      res.json({
        answer: (response.text ?? '').trim() || 'Búsqueda completada.',
        results,
        model: modelUsed,
        latencyMs: Date.now() - startTime,
        promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      });
    } catch (err) {
      const parsed = parseGeminiError(err);
      res.status(parsed.statusCode).json({ error: parsed.userMessage });
    }
  });

  // Universal Web Page Reader
  app.post('/api/jarvis/web/read', async (req, res) => {
    const startTime = Date.now();
    try {
      const { url = '', question = '', engineRoute = 'local-first-hybrid' } = req.body as {
        url: string;
        question?: string;
        engineRoute?: string;
      };
      if (!url.trim()) {
        res.status(400).json({ error: 'Indica la URL que quieres leer.' });
        return;
      }

      let extracted: Awaited<ReturnType<typeof fetchAndExtractWebPage>> | null = null;
      let fetchErrorNote = '';
      try {
        extracted = await fetchAndExtractWebPage(url);
      } catch (err) {
        fetchErrorNote =
          err instanceof Error ? err.message : 'No se pudo descargar el HTML directo.';
      }

      const ai = getAiClient();
      const targetUrl =
        extracted?.url ||
        (/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
      resolveSafeAppUrl(targetUrl, '');

      const modelChain =
        engineRoute === 'cloud-reasoning'
          ? [
              { model: 'gemini-4-hydrogen', retries: 0, timeoutMs: 7000 },
              { model: 'gemini-3.1-flash-lite', retries: 1, timeoutMs: 16000 },
            ]
          : [
              { model: 'gemini-3.1-flash-lite', retries: 1, timeoutMs: 16000 },
              { model: 'gemini-4-hydrogen', retries: 0, timeoutMs: 12000 },
            ];

      const readerPrompt = extracted
        ? [
            `Analiza esta página web (${extracted.url}) cuyo título es "${extracted.title}".`,
            question.trim()
              ? `Responde específicamente a esta pregunta del usuario basándote en el texto: "${question.trim()}". Además entrega un resumen claro.`
              : 'Entrega un resumen completo, claro y estructurado en español con los puntos principales de la página.',
            `CONTENIDO EXTRAÍDO:\n${extracted.extractedText.slice(0, 14000)}`,
          ].join('\n\n')
        : [
            `Lee el contenido de la URL ${targetUrl} usando URL Context.`,
            question.trim()
              ? `Responde en español a: "${question.trim()}" y resume los puntos principales.`
              : 'Resume en español el contenido principal y datos útiles de la página.',
            fetchErrorNote ? `(Nota técnica: ${fetchErrorNote})` : '',
          ]
            .filter(Boolean)
            .join('\n\n');

      const { result: response, modelUsed } = await callWithRetryAndFallback(
        modelChain,
        (model) =>
          ai.models.generateContent({
            model,
            contents: readerPrompt,
            config: {
              ...(!extracted ? { tools: [{ urlContext: {} }] } : {}),
              ...(model === 'gemini-4-hydrogen'
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
            },
          })
      );

      const aiText = (response.text ?? '').trim();
      const wordCount = extracted?.wordCount ?? (aiText ? aiText.split(/\s+/).length : 0);

      res.json({
        url: targetUrl,
        title: extracted?.title || targetUrl,
        description: extracted?.description || '',
        wordCount,
        readingTimeMin: Math.max(1, Math.round(wordCount / 200)),
        extractedText: extracted?.extractedText || aiText,
        headings: extracted?.headings || [],
        links: extracted?.links || [],
        aiSummary: aiText,
        answer: question.trim() ? aiText : undefined,
        model: modelUsed,
        latencyMs: Date.now() - startTime,
        promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      });
    } catch (err) {
      const parsed = parseGeminiError(err);
      res.status(parsed.statusCode).json({ error: parsed.userMessage });
    }
  });

  // Autonomous Multi-Step Agent
  app.post('/api/jarvis/autonomous/step', async (req, res) => {
    const startTime = Date.now();
    try {
      const {
        goal = '',
        taskType = 'google_research',
        stepIndex = 1,
        previousLog = [],
        connectedApps = [],
        publishedApps = [],
        gameState,
        screenImageBase64 = '',
        screenMimeType = 'image/jpeg',
        engineRoute = 'local-first-hybrid',
      } = req.body as {
        goal: string;
        taskType: 'play_game' | 'google_research' | 'manage_apps' | 'web_workflow';
        stepIndex?: number;
        previousLog?: Array<{ action: string; outcome: string }>;
        connectedApps?: Array<Record<string, unknown>>;
        publishedApps?: Array<Record<string, unknown>>;
        gameState?: Record<string, unknown>;
        screenImageBase64?: string;
        screenMimeType?: string;
        engineRoute?: string;
      };

      const ai = getAiClient();

      if (taskType === 'google_research') {
        const { result: response, modelUsed } = await callWithRetryAndFallback(
          [
            { model: 'gemini-3.1-flash-lite', retries: 2, timeoutMs: 20000 },
            { model: 'gemini-4-hydrogen', retries: 1, timeoutMs: 20000 },
          ],
          (model) =>
            ai.models.generateContent({
              model,
              contents: [
                `Objetivo autónomo de investigación en Google: "${goal.trim() || 'Tendencias tecnológicas recientes'}".`,
                `Paso actual #${stepIndex}. Historial previo: ${JSON.stringify(previousLog.slice(-4))}.`,
                'Ejecuta búsqueda web real, contrasta fuentes confiables y entrega hallazgos concretos en español.',
              ].join('\n\n'),
              config: {
                tools: [{ googleSearch: {} }, { urlContext: {} }],
              },
            })
        );

        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
        const sources = chunks
          .map((c) => {
            const w = (c as { web?: { title?: string; uri?: string } }).web;
            return w?.uri ? { title: w.title || w.uri, url: w.uri } : null;
          })
          .filter((x): x is { title: string; url: string } => x !== null);

        res.json({
          action: 'Búsqueda autónoma en Google y síntesis de fuentes',
          observation: `Consultadas ${sources.length} fuentes web verificadas`,
          outcome: (response.text ?? '').trim(),
          sources,
          done: true,
          model: modelUsed,
          latencyMs: Date.now() - startTime,
        });
        return;
      }

      if (taskType === 'manage_apps') {
        const pingResults = await Promise.all(
          connectedApps.slice(0, 8).map(async (appItem) => {
            try {
              const targetUrl = resolveSafeAppUrl(
                String(appItem.baseUrl || ''),
                String(appItem.healthPath || '')
              );
              const t0 = Date.now();
              const resp = await fetch(targetUrl, {
                method: 'GET',
                signal: AbortSignal.timeout(6000),
              });
              return {
                id: appItem.id,
                name: appItem.name,
                status: appItem.status,
                online: resp.ok,
                httpStatus: resp.status,
                latencyMs: Date.now() - t0,
              };
            } catch (pingErr) {
              return {
                id: appItem.id,
                name: appItem.name,
                status: appItem.status,
                online: false,
                httpStatus: 0,
                latencyMs: 0,
                error: pingErr instanceof Error ? pingErr.message : 'Error de red',
              };
            }
          })
        );

        const { result: response, modelUsed } = await callWithRetryAndFallback(
          [{ model: 'gemini-3.1-flash-lite', retries: 2, timeoutMs: 18000 }],
          (model) =>
            ai.models.generateContent({
              model,
              contents: [
                `Objetivo autónomo de administración de apps: "${goal.trim() || 'Supervisar todas las apps y optimizar estado'}".`,
                `Apps conectadas verificadas en vivo: ${JSON.stringify(pingResults)}`,
                `Apps publicadas: ${JSON.stringify(publishedApps)}`,
                'Decide si conviene activar o pausar alguna app según su salud real y entrega un informe claro en español.',
              ].join('\n\n'),
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    action: { type: Type.STRING },
                    observation: { type: Type.STRING },
                    outcome: { type: Type.STRING },
                    statusChanges: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          kind: { type: Type.STRING, enum: ['published', 'connected'] },
                          id: { type: Type.STRING },
                          status: { type: Type.STRING, enum: ['active', 'paused'] },
                        },
                      },
                    },
                  },
                  required: ['action', 'observation', 'outcome', 'statusChanges'],
                },
              },
            })
        );

        const parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
        res.json({
          action: String(parsed.action || 'Auditoría autónoma de aplicaciones'),
          observation: String(parsed.observation || `${pingResults.length} apps inspeccionadas`),
          outcome: String(parsed.outcome || 'Revisión completada.'),
          statusChanges: Array.isArray(parsed.statusChanges) ? parsed.statusChanges : [],
          pingResults,
          done: true,
          model: modelUsed,
          latencyMs: Date.now() - startTime,
        });
        return;
      }

      if (taskType === 'play_game') {
        const parts: Array<Record<string, unknown>> = [];
        if (screenImageBase64) {
          parts.push({ inlineData: { mimeType: screenMimeType, data: screenImageBase64 } });
        }
        parts.push({
          text: [
            'Eres un agente autónomo jugando un videojuego en la Arena de Espectador.',
            `Estado actual del juego: ${JSON.stringify(gameState || {})}.`,
            `Objetivo: "${goal.trim() || 'Maximizar puntuación y evitar colisiones'}".`,
            'Elige la mejor acción inmediata ("UP", "DOWN", "LEFT", "RIGHT" o "STAY") y da una breve observación táctica en español.',
          ].join('\n'),
        });

        const { result: response, modelUsed } = await callWithRetryAndFallback(
          [{ model: 'gemini-3.1-flash-lite', retries: 1, timeoutMs: 10000 }],
          (model) =>
            ai.models.generateContent({
              model,
              contents: { parts },
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    move: { type: Type.STRING, enum: ['UP', 'DOWN', 'LEFT', 'RIGHT', 'STAY'] },
                    observation: { type: Type.STRING },
                    outcome: { type: Type.STRING },
                  },
                  required: ['move', 'observation', 'outcome'],
                },
              },
            })
        );

        const parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
        res.json({
          move: String(parsed.move || 'STAY'),
          action: `Movimiento autónomo: ${String(parsed.move || 'STAY')}`,
          observation: String(parsed.observation || 'Estado evaluado'),
          outcome: String(parsed.outcome || 'Movimiento aplicado'),
          done: false,
          model: modelUsed,
          latencyMs: Date.now() - startTime,
        });
        return;
      }

      // web_workflow
      const parts: Array<Record<string, unknown>> = [];
      if (screenImageBase64) {
        parts.push({ inlineData: { mimeType: screenMimeType, data: screenImageBase64 } });
      }
      parts.push({
        text: [
          'Eres el agente autónomo de Jarvis asistiendo un flujo web o de pantalla compartida.',
          `Objetivo del usuario: "${goal.trim() || 'Analizar actividad en pantalla y asistir el siguiente paso'}".`,
          `Paso #${stepIndex}. Historial: ${JSON.stringify(previousLog.slice(-4))}.`,
          'Describe qué aparece en pantalla, qué acción recomiendas y, si es útil, incluye un script seguro de navegador (companionScript) para consola local.',
        ].join('\n\n'),
      });

      const modelChain =
        engineRoute === 'cloud-reasoning'
          ? [
              { model: 'gemini-4-hydrogen', retries: 1, timeoutMs: 20000 },
              { model: 'gemini-3.1-flash-lite', retries: 2, timeoutMs: 20000 },
            ]
          : [
              { model: 'gemini-3.1-flash-lite', retries: 2, timeoutMs: 20000 },
              { model: 'gemini-4-hydrogen', retries: 1, timeoutMs: 20000 },
            ];

      const { result: response, modelUsed } = await callWithRetryAndFallback(
        modelChain,
        (model) =>
          ai.models.generateContent({
            model,
            contents: { parts },
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  action: { type: Type.STRING },
                  observation: { type: Type.STRING },
                  outcome: { type: Type.STRING },
                  spokenLine: { type: Type.STRING },
                  companionScript: { type: Type.STRING },
                },
                required: ['action', 'observation', 'outcome', 'spokenLine'],
              },
            },
          })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
      res.json({
        action: String(parsed.action || 'Evaluación de flujo web'),
        observation: String(parsed.observation || 'Pantalla analizada'),
        outcome: String(parsed.outcome || 'Paso completado'),
        spokenLine: String(parsed.spokenLine || ''),
        companionScript: String(parsed.companionScript || ''),
        done: true,
        model: modelUsed,
        latencyMs: Date.now() - startTime,
      });
    } catch (err) {
      const parsed = parseGeminiError(err);
      res.status(parsed.statusCode).json({ error: parsed.userMessage });
    }
  });

  // Public Hosting for Published Apps (/p/:slug)
  app.get('/p/:slug', (req, res) => {
    const slug = String(req.params.slug || '').trim();
    if (!/^[a-zA-Z0-9_-]{3,128}$/.test(slug)) {
      res
        .status(404)
        .type('html')
        .send(
          '<!doctype html><html lang="es"><body style="font-family:sans-serif;padding:48px;text-align:center;background:#07080b;color:#eef2f6;"><h1>Enlace inválido</h1><p>La ruta solicitada no corresponde a una aplicación publicada.</p><a href="/" style="color:#2ee5cb;">Volver a Jarvis</a></body></html>'
        );
      return;
    }

    const state = loadState();
    const found = state.publishedApps.find((a) => a.slug === slug);
    if (!found) {
      res
        .status(404)
        .type('html')
        .send(
          '<!doctype html><html lang="es"><body style="font-family:sans-serif;padding:48px;text-align:center;background:#07080b;color:#eef2f6;"><h1>Aplicación no encontrada</h1><p>No existe ninguna aplicación publicada bajo este enlace.</p><a href="/" style="color:#2ee5cb;">Volver a Jarvis</a></body></html>'
        );
      return;
    }

    if (found.status === 'paused') {
      res
        .status(200)
        .type('html')
        .send(
          `<!doctype html><html lang="es"><body style="font-family:sans-serif;padding:48px;text-align:center;background:#07080b;color:#eef2f6;"><h1>${found.title}</h1><p>Esta aplicación está pausada temporalmente desde la consola de Jarvis.</p><a href="/" style="color:#2ee5cb;">Volver a Jarvis</a></body></html>`
        );
      return;
    }

    res.status(200).type('html').send(found.htmlCode);
  });

  // Vite middleware (dev) or static dist (prod)
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Jarvis Smart Core] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
