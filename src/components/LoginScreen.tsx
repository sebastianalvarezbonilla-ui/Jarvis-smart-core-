import React from 'react';
import { Cloud, Github, Loader2, Lock, ShieldCheck, UserCheck } from 'lucide-react';
import { BrandMark } from './BrandMark';

interface LoginScreenProps {
  isLoading: boolean;
  error: string | null;
  allowGuestMode: boolean;
  onSignInWithGoogle: () => void;
  onSignInWithGithub: () => void;
  onContinueAsGuest: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  isLoading,
  error,
  allowGuestMode,
  onSignInWithGoogle,
  onSignInWithGithub,
  onContinueAsGuest,
}) => {
  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground">
      <div className="panel relative z-10 w-full max-w-md p-7 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <BrandMark size={64} active={isLoading} />
          <div className="mono-label mt-5">jarvis smart core</div>
          <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-foreground">
            Inicia sesión en tu cuenta
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Guarda tu perfil, memorias, aplicaciones conectadas, preferencias de voz y tu historial sincronizados en la nube.
          </p>
        </div>

        <div className="mt-6 space-y-2.5 rounded-xl border border-border/70 bg-background/50 p-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2.5">
            <Cloud className="h-4 w-4 shrink-0 text-primary" />
            <span>Tu espacio personal sincronizado en Firestore por cuenta</span>
          </div>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
            <span>Acceso con Google o GitHub mediante ventana segura</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Lock className="h-4 w-4 shrink-0 text-primary" />
            <span>Control de sesión privada al abrir la consola</span>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-950/30 px-3.5 py-2.5 text-xs text-red-300">
            {error}
          </div>
        ) : null}

        <div className="mt-6 space-y-2.5">
          <button
            type="button"
            onClick={onSignInWithGoogle}
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserCheck className="h-4 w-4" />
            )}
            <span>{isLoading ? 'Conectando cuenta...' : 'Continuar con Google'}</span>
          </button>

          <button
            type="button"
            onClick={onSignInWithGithub}
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-border/80 bg-secondary/70 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Github className="h-4 w-4" />
            )}
            <span>Continuar con GitHub</span>
          </button>

          {allowGuestMode ? (
            <button
              type="button"
              onClick={onContinueAsGuest}
              disabled={isLoading}
              className="flex w-full items-center justify-center rounded-xl border border-border/60 px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
            >
              Entrar sin cuenta (Modo local)
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
