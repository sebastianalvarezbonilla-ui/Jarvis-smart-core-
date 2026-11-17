export type VoiceId = 'Charon' | 'Kore' | 'Zephyr' | 'Puck' | 'Fenrir';

export type TtsModelId = 'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts';

export type EngineRouteId =
  | 'local-first-hybrid'
  | 'cloud-reasoning'
  | 'low-latency-edge';

export type AgentPresetId =
  | 'chat-simple'
  | 'code-assistant'
  | 'deep-research'
  | 'daily-briefing'
  | 'scheduled-monitor'
  | string;

export type MemoryCategory = 'preferencia' | 'proyecto' | 'persona' | 'contexto';

export type NavTabId =
  | 'consola'
  | 'agentes'
  | 'memoria'
  | 'voces'
  | 'trazas'
  | 'constructor'
  | 'router'
  | 'conectadas'
  | 'espectador'
  | 'video'
  | 'buscador'
  | 'autonomo';

export interface VoiceProfile {
  id: VoiceId;
  name: string;
  register: string;
  timbre: string;
  recommendedFor: string;
  defaultStyle: string;
  samplePhrase: string;
  accentPitch: string;
}

export interface AgentPreset {
  id: AgentPresetId;
  label: string;
  roleTitle: string;
  yamlName: string;
  description: string;
  thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  usesSearch: boolean;
  systemPrompt: string;
  skills: string[];
  recommendedVoice: VoiceId;
  isCustom?: boolean;
}

export interface ChatSource {
  title: string;
  url: string;
}

export interface LaunchAction {
  id: string;
  name: string;
  launchUri: string;
  platform?: string;
}

export interface ChatImageAttachment {
  id: string;
  name: string;
  mimeType: string;
  data: string;
  previewUrl?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  preset: AgentPresetId;
  agentLabel?: string;
  modelUsed?: string;
  latencyMs?: number;
  promptTokens?: number;
  outputTokens?: number;
  toolsUsed?: string[];
  sources?: ChatSource[];
  launchActions?: LaunchAction[];
  attachments?: ChatImageAttachment[];
  audioBase64?: string;
  voiceUsed?: VoiceId;
  streaming?: boolean;
  error?: boolean;
}

export interface MemoryNote {
  id: string;
  category: MemoryCategory;
  content: string;
  createdAt: string;
}

export interface TraceRecord {
  id: string;
  timestamp: string;
  operation:
    | 'chat'
    | 'tts'
    | 'stt'
    | 'search'
    | 'builder'
    | 'router'
    | 'vision'
    | 'video'
    | 'autonomous';
  preset: string;
  model: string;
  voice?: VoiceId;
  latencyMs: number;
  promptTokens: number;
  outputTokens: number;
  estimatedEnergyWh: number;
  toolsUsed: string[];
  status: 'ok' | 'error';
  detail?: string;
}

