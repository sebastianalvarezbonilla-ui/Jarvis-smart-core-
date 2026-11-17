import React from 'react';
import {
  Activity,
  AudioLines,
  Blocks,
  Bot,
  Brain,
  Cpu,
  Eye,
  Film,
  Globe,
  LogIn,
  MessageSquare,
  Moon,
  Play,
  Plug,
  Route,
  Square,
  Sun,
  Zap,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import type { User } from '../lib/firebase';
import {
  ENGINE_ROUTES,
  type EngineRouteId,
  type NavTabId,
  type VoiceProfile,
} from '../types/jarvis';

interface SidebarProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  activeVoiceProfile: VoiceProfile;
  isPreviewingVoice: boolean;
  onQuickPreviewVoice: () => void;
  engineRoute: EngineRouteId;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  memoryCount: number;
  connectedAppsCount: number;
  publishedAppsCount: number;
  routerCount: number;
  tracesCount: number;
  user: User | null;
  onOpenAccount: () => void;
}

interface NavItem {
  id: NavTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  activeVoiceProfile,
  isPreviewingVoice,
  onQuickPreviewVoice,
  engineRoute,
  darkMode,
  onToggleDarkMode,
  memoryCount,
  connectedAppsCount,
  publishedAppsCount,
  routerCount,
  tracesCount,
  user,
  onOpenAccount,
}) => {
  const userInitials = (user?.displayName || user?.email || 'JV')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  const coreNav: NavItem[] = [
    { id: 'consola', label: 'Consola', icon: MessageSquare },
    { id: 'agentes', label: 'Agentes', icon: Bot },
    { id: 'memoria', label: 'Memoria', icon: Brain, count: memoryCount },
    { id: 'voces', label: 'Voces', icon: AudioLines },
    { id: 'trazas', label: 'Trazas', icon: Activity, count: tracesCount },
  ];

  const extraNav: NavItem[] = [
    { id: 'constructor', label: 'Constructor', icon: Blocks, count: publishedAppsCount },
    { id: 'router', label: 'Router', icon: Route, count: routerCount },
    { id: 'conectadas', label: 'Conectadas', icon: Plug, count: connectedAppsCount },
    { id: 'espectador', label: 'Espectador', icon: Eye },
    { id: 'video', label: 'Estudio Video', icon: Film },
    { id: 'buscador', label: 'Buscador Web', icon: Globe },
    { id: 'autonomo', label: 'Agente Autónomo', icon: Cpu },
  ];

  const currentEngine =
    ENGINE_ROUTES.find((e) => e.id === engineRoute) || ENGINE_ROUTES[0];

  const renderButton = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onSelectTab(item.id)}
        className={`group flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors ${
          isActive
            ? 'bg-primary/10 text-foreground ring-1 ring-inset ring-primary/30'
            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Icon
            className={`h-4 w-4 shrink-0 ${
              isActive
                ? 'text-primary'
                : 'text-muted-foreground group-hover:text-foreground'
            }`}
          />
          <span className="truncate font-medium">{item.label}</span>
        </span>
        {typeof item.count === 'number' && item.count > 0 ? (
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {item.count}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden w-[264px] shrink-0 flex-col border-r border-border/70 bg-sidebar/90 px-4 py-5 lg:flex">
        <div className="flex items-center gap-3 px-1">
          <BrandMark size={38} />
          <div className="min-w-0">
            <div className="font-heading text-[15px] font-semibold tracking-[0.22em] text-foreground">
              JARVIS
            </div>
            <div className="mono-label mt-0.5">consola personal</div>
          </div>
        </div>

        <div className="scroll-slim mt-6 flex-1 space-y-5 overflow-y-auto pr-1">
          <nav aria-label="Núcleo principal" className="space-y-1">
            <div className="mono-label px-3 pb-1">Núcleo</div>
            {coreNav.map(renderButton)}
          </nav>

          <nav aria-label="Módulos avanzados" className="space-y-1">
            <div className="mono-label px-3 pb-1">Capacidades Extra</div>
            {extraNav.map(renderButton)}
          </nav>

          {/* Active Voice Panel */}
          <div className="rounded-2xl border border-border/70 bg-card/60 p-3.5">
            <div className="mono-label">voz activa</div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="font-heading text-sm font-medium text-foreground">
                {activeVoiceProfile.name}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                {activeVoiceProfile.accentPitch}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {activeVoiceProfile.timbre}
            </p>
            <button
              type="button"
              onClick={onQuickPreviewVoice}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
            >
              {isPreviewingVoice ? (
                <>
                  <Square className="h-3.5 w-3.5" />
                  <span>Detener muestra</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  <span>Probar voz</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-2.5 border-t border-border/60 pt-3">
          <button
            type="button"
            onClick={() => onSelectTab('agentes')}
            className="flex w-full items-center gap-2.5 rounded-xl border border-border/60 px-3 py-2 text-left transition-colors hover:bg-accent/50"
          >
            <Zap className="h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="mono-label leading-none">motor</div>
              <div className="mt-1 truncate text-xs text-foreground">
                {currentEngine.label}
              </div>
            </div>
          </button>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={onOpenAccount}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1.5 py-1 text-left transition-colors hover:bg-accent/60"
            >
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Cuenta'}
                  referrerPolicy="no-referrer"
                  className="h-8 w-8 shrink-0 rounded-full border border-primary/40 object-cover"
                />
              ) : (
                <div
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border font-mono text-[11px] uppercase ${
                    user
                      ? 'border-primary/40 bg-primary/15 text-primary'
                      : 'border-border bg-secondary text-foreground'
                  }`}
                >
                  {userInitials}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-foreground">
                  {user ? user.displayName || user.email : 'Modo local'}
                </div>
                <div className="mono-label truncate">
                  {user ? 'cuenta conectada' : 'iniciar sesión'}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={onToggleDarkMode}
              title={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              className="rounded-lg border border-border/70 p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {darkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Header + Horizontal Scrollable Nav */}
      <div className="shrink-0 lg:hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <BrandMark size={28} />
            <span className="font-heading text-sm font-semibold tracking-[0.22em] text-foreground">
              JARVIS
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenAccount}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                user
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border/70 text-muted-foreground hover:text-foreground'
              }`}
            >
              {user ? (
                <span>{user.displayName?.split(' ')[0] || 'Cuenta'}</span>
              ) : (
                <>
                  <LogIn className="h-3.5 w-3.5" />
                  <span>Cuenta</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onToggleDarkMode}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {darkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              <span>{darkMode ? 'Claro' : 'Oscuro'}</span>
            </button>
          </div>
        </div>
        <div className="scroll-slim flex gap-1.5 overflow-x-auto border-b border-border/70 px-3 py-2">
          {[...coreNav, ...extraNav].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/30'
                    : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};
