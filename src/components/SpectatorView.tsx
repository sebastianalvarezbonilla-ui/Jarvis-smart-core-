import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Eye,
  Loader2,
  Monitor,
  Play,
  Square,
  Upload,
  Volume2,
} from 'lucide-react';
import { SectionHeader } from './BrandMark';
import type { EngineRouteId, SpectatorObservation } from '../types/jarvis';

interface SpectatorViewProps {
  engineRoute: EngineRouteId;
  onSpeakLine: (text: string) => void;
  onRecordTrace: (trace: {
    operation: 'vision';
    model: string;
    latencyMs: number;
    promptTokens: number;
    outputTokens: number;
    toolsUsed: string[];
    status: 'ok' | 'error';
  }) => void;
}

export const SpectatorView: React.FC<SpectatorViewProps> = ({
  engineRoute,
  onSpeakLine,
  onRecordTrace,
}) => {
  const [mode, setMode] = useState<'spectator' | 'game' | 'reels' | 'design'>('spectator');
  const [question, setQuestion] = useState('');
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [autoWatch, setAutoWatch] = useState(false);
  const [isStreamActive, setIsStreamActive] = useState(false);
  const [streamKind, setStreamKind] = useState<'screen' | 'camera' | null>(null);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [observations, setObservations] = useState<SpectatorObservation[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = () => {
    setAutoWatch(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreamActive(false);
    setStreamKind(null);
  };

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, []);

  const startScreenShare = async () => {
    setErrorMsg(null);
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 10 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      stream.getVideoTracks()[0].onended = () => stopStream();
      setUploadedPreview(null);
      setIsStreamActive(true);
      setStreamKind('screen');
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo iniciar la captura de pantalla.'
      );
    }
  };

  const startCamera = async () => {
    setErrorMsg(null);
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setUploadedPreview(null);
      setIsStreamActive(true);
      setStreamKind('camera');
    } catch {
      setErrorMsg('No se pudo acceder a la cámara.');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopStream();
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedPreview(String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  };

  const captureAndInspect = async () => {
    if (isInspecting) return;
    let base64 = '';
    let mimeType = 'image/jpeg';

    if (isStreamActive && videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      canvas.width = Math.min(1280, w);
      canvas.height = Math.round((canvas.width / w) * h);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        base64 = dataUrl.split(',')[1] || '';
      }
    } else if (uploadedPreview) {
      const parts = uploadedPreview.split(',');
      base64 = parts[1] || '';
      const mimeMatch = parts[0]?.match(/data:(.*?);/);
      if (mimeMatch?.[1]) mimeType = mimeMatch[1];
    }

    if (!base64) {
      setErrorMsg('Comparte pantalla, activa cámara o sube una imagen primero.');
      return;
    }

    setErrorMsg(null);
    setIsInspecting(true);
    try {
      const res = await fetch('/api/jarvis/vision/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          question,
          mode,
          engineRoute,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error analizando imagen.');

      const obs: SpectatorObservation = {
        id: `obs-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        contextLabel: data.contextLabel,
        summary: data.summary,
        spokenLine: data.spokenLine,
        suggestedActions: data.suggestedActions || [],
        model: data.model,
        latencyMs: data.latencyMs,
      };
      setObservations((prev) => [obs, ...prev].slice(0, 15));
      if (autoSpeak && obs.spokenLine) {
        onSpeakLine(obs.spokenLine);
      }
      onRecordTrace({
        operation: 'vision',
        model: data.model || 'gemini-3.1-flash-lite',
        latencyMs: data.latencyMs || 0,
        promptTokens: data.promptTokens || 0,
        outputTokens: data.outputTokens || 0,
        toolsUsed: [`vision_${mode}`],
        status: 'ok',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error de visión.');
    } finally {
      setIsInspecting(false);
    }
  };

  useEffect(() => {
    if (!autoWatch || !isStreamActive) return;
    const timer = window.setInterval(() => {
      void captureAndInspect();
    }, 6500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoWatch, isStreamActive, mode, question, autoSpeak]);

  return (
    <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-6">
        <SectionHeader
          label="visión multimodal"
          title="Espectador en Vivo"
          description="Comparte tu pantalla, cámara o captura de imagen para que Jarvis observe en tiempo real, sugiera acciones y narre lo que ocurre por voz."
        />

        <div className="mt-6 grid gap-5 lg:grid-cols-5">
          {/* Capture Stage */}
          <div className="panel space-y-4 p-4 lg:col-span-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={startScreenShare}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium ${
                  streamKind === 'screen'
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border/70 text-foreground hover:border-primary/40'
                }`}
              >
                <Monitor className="h-3.5 w-3.5" />
                <span>Compartir pantalla</span>
              </button>

              <button
                type="button"
                onClick={startCamera}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium ${
                  streamKind === 'camera'
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border/70 text-foreground hover:border-primary/40'
                }`}
              >
                <Camera className="h-3.5 w-3.5" />
                <span>Cámara</span>
              </button>

              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border/70 px-3 py-2 text-xs font-medium text-foreground hover:border-primary/40">
                <Upload className="h-3.5 w-3.5" />
                <span>Subir imagen</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>

              {isStreamActive ? (
                <button
                  type="button"
                  onClick={stopStream}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-border/70 px-3 py-2 text-xs text-red-400 hover:bg-accent"
                >
                  <Square className="h-3 w-3" />
                  <span>Detener</span>
                </button>
              ) : null}
            </div>

            <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border/70 bg-black/50">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={`h-full w-full object-contain ${isStreamActive ? '' : 'hidden'}`}
              />
              {!isStreamActive && uploadedPreview ? (
                <img
                  src={uploadedPreview}
                  alt="Captura cargada"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-contain"
                />
              ) : null}
              {!isStreamActive && !uploadedPreview ? (
                <div className="flex h-full flex-col items-center justify-center p-6 text-center text-xs text-muted-foreground">
                  <Eye className="mb-2 h-8 w-8 text-primary/60" />
                  <p>Selecciona compartir pantalla, cámara o sube una captura para empezar.</p>
                </div>
              ) : null}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            {/* Mode & Inspect Controls */}
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['spectator', 'General'],
                    ['game', 'Videojuego'],
                    ['reels', 'Reels / Feed'],
                    ['design', 'Crítico UI'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMode(id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      mode === id
                        ? 'bg-primary/15 text-primary ring-1 ring-inset ring-primary/30'
                        : 'border border-border/60 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Pregunta opcional (ej. ¿Qué botón debo pulsar?)"
                  className="flex-1 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-foreground"
                />
                <button
                  type="button"
                  onClick={captureAndInspect}
                  disabled={isInspecting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
                >
                  {isInspecting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  <span>{isInspecting ? 'Observando...' : 'Observar ahora'}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autoSpeak}
                    onChange={(e) => setAutoSpeak(e.target.checked)}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  <span>Narrar observación por voz</span>
                </label>
                {isStreamActive ? (
                  <button
                    type="button"
                    onClick={() => setAutoWatch((v) => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${
                      autoWatch
                        ? 'bg-primary/15 text-primary'
                        : 'border border-border/70 text-foreground'
                    }`}
                  >
                    <Play className="h-3 w-3" />
                    <span>{autoWatch ? 'Auto-vigilancia: ON' : 'Auto-vigilancia (6s)'}</span>
                  </button>
                ) : null}
              </div>
              {errorMsg ? <div className="text-xs text-red-400">{errorMsg}</div> : null}
            </div>
          </div>

          {/* Observations Feed */}
          <div className="panel flex flex-col p-4 lg:col-span-2">
            <div className="mono-label mb-3">observaciones en vivo</div>
            <div className="scroll-slim flex-1 space-y-3 overflow-y-auto max-h-[520px]">
              {observations.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground">
                  Las observaciones visuales de Jarvis aparecerán aquí.
                </div>
              ) : (
                observations.map((obs) => (
                  <div
                    key={obs.id}
                    className="rounded-xl border border-border/70 bg-background/40 p-3.5 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-medium text-primary">
                        {obs.contextLabel}
                      </span>
                      <span className="mono-label tabular-nums">{obs.timestamp}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-foreground">{obs.summary}</p>
                    {obs.suggestedActions.length > 0 ? (
                      <ul className="space-y-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                        {obs.suggestedActions.map((act, i) => (
                          <li key={i}>· {act}</li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="flex items-center justify-between pt-1">
                      <span className="mono-label tabular-nums">{obs.latencyMs}ms</span>
                      <button
                        type="button"
                        onClick={() => onSpeakLine(obs.spokenLine)}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <Volume2 className="h-3 w-3" />
                        <span>Escuchar</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