export interface PublishedAppRecord {
  id: string;
  slug: string;
  title: string;
  summary: string;
  prompt: string;
  htmlCode: string;
  status: 'active' | 'paused';
  designStyle: DesignStyleId;
  sourceRepoUrl?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface GithubRepoInspectResult {
  owner: string;
  repo: string;
  fullName: string;
  repoUrl: string;
  branch: string;
  subpath?: string;
  description: string;
  language: string;
  stars: number;
  topics: string[];
  totalTreeFiles: number;
  treePaths: string[];
  files: Array<{
    path: string;
    size: number;
    content: string;
  }>;
  usedFallback?: boolean;
  latencyMs: number;
}

export type ConnectedAppType =
  | 'device_app'
  | 'pwa_web'
  | 'rest_api'
  | 'webhook'
  | 'mcp_bridge'
  | 'local_service';

export type DeviceAppPlatform = 'desktop' | 'mobile' | 'web' | 'localhost';

export interface ConnectedAppRecord {
  id: string;
  name: string;
  appType: ConnectedAppType;
  platform?: DeviceAppPlatform;
  launchUri?: string;
  packageOrExecutable?: string;
  executionMode?: 'server_proxy' | 'browser_local';
  baseUrl: string;
  healthPath: string;
  defaultMethod: 'GET' | 'POST' | 'PUT' | 'DELETE';
  authHeaderName: string;
  authHeaderValue: string;
  description: string;
  status: 'active' | 'paused';
  lastCheckStatus: 'online' | 'offline' | 'unknown';
  lastCheckLatencyMs: number;
  lastCheckedAtMs: number;
}

export interface DeviceAppPreset {
  name: string;
  appType: ConnectedAppType;
  platform: DeviceAppPlatform;
  launchUri: string;
  packageOrExecutable: string;
  executionMode: 'server_proxy' | 'browser_local';
  baseUrl: string;
  healthPath: string;
  description: string;
}

export type RouterVendor =
  | 'openwrt'
  | 'tplink'
  | 'asus'
  | 'unifi'
  | 'mikrotik'
  | 'generic';

export type RouterAuthScheme = 'none' | 'basic' | 'bearer';
export type RouterConnectionStatus = 'connected' | 'unreachable' | 'untested';
export type RouterHealthStatus = 'optimal' | 'attention' | 'critical' | 'unknown';
export type RouterReachMode = 'balanced' | 'max_range' | 'low_interference';
export type RouterSecurityLevel = 'standard' | 'strict_family' | 'maximum';
export type RouterPriorityMode =
  | 'balanced'
  | 'calls_and_work'
  | 'streaming_4k'
  | 'gaming_low_ping';
export type RouterDnsProtection = 'isp_default' | 'fast_private' | 'family_safe';

export interface SimplifiedRouterConfig {
  wifiName: string;
  reachMode: RouterReachMode;
  securityLevel: RouterSecurityLevel;
  priorityMode: RouterPriorityMode;
  dnsProtection: RouterDnsProtection;
  guestWifiEnabled: boolean;
  guestWifiName: string;
  autoOptimizeChannel: boolean;
}

export interface RouterProfileRecord extends SimplifiedRouterConfig {
  id: string;
  name: string;
  vendor: RouterVendor;
  hostUrl: string;
  adminUsername: string;
  authScheme: RouterAuthScheme;
  connectionStatus: RouterConnectionStatus;
  lastHttpCode: number;
  lastLatencyMs: number;
  lastDiagnosticHealth: RouterHealthStatus;
  lastDiagnosticSummary: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface RouterDiagnosticArea {
  area: string;
  status: 'optimal' | 'attention' | 'critical';
  headline: string;
  plainExplanation: string;
  technicalDetail: string;
  recommendation: string;
}

export interface RouterDiagnosticReport {
  overallHealth: 'optimal' | 'attention' | 'critical';
  overallTitle: string;
  summary: string;
  areas: RouterDiagnosticArea[];
  quickFixes: Array<{
    label: string;
    effectDescription: string;
    reachMode?: RouterReachMode;
    securityLevel?: RouterSecurityLevel;
    priorityMode?: RouterPriorityMode;
    dnsProtection?: RouterDnsProtection;
    guestWifiEnabled?: boolean;
    autoOptimizeChannel?: boolean;
  }>;
  connectionObserved: {
    reachable: boolean;
    httpStatus: number;
    latencyMs: number;
    isPrivateLan?: boolean;
    note: string;
  };
  model: string;
  latencyMs: number;
}

export type DesignStyleId =
  | 'editorial-suiza'
  | 'revista-lujo'
  | 'producto-saas'
  | 'estudio-creativo';

export interface DesignAuditReport {
  scoreLabel: string;
  aiTellsFound: string[];
  improvementsApplied: string[];
  typographyPairing: string;
  refinedHtml: string;
}

export interface SpectatorObservation {
  id: string;
  timestamp: string;
  contextLabel: string;
  summary: string;
  spokenLine: string;
  suggestedActions: string[];
  model: string;
  latencyMs: number;
}

export type VideoAspectRatio = '16:9' | '9:16' | '1:1';
export type VideoSubtitleTheme = 'cinematic_bottom' | 'viral_bold' | 'editorial_card';

export interface VideoScene {
  id: string;
  durationSec: number;
  headline: string;
  visualPrompt: string;
  captionText: string;
  motionType: 'zoom_in' | 'pan_left' | 'pan_right' | 'static_focus';
  layoutType: 'title_hero' | 'split_stat' | 'quote_frame' | 'lower_third';
}

export interface SubtitleCue {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

export interface VideoProjectPlan {
  title: string;
  palette: {
    bgHex: string;
    accentHex: string;
    textHex: string;
  };
  subtitleTheme: VideoSubtitleTheme;
  narrationScript: string;
  scenes: VideoScene[];
  subtitles: SubtitleCue[];
  model: string;
  latencyMs: number;
}

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
  domain: string;
}

export interface WebPageReadResult {
  url: string;
  title: string;
  description: string;
  wordCount: number;
  readingTimeMin: number;
  extractedText: string;
  headings: string[];
  links: Array<{ text: string; url: string }>;
  aiSummary: string;
  answer?: string;
  model: string;
  latencyMs: number;
}

export type AutonomousTaskType =
  | 'google_research'
  | 'manage_apps'
  | 'play_game'
  | 'web_workflow';

export interface AutonomousStepLog {
  id: string;
  step: number;
  timestamp: string;
  action: string;
  observation: string;
  outcome: string;
  status: 'ok' | 'info' | 'warning';
}

export interface JarvisPreferences {
  activePreset: AgentPresetId;
  engineRoute: EngineRouteId;
  activeVoice: VoiceId;
  voiceStyle: string;
  ttsModel: TtsModelId;
  playbackRate: number;
  autoSpeak: boolean;
  darkMode: boolean;
}

export const VOICE_PROFILES: VoiceProfile[] = [
  {
    id: 'Charon',
    name: 'Charon',
    register: 'Grave · institucional',
    timbre: 'Registro grave, dicción precisa y ritmo pausado. Pensado para informes y decisiones.',
    recommendedFor: 'Briefings ejecutivos, arquitectura y modo Jarvis clásico',
    defaultStyle: 'Sereno, articulado, tono de asistente personal técnico con pausas claras',
    samplePhrase:
      'Sistemas locales verificados. Tengo listo el resumen técnico de tu sesión y las tres prioridades pendientes.',
    accentPitch: '115 Hz',
  },
  {
    id: 'Kore',
    name: 'Kore',
    register: 'Neutro · sereno',
    timbre: 'Voz clara y equilibrada, sin adornos. La opción más limpia para conversación larga.',
    recommendedFor: 'Investigación profunda, lectura de informes y documentación',
    defaultStyle: 'Clara, profesional, dicción precisa y ritmo constante de lectura',
    samplePhrase:
      'He contrastado las fuentes recientes y sintetizado los puntos clave en tu memoria de proyecto.',
    accentPitch: '195 Hz',
  },
  {
    id: 'Zephyr',
    name: 'Zephyr',
    register: 'Cálida · cercana',
    timbre: 'Voz cálida y envolvente, ideal para conversación cotidiana o lectura de textos largos.',
    recommendedFor: 'Conversación cotidiana, planificación diaria y notas rápidas',
    defaultStyle: 'Cálida, amable y conversacional, con entonación natural y cercana',
    samplePhrase:
      'Buenos días. Hoy tienes una mañana despejada; podemos empezar revisando tus notas o tus aplicaciones.',
    accentPitch: '210 Hz',
  },
  {
    id: 'Puck',
    name: 'Puck',
    register: 'Brillante · dinámica',
    timbre: 'Timbre ágil y expresivo. Buena para arrancar el día, depurar código o pensar en voz alta.',
    recommendedFor: 'Sesiones de código, depuración interactiva y lluvia de ideas',
    defaultStyle: 'Ágil, entusiasta y expresivo, ideal para iterar ideas con rapidez',
    samplePhrase:
      'Buena idea. Podemos desacoplar el motor de inferencia y probar la latencia de voz en tiempo real ahora mismo.',
    accentPitch: '155 Hz',
  },
  {
    id: 'Fenrir',
    name: 'Fenrir',
    register: 'Firme · profundo',
    timbre: 'Registro profundo, contundente y sobrio para alertas operativas y comandos directos.',
    recommendedFor: 'Monitoreo programado, alertas de red y comandos directos',
    defaultStyle: 'Firme, sobrio y directo, sin adornos innecesarios',
    samplePhrase:
      'Alerta de monitoreo: la latencia de respuesta ha superado el umbral configurado. Recomiendo revisar la traza.',
    accentPitch: '98 Hz',
  },
];

export const ENGINE_ROUTES: Array<{
  id: EngineRouteId;
  label: string;
  detail: string;
}> = [
  {
    id: 'local-first-hybrid',
    label: 'Local-first híbrido',
    detail: 'Prioriza contexto local y delega razonamiento al núcleo Gemini.',
  },
  {
    id: 'cloud-reasoning',
    label: 'Razonamiento extendido',
    detail: 'Planificación multi-paso con mayor profundidad analítica.',
  },
  {
    id: 'low-latency-edge',
    label: 'Respuesta inmediata',
    detail: 'Ultra baja latencia en streaming para voz y respuestas instantáneas.',
  },
];

export const AGENT_PRESETS: AgentPreset[] = [
  {
    id: 'chat-simple',
    label: 'Asistente Directo',
    roleTitle: 'Consola general y voz',
    yamlName: 'chat-simple.yaml',
    description:
      'Respuestas ágiles de baja latencia para consultas rápidas, memoria y control por voz.',
    thinkingLevel: 'LOW',
    usesSearch: false,
    skills: ['Respuesta rápida', 'Memoria local', 'Control de apps'],
    recommendedVoice: 'Charon',
    systemPrompt:
      'Eres Jarvis, una consola personal de IA con memoria y herramientas integradas. Responde en español de forma clara, concisa y práctica, optimizada tanto para lectura visual como para síntesis de voz.',
  },
  {
    id: 'estratega',
    label: 'Estratega',
    roleTitle: 'Planificación y prioridades',
    yamlName: 'estratega.yaml',
    description:
      'Convierte objetivos difusos en planes con bloques de tiempo y criterios claros de cierre.',
    thinkingLevel: 'MEDIUM',
    usesSearch: false,
    skills: ['Priorización', 'Planes de 3 bloques', 'Decisiones'],
    recommendedVoice: 'Charon',
    systemPrompt:
      'Eres el agente Estratega de Jarvis. Ordena por impacto y esfuerzo, propone planes con bloques concretos y señala el primer paso accionable. Evita listas largas sin criterio ni fecha.',
  },
  {
    id: 'code-assistant',
    label: 'Ingeniero',
    roleTitle: 'Código y sistemas',
    yamlName: 'code-assistant.yaml',
    description:
      'Diseña, revisa y depura código con criterio de producción, arquitectura y explicaciones breves.',
    thinkingLevel: 'HIGH',
    usesSearch: false,
    skills: ['Depuración', 'Arquitectura', 'Revisión de código'],
    recommendedVoice: 'Kore',
    systemPrompt:
      'Eres el agente Ingeniero de software senior de Jarvis. Analizas código, arquitectura full-stack y sistemas con rigor técnico. Da soluciones concretas, muestra código limpio y señala riesgos.',
  },
  {
    id: 'deep-research',
    label: 'Investigador',
    roleTitle: 'Búsqueda y síntesis web',
    yamlName: 'deep-research.yaml',
    description:
      'Rastrea fuentes actuales en Google Search, contrasta y devuelve una síntesis verificada.',
    thinkingLevel: 'HIGH',
    usesSearch: true,
    skills: ['Búsqueda web', 'Síntesis', 'Verificación'],
    recommendedVoice: 'Puck',
    systemPrompt:
      'Eres el agente Investigador de Jarvis. Utiliza Google Search cuando necesites datos actuales o verificación externa, distingue hechos de estimaciones y resume lo esencial primero.',
  },
  {
    id: 'daily-briefing',
    label: 'Briefing Diario',
    roleTitle: 'Resumen ejecutivo',
    yamlName: 'daily-briefing.yaml',
    description:
      'Resúmenes estructurados cruzando tu memoria personal, apps conectadas y estado de red.',
    thinkingLevel: 'MEDIUM',
    usesSearch: false,
    skills: ['Memoria personal', 'Síntesis ejecutiva', 'Lectura por voz'],
    recommendedVoice: 'Zephyr',
    systemPrompt:
      'Eres el agente de Briefing Diario de Jarvis. Revisa la memoria personal y los sistemas del usuario para generar resúmenes ejecutivos breves, accionables y cómodos de escuchar.',
  },
  {
    id: 'scheduled-monitor',
    label: 'Monitor de Sistema',
    roleTitle: 'Supervisión y trazas',
    yamlName: 'scheduled-monitor.yaml',
    description:
      'Supervisión de estado, trazas de latencia, consumo energético, router y conectores.',
    thinkingLevel: 'MEDIUM',
    usesSearch: false,
    skills: ['Telemetría', 'Salud de red', 'Auditoría'],
    recommendedVoice: 'Fenrir',
    systemPrompt:
      'Eres el agente Monitor de Jarvis. Evalúas métricas de latencia, tokens, consumo energético estimado y estado de redes y aplicaciones con precisión operativa.',
  },
];

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  preferencia: 'Preferencia',
  proyecto: 'Proyecto',
  persona: 'Persona',
  contexto: 'Contexto',
};

export const DEVICE_APP_CATALOG: DeviceAppPreset[] = [
  {
    name: 'WhatsApp',
    appType: 'device_app',
    platform: 'mobile',
    launchUri: 'whatsapp://send',
    packageOrExecutable: 'com.whatsapp / WhatsApp.exe',
    executionMode: 'browser_local',
    baseUrl: 'https://web.whatsapp.com',
    healthPath: '',
    description: 'Mensajería instantánea en tu teléfono o PC.',
  },
  {
    name: 'Spotify',
    appType: 'device_app',
    platform: 'desktop',
    launchUri: 'spotify://',
    packageOrExecutable: 'com.spotify.music / Spotify.exe',
    executionMode: 'browser_local',
    baseUrl: 'https://open.spotify.com',
    healthPath: '',
    description: 'Reproductor de música y podcasts del dispositivo.',
  },
  {
    name: 'Visual Studio Code',
    appType: 'device_app',
    platform: 'desktop',
    launchUri: 'vscode://',
    packageOrExecutable: 'code / Visual Studio Code.app',
    executionMode: 'browser_local',
    baseUrl: 'https://vscode.dev',
    healthPath: '',
    description: 'Editor de código local conectado por protocolo vscode://.',
  },
  {
    name: 'Telegram',
    appType: 'device_app',
    platform: 'mobile',
    launchUri: 'tg://',
    packageOrExecutable: 'org.telegram.messenger / Telegram.exe',
    executionMode: 'browser_local',
    baseUrl: 'https://web.telegram.org',
    healthPath: '',
    description: 'Mensajería, bots y canales locales o web.',
  },
  {
    name: 'Notion',
    appType: 'device_app',
    platform: 'desktop',
    launchUri: 'notion://',
    packageOrExecutable: 'notion.id / Notion.exe',
    executionMode: 'browser_local',
    baseUrl: 'https://www.notion.so',
    healthPath: '',
    description: 'Notas, bases de datos y espacio de trabajo personal.',
  },
  {
    name: 'Discord',
    appType: 'device_app',
    platform: 'desktop',
    launchUri: 'discord://',
    packageOrExecutable: 'com.discord / Discord.exe',
    executionMode: 'browser_local',
    baseUrl: 'https://discord.com/app',
    healthPath: '',
    description: 'Comunidades, voz y servidores locales.',
  },
  {
    name: 'Obsidian',
    appType: 'device_app',
    platform: 'desktop',
    launchUri: 'obsidian://open',
    packageOrExecutable: 'md.obsidian / Obsidian.exe',
    executionMode: 'browser_local',
    baseUrl: 'https://obsidian.md',
    healthPath: '',
    description: 'Bóveda local de notas Markdown en tu dispositivo.',
  },
  {
    name: 'Ollama Local',
    appType: 'local_service',
    platform: 'localhost',
    launchUri: 'http://localhost:11434',
    packageOrExecutable: 'ollama serve',
    executionMode: 'browser_local',
    baseUrl: 'http://localhost:11434',
    healthPath: '/api/tags',
    description: 'Motor de modelos locales ejecutándose en tu equipo (puerto 11434).',
  },
  {
    name: 'LM Studio',
    appType: 'local_service',
    platform: 'localhost',
    launchUri: 'http://localhost:1234',
    packageOrExecutable: 'LM Studio.exe / .app',
    executionMode: 'browser_local',
    baseUrl: 'http://localhost:1234',
    healthPath: '/v1/models',
    description: 'Servidor local OpenAI-compatible en tu computadora (puerto 1234).',
  },
  {
    name: 'Home Assistant',
    appType: 'local_service',
    platform: 'localhost',
    launchUri: 'http://homeassistant.local:8123',
    packageOrExecutable: 'homeassistant.local:8123',
    executionMode: 'browser_local',
    baseUrl: 'http://homeassistant.local:8123',
    healthPath: '/api/',
    description: 'Domótica y automatización del hogar en red local.',
  },
  {
    name: 'YouTube',
    appType: 'pwa_web',
    platform: 'web',
    launchUri: 'https://www.youtube.com',
    packageOrExecutable: 'com.google.android.youtube',
    executionMode: 'browser_local',
    baseUrl: 'https://www.youtube.com',
    healthPath: '',
    description: 'Videos, música y suscripciones.',
  },
  {
    name: 'Google Calendar',
    appType: 'pwa_web',
    platform: 'web',
    launchUri: 'https://calendar.google.com',
    packageOrExecutable: 'com.google.android.calendar',
    executionMode: 'browser_local',
    baseUrl: 'https://calendar.google.com',
    healthPath: '',
    description: 'Agenda y recordatorios diarios.',
  },
];

