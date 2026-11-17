import React, { useState } from 'react';
import { Check, Download, Loader2, Play, Square } from 'lucide-react';
import { SectionHeader } from './BrandMark';
import { downloadBase64Wav } from '../utils/audioPlayer';
import {
  VOICE_PROFILES,
  type TtsModelId,
  type VoiceId,
} from '../types/jarvis';

interface VoicesViewProps {
  activeVoice: VoiceId;
  onSelectVoice: (voice: VoiceId) => void;
  voiceStyle: string;
  onChangeVoiceStyle: (style: string) => void;
  ttsModel: TtsModelId;
  onChangeTtsModel: (model: TtsModelId) => void;
  playbackRate: number;
  onChangePlaybackRate: (rate: number) => void;
  previewingVoice: VoiceId | null;
  synthesizingVoice: VoiceId | null;
  onPreviewVoice: (voice: VoiceId, customText?: string, overrideStyle?: string) => void;
  onStopAudio: () => void;
  lastGeneratedAudio: {
    voiceId: VoiceId;
    audioBase64: string;
    latencyMs: number;
    model: string;
  } | null;
}

export const VoicesView: React.FC<VoicesViewProps> = ({
  activeVoice,
  onSelectVoice,
  voiceStyle,
  onChangeVoiceStyle,
  ttsModel,
  onChangeTtsModel,
  playbackRate,
  onChangePlaybackRate,
  previewingVoice,
  synthesizingVoice,
  onPreviewVoice,
  onStopAudio,
  lastGeneratedAudio,
}) => {
  const [customPhrase, setCustomPhrase] = useState(
    'Sistemas verificados. Lista la consola Jarvis para ejecutar tu próximo proyecto.'
  );

  return (
    <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-7 sm:px-6">
        <SectionHeader
          label="voces neuronales"
          title="Voces"
          description="Elige el timbre con el que Jarvis te habla en consola, espectador y estudio de video. Escucha una muestra real antes de activarla."
        />

        {/* Tuning Panel */}
        <div className="panel mt-6 space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mono-label block">modelo de síntesis</label>
              <select
                value={ttsModel}
                onChange={(e) => onChangeTtsModel(e.target.value as TtsModelId)}
                className="mt-2 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="gemini-3.8-flash-lite-tts">
                  gemini-3.8-flash-lite-tts (Baja latencia)
                </option>
                <option value="gemini-3.8-flash-tts">
                  gemini-3.8-flash-tts (Expresiva / estudio)
                </option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="mono-label">velocidad de lectura</label>
                <span className="font-mono text-xs text-foreground tabular-nums">
                  {playbackRate.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0.8}
                max={1.4}
                step={0.05}
                value={playbackRate}
                onChange={(e) => onChangePlaybackRate(Number(e.target.value))}
                className="mt-3 w-full accent-primary"
              />
            </div>
          </div>

          <div>
            <label className="mono-label block">directiva de estilo vocal</label>
            <input
              type="text"
              value={voiceStyle}
              onChange={(e) => onChangeVoiceStyle(e.target.value)}
              placeholder="Ej. Sereno, dicción clara y pausas naturales"
              className="mt-1.5 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="mono-label block">frase de prueba personalizada</label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={customPhrase}
                onChange={(e) => setCustomPhrase(e.target.value)}
                className="flex-1 rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() =>
                  previewingVoice === activeVoice
                    ? onStopAudio()
                    : onPreviewVoice(activeVoice, customPhrase, voiceStyle)
                }
                disabled={synthesizingVoice === activeVoice}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
              >
                {synthesizingVoice === activeVoice ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Sintetizando...</span>
                  </>
                ) : previewingVoice === activeVoice ? (
                  <>
                    <Square className="h-3.5 w-3.5" />
                    <span>Detener</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    <span>Probar con {activeVoice}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {lastGeneratedAudio ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
              <span className="tabular-nums">
                Último audio: {lastGeneratedAudio.voiceId} · {lastGeneratedAudio.model} ·{' '}
                {lastGeneratedAudio.latencyMs}ms
              </span>
              <button
                type="button"
                onClick={() =>
                  downloadBase64Wav(
                    lastGeneratedAudio.audioBase64,
                    `jarvis-${lastGeneratedAudio.voiceId.toLowerCase()}.wav`
                  )
                }
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Descargar WAV</span>
              </button>
            </div>
          ) : null}
        </div>

        {/* Voice Profiles Grid */}
        <div className="mt-6 grid gap-3.5 sm:grid-cols-2">
          {VOICE_PROFILES.map((voice) => {
            const isActive = activeVoice === voice.id;
            const isPlaying = previewingVoice === voice.id;
            const isLoading = synthesizingVoice === voice.id;

            return (
              <article
                key={voice.id}
                className={`panel flex flex-col p-5 ${
                  isActive ? 'ring-1 ring-inset ring-primary/50' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-heading text-base font-semibold text-foreground">
                      {voice.name}
                    </h2>
                    <p className="mono-label mt-1">
                      {voice.register} · {voice.accentPitch}
                    </p>
                  </div>
                  {isActive ? (
                    <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
                      <Check className="h-3 w-3" />
                      activa
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {voice.timbre}
                </p>

                <div className="mt-2 text-xs text-muted-foreground">
                  Uso: {voice.recommendedFor}
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                  <button
                    type="button"
                    onClick={() =>
                      isPlaying ? onStopAudio() : onPreviewVoice(voice.id)
                    }
                    disabled={isLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        <span>Generando</span>
                      </>
                    ) : isPlaying ? (
                      <>
                        <Square className="h-3 w-3 text-primary" />
                        <span>Detener</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3" />
                        <span>Escuchar muestra</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onSelectVoice(voice.id);
                      onChangeVoiceStyle(voice.defaultStyle);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-primary/15 text-primary'
                        : 'bg-secondary text-foreground hover:bg-primary hover:text-primary-foreground'
                    }`}
                  >
                    {isActive ? 'Seleccionada' : 'Activar voz'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
};
