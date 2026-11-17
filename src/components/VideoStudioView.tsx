import React, { useEffect, useRef, useState } from 'react';
import {
  Captions,
  Download,
  Film,
  Loader2,
  Play,
  Sparkles,
  Square,
  Volume2,
} from 'lucide-react';
import { SectionHeader } from './BrandMark';
import { requestTtsAudio } from '../utils/audioPlayer';
import type {
  SubtitleCue,
  VideoAspectRatio,
  VideoProjectPlan,
  VideoSubtitleTheme,
  VoiceId,
} from '../types/jarvis';

interface VideoStudioViewProps {
  activeVoice: VoiceId;
  onRecordTrace: (trace: {
    operation: 'video';
    model: string;
    latencyMs: number;
    promptTokens: number;
    outputTokens: number;
    toolsUsed: string[];
    status: 'ok' | 'error';
  }) => void;
}

export const VideoStudioView: React.FC<VideoStudioViewProps> = ({
  activeVoice,
  onRecordTrace,
}) => {
  const [topic, setTopic] = useState('');
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>('16:9');
  const [subtitleTheme, setSubtitleTheme] =
    useState<VideoSubtitleTheme>('cinematic_bottom');
  const [durationSec, setDurationSec] = useState(16);
  const [plan, setPlan] = useState<VideoProjectPlan | null>(null);
  const [narrationAudioBase64, setNarrationAudioBase64] = useState<string | null>(null);
  const [scriptForSubs, setScriptForSubs] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const totalDuration = plan
    ? Math.max(
        6,
        plan.scenes.reduce((acc, s) => acc + (s.durationSec || 4), 0)
      )
    : durationSec;

  const stopPlayback = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
  };

  useEffect(() => {
    return () => stopPlayback();
  }, []);

  const drawFrameAt = (timeSec: number, project: VideoProjectPlan) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const { bgHex, accentHex, textHex } = project.palette;

    // Background + subtle radial glow
    ctx.fillStyle = bgHex || '#0A0F14';
    ctx.fillRect(0, 0, w, h);

    const grad = ctx.createRadialGradient(w * 0.5, h * 0.42, 20, w * 0.5, h * 0.42, w * 0.65);
    grad.addColorStop(0, `${accentHex}28`);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Find current scene
    let elapsed = 0;
    let activeScene = project.scenes[0];
    let sceneProgress = 0;
    for (const scene of project.scenes) {
      const dur = scene.durationSec || 4;
      if (timeSec <= elapsed + dur || scene === project.scenes[project.scenes.length - 1]) {
        activeScene = scene;
        sceneProgress = Math.min(1, Math.max(0, (timeSec - elapsed) / dur));
        break;
      }
      elapsed += dur;
    }

    if (activeScene) {
      ctx.save();
      const scale =
        activeScene.motionType === 'zoom_in' ? 1 + sceneProgress * 0.05 : 1;
      const offsetX =
        activeScene.motionType === 'pan_left'
          ? -sceneProgress * 18
          : activeScene.motionType === 'pan_right'
            ? sceneProgress * 18
            : 0;
      ctx.translate(w / 2 + offsetX, h / 2);
      ctx.scale(scale, scale);
      ctx.translate(-w / 2, -h / 2);

      // Decorative geometric frame
      ctx.strokeStyle = `${accentHex}55`;
      ctx.lineWidth = 2;
      ctx.strokeRect(48, 48, w - 96, h - 96);

      // Headline
      ctx.fillStyle = textHex || '#F8FAFC';
      ctx.textAlign = 'center';
      const titleSize = Math.round(w * 0.044);
      ctx.font = `700 ${titleSize}px "Plus Jakarta Sans", sans-serif`;
      const words = activeScene.headline.split(' ');
      const lines: string[] = [];
      let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > w * 0.72) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);

      const startY = h * 0.42 - ((lines.length - 1) * titleSize * 1.2) / 2;
      lines.forEach((ln, i) => {
        ctx.fillText(ln, w / 2, startY + i * titleSize * 1.2);
      });

      // Scene caption
      ctx.fillStyle = `${textHex}B0`;
      ctx.font = `400 ${Math.round(w * 0.022)}px "DM Sans", sans-serif`;
      ctx.fillText(activeScene.captionText.slice(0, 72), w / 2, startY + lines.length * titleSize * 1.2 + 16);
      ctx.restore();
    }

    // Active subtitle cue
    const activeCue = project.subtitles.find(
      (c) => timeSec >= c.startSec && timeSec <= c.endSec
    );
    if (activeCue) {
      const subFontSize = Math.round(w * (subtitleTheme === 'viral_bold' ? 0.032 : 0.024));
      ctx.font = `600 ${subFontSize}px "Plus Jakarta Sans", sans-serif`;
      ctx.textAlign = 'center';
      const textWidth = Math.min(w * 0.82, ctx.measureText(activeCue.text).width + 36);
      const boxY = subtitleTheme === 'editorial_card' ? h * 0.76 : h * 0.82;

      ctx.fillStyle =
        subtitleTheme === 'viral_bold' ? accentHex : 'rgba(7, 8, 11, 0.84)';
      ctx.beginPath();
      ctx.roundRect(w / 2 - textWidth / 2, boxY - subFontSize, textWidth, subFontSize * 1.65, 10);
      ctx.fill();

      ctx.fillStyle = subtitleTheme === 'viral_bold' ? '#07080b' : '#FFFFFF';
      ctx.fillText(activeCue.text, w / 2, boxY + subFontSize * 0.12, w * 0.78);
    }

    // Progress bar at very bottom
    const progress = Math.min(1, timeSec / totalDuration);
    ctx.fillStyle = `${accentHex}`;
    ctx.fillRect(0, h - 4, w * progress, 4);
  };

  useEffect(() => {
    if (plan) {
      drawFrameAt(currentTimeSec, plan);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, aspectRatio, subtitleTheme]);

  const handleGenerateVideo = async () => {
    if (!topic.trim()) return;
    stopPlayback();
    setErrorMsg(null);
    setIsGenerating(true);
    try {
      const res = await fetch('/api/jarvis/video/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          aspectRatio,
          durationSec,
          subtitleTheme,
        }),
      });
      const data = (await res.json()) as VideoProjectPlan & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Error generando proyecto de video.');
      setPlan(data);
      setScriptForSubs(data.narrationScript);
      setCurrentTimeSec(0);

      // Pre-synthesize Neural TTS voiceover
      if (data.narrationScript) {
        try {
          const tts = await requestTtsAudio({
            text: data.narrationScript,
            voiceName: activeVoice,
          });
          setNarrationAudioBase64(tts.audioBase64);
        } catch {
          setNarrationAudioBase64(null);
        }
      }

      onRecordTrace({
        operation: 'video',
        model: data.model || 'gemini-3.1-flash-lite',
        latencyMs: data.latencyMs || 0,
        promptTokens: 0,
        outputTokens: 0,
        toolsUsed: ['video_plan', 'tts'],
        status: 'ok',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo generar el video.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerateSubtitles = async () => {
    if (!plan || !scriptForSubs.trim()) return;
    setErrorMsg(null);
    try {
      const res = await fetch('/api/jarvis/video/auto-subtitles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptText: scriptForSubs,
          totalDurationSec: totalDuration,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error generando subtítulos.');
      setPlan({ ...plan, subtitles: data.subtitles as SubtitleCue[] });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error generando subtítulos.');
    }
  };

  const startPlayback = () => {
    if (!plan) return;
    stopPlayback();
    setIsPlaying(true);
    const startTs = performance.now();

    if (narrationAudioBase64) {
      const audio = new Audio(`data:audio/wav;base64,${narrationAudioBase64}`);
      audioRef.current = audio;
      void audio.play().catch(() => {});
    }

    const tick = (now: number) => {
      const t = (now - startTs) / 1000;
      setCurrentTimeSec(t);
      drawFrameAt(t, plan);
      if (t < totalDuration) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setIsPlaying(false);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const downloadSrt = () => {
    if (!plan) return;
    const fmt = (sec: number) => {
      const hrs = Math.floor(sec / 3600);
      const mins = Math.floor((sec % 3600) / 60);
      const secs = Math.floor(sec % 60);
      const ms = Math.round((sec % 1) * 1000);
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    };
    const srt = plan.subtitles
      .map((c) => `${c.index}\n${fmt(c.startSec)} --> ${fmt(c.endSec)}\n${c.text}\n`)
      .join('\n');
    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${plan.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportWebm = async () => {
    if (!plan || !canvasRef.current) return;
    setIsExporting(true);
    stopPlayback();
    try {
      const stream = canvasRef.current.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      const donePromise = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      });
      recorder.start();
      const startTs = performance.now();
      await new Promise<void>((resolve) => {
        const step = (now: number) => {
          const t = (now - startTs) / 1000;
          drawFrameAt(t, plan);
          if (t < Math.min(totalDuration, 25)) {
            requestAnimationFrame(step);
          } else {
            resolve();
          }
        };
        requestAnimationFrame(step);
      });
      recorder.stop();
      const blob = await donePromise;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${plan.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErrorMsg('Este navegador no soporta exportación WebM directa.');
    } finally {
      setIsExporting(false);
    }
  };

  const canvasDims =
    aspectRatio === '9:16'
      ? { width: 540, height: 960 }
      : aspectRatio === '1:1'
        ? { width: 720, height: 720 }
        : { width: 960, height: 540 };

  return (
    <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6">
        <SectionHeader
          label="producción audiovisual"
          title="Estudio de Video y Subtítulos"
          description="Genera guiones, escenas animadas, locución neuronal con tu voz activa y subtítulos sincronizados con exportación SRT y WebM."
        />

        <div className="panel mt-6 space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="mono-label block">tema o guión del video</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Ej. 3 claves de la arquitectura local-first en 2026"
                className="mt-1.5 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="mono-label block">formato</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as VideoAspectRatio)}
                className="mt-1.5 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-foreground"
              >
                <option value="16:9">16:9 Horizontal</option>
                <option value="9:16">9:16 Reels / Vertical</option>
                <option value="1:1">1:1 Cuadrado</option>
              </select>
            </div>
            <div>
              <label className="mono-label block">estilo subtítulos</label>
              <select
                value={subtitleTheme}
                onChange={(e) => setSubtitleTheme(e.target.value as VideoSubtitleTheme)}
                className="mt-1.5 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-foreground"
              >
                <option value="cinematic_bottom">Cinematográfico</option>
                <option value="viral_bold">Dinámico alto contraste</option>
                <option value="editorial_card">Editorial sobrio</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>Duración aprox.:</span>
              <input
                type="range"
                min={10}
                max={30}
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
                className="accent-primary"
              />
              <span className="font-mono text-foreground tabular-nums">{durationSec}s</span>
            </div>

            <button
              type="button"
              onClick={handleGenerateVideo}
              disabled={isGenerating || !topic.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              {isGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span>{isGenerating ? 'Produciendo...' : 'Generar video y locución'}</span>
            </button>
          </div>
          {errorMsg ? <div className="text-xs text-red-400">{errorMsg}</div> : null}
        </div>

        {plan ? (
          <div className="mt-6 grid gap-5 lg:grid-cols-5">
            <div className="panel space-y-3 p-4 lg:col-span-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-heading text-sm font-semibold text-foreground">
                  {plan.title}
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={isPlaying ? stopPlayback : startPlayback}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                  >
                    {isPlaying ? (
                      <>
                        <Square className="h-3 w-3" />
                        <span>Detener</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3" />
                        <span>Reproducir</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={downloadSrt}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-xs text-foreground hover:border-primary/40"
                  >
                    <Captions className="h-3.5 w-3.5" />
                    <span>.SRT</span>
                  </button>
                  <button
                    type="button"
                    onClick={exportWebm}
                    disabled={isExporting}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-xs text-foreground hover:border-primary/40 disabled:opacity-40"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>{isExporting ? 'Exportando...' : 'WebM'}</span>
                  </button>
                </div>
              </div>

              <div className="flex justify-center rounded-xl border border-border/70 bg-black/60 p-3">
                <canvas
                  ref={canvasRef}
                  width={canvasDims.width}
                  height={canvasDims.height}
                  className="max-h-[420px] w-auto rounded-lg"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                <span>
                  <Volume2 className="mr-1 inline h-3.5 w-3.5 text-primary" />
                  Voz: {activeVoice} {narrationAudioBase64 ? '(Audio listo)' : '(Sin audio)'}
                </span>
                <span>
                  {currentTimeSec.toFixed(1)}s / {totalDuration.toFixed(1)}s
                </span>
              </div>
            </div>

            <div className="panel space-y-4 p-4 lg:col-span-2">
              <div>
                <div className="mono-label">guión y subtítulos</div>
                <textarea
                  rows={4}
                  value={scriptForSubs}
                  onChange={(e) => setScriptForSubs(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-border bg-background/60 p-2.5 text-xs leading-relaxed text-foreground"
                />
                <button
                  type="button"
                  onClick={handleRegenerateSubtitles}
                  className="mt-2 rounded-lg border border-border/70 px-3 py-1.5 text-xs text-foreground hover:border-primary/40"
                >
                  Sincronizar subtítulos
                </button>
              </div>

              <div className="border-t border-border/60 pt-3">
                <div className="mono-label mb-2">escenas ({plan.scenes.length})</div>
                <div className="scroll-slim max-h-60 space-y-2 overflow-y-auto">
                  {plan.scenes.map((sc, i) => (
                    <div
                      key={sc.id || i}
                      className="rounded-lg border border-border/60 bg-background/40 p-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between font-medium text-foreground">
                        <span>
                          {i + 1}. {sc.headline}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                          {sc.durationSec}s
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {sc.captionText}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="panel mt-6 flex flex-col items-center justify-center p-10 text-center text-sm text-muted-foreground">
            <Film className="mb-2 h-8 w-8 text-primary/60" />
            <p>Escribe un tema arriba para generar un storyboard animado con subtítulos y voz neuronal.</p>
          </div>
        )}
      </div>
    </div>
  );
};
