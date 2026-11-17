import React from 'react';
import {
  Cloud,
  Github,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { User } from '../lib/firebase';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  isLoading: boolean;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  requireLoginOnStart: boolean;
  error: string | null;
  onSignInWithGoogle: () => void;
  onSignInWithGithub: () => void;
  onSignOut: () => void;
  onToggleRequireLogin: () => void;
  onOpenLoginScreen: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  user,
  isLoading,
  syncStatus,
  requireLoginOnStart,
  error,
  onSignInWithGoogle,
  onSignInWithGithub,
  onSignOut,
  onToggleRequireLogin,
  onOpenLoginScreen,
}) => {
  if (!isOpen) return null;

  const initials = (user?.displayName || user?.email || 'JV')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  const providerLabel = user?.providerData?.some((p) => p.providerId === 'github.com')
    ? 'GitHub'
    : 'Google';

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel w-full max-w-md p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="mono-label">cuenta jarvis</div>
            <h2 className="mt-1 font-heading text-lg font-semibold text-foreground">
              {user ? `Cuenta conectada (${providerLabel})` : 'Iniciar sesión'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar cuenta"
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {user ? (
          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-3.5 rounded-2xl border border-border/70 bg-background/50 p-4">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Avatar'}
                  referrerPolicy="no-referrer"
                  className="h-12 w-12 shrink-0 rounded-full border border-primary/40 object-cover"
                />
              ) : (
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/15 font-mono text-sm font-semibold text-primary">
                  {initials}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">
                  {user.displayName || 'Cuenta Jarvis'}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {user.email || 'Correo no disponible'}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-primary">
                  {!user.emailVerified ? (
                    <span className="text-amber-300">
                      Correo pendiente de verificación para sincronizar en la nube
                    </span>
                  ) : syncStatus === 'syncing' ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Sincronizando con la nube…</span>
                    </>
                  ) : (
                    <>
                      <Cloud className="h-3 w-3" />
                      <span>Sincronización activa en Firestore</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onToggleRequireLogin}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/40 px-4 py-3 text-left transition-colors hover:border-primary/40"
            >
              <div className="flex items-start gap-3">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <div className="text-xs font-medium text-foreground">
                    Modo inicio de sesión al abrir
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Pide iniciar sesión antes de mostrar la consola al cerrar sesión.
                  </div>
                </div>
              </div>
              <span
                className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium ${
                  requireLoginOnStart
                    ? 'bg-primary/20 text-primary'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                {requireLoginOnStart ? 'Activo' : 'Opcional'}
              </span>
            </button>

            {error ? (
              <div className="rounded-xl border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onSignOut}
                disabled={isLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-border/70 px-4 py-2 text-xs font-medium text-foreground transition-colors hover:border-red-500/50 hover:text-red-300 disabled:opacity-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-border/70 bg-background/50 p-4 text-xs leading-relaxed text-muted-foreground">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span>Actualmente estás en modo local</span>
              </div>
              <p className="mt-1.5">
                Inicia sesión con Google o GitHub para crear tu cuenta personal y sincronizar tus memorias, aplicaciones conectadas y preferencias en la nube.
              </p>
            </div>

            {error ? (
              <div className="rounded-xl border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            ) : null}

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={onSignInWithGoogle}
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                <span>
                  {isLoading ? 'Conectando...' : 'Continuar con Google'}
                </span>
              </button>

              <button
                type="button"
                onClick={onSignInWithGithub}
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/80 bg-secondary/70 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-secondary disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Github className="h-4 w-4" />
                )}
                <span>Continuar con GitHub</span>
              </button>

              <button
                type="button"
                onClick={onOpenLoginScreen}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/70 px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Ir a pantalla de inicio de sesión</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
