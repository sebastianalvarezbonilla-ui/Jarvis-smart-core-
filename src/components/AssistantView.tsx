import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Camera,
  ExternalLink,
  ImagePlus,
  Loader2,
  Mic,
  MicOff,
  Radio,
  RotateCcw,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import {
  ENGINE_ROUTES,
  type AgentPreset,
  type AgentPresetId,
  type ChatImageAttachment,
  type ChatMessage,
  type EngineRouteId,
  type NavTabId,
  type VoiceId,
} from '../types/jarvis';

interface SendMessageOptions {
  isRetry?: boolean;
  attachments?: ChatImageAttachment[];
  forceSpeak?: boolean;
}

interface AssistantViewProps {
  messages: ChatMessage[];
  agents: AgentPreset[];
  activePreset: AgentPresetId;
  onSelectPreset: (id: AgentPresetId) => void;
  engineRoute: EngineRouteId;
  onSelectEngineRoute: (route: EngineRouteId) => void;
  activeVoice: VoiceId;
  autoSpeak: boolean;
  onToggleAutoSpeak: () => void;
  isSending: boolean;
  onSendMessage: (text: string, options?: SendMessageOptions) => void;
  onRetryLast: () => void;
  onClearChat: () => void;
  playingMessageId: string | null;
  synthesizingMessageId: string | null;
  onSpeakMessage: (msg: ChatMessage) => void;
  onStopAudio: () => void;
  onNavigate: (tab: NavTabId) => void;
}

const STARTER_PROMPTS = [
  {
    title: 'Planificar jornada',
    prompt:
      'Actúa como Estratega y organízame un plan realista en 3 bloques para avanzar hoy en mis proyectos.',
  },
  {
    title: 'Investigar en la web',
    prompt:
      'Busca las novedades más relevantes de esta semana en inteligencia artificial local y resúmelo en 4 puntos.',
  },
  {
    title: 'Revisar memoria y apps',
    prompt:
      'Revisa qué notas tengo en mi memoria y qué aplicaciones tengo conectadas o publicadas ahora mismo.',
  },
  {
    title: 'Cambiar voz a Zephyr',
    prompt:
      'Cambia mi voz activa a Zephyr y dime una frase breve de bienvenida para probar cómo suena.',
  },
];

const MAX_ATTACHMENTS = 6;
const WAKE_WORD_REGEX = /\b(jarvis|yarvis|harvis|yervis|charvis|jarbis|yarbis|gervis)\b/i;

function normalizeTranscript(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function extractCommandAfterWake(rawText: string): { matched: boolean; command: string } {
  const normalized = normalizeTranscript(rawText);
  const match = WAKE_WORD_REGEX.exec(normalized);
  if (!match) {
    return { matched: false, command: '' };
  }
  const endIndex = match.index + match[0].length;
  const tail = rawText.slice(endIndex).replace(/^[\s,.:;!?¡¿-]+/, '').trim();
  return { matched: true, command: tail };
}

function playWakeChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now);
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(783.99, now + 0.09);
    gain2.gain.setValueAtTime(0.001, now + 0.09);
    gain2.gain.exponentialRampToValueAtTime(0.08, now + 0.11);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.09);
    osc2.stop(now + 0.3);

    window.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 450);
  } catch {
    // Ignore audio context block
  }
}

async function compressImageFile(file: File): Promise<ChatImageAttachment> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });

  if (file.type === 'image/png' && file.size <= 350_000) {
    const base64 = dataUrl.split('base64,')[1] || '';
    return {
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: file.name || 'captura.png',
      mimeType: 'image/png',
      data: base64,
      previewUrl: dataUrl,
    };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1280;
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        const base64 = dataUrl.split('base64,')[1] || '';
        resolve({
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name || 'foto.jpg',
          mimeType: file.type || 'image/jpeg',
          data: base64,
          previewUrl: dataUrl,
        });
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const compressedUrl = canvas.toDataURL('image/jpeg', 0.85);
      const base64 = compressedUrl.split('base64,')[1] || '';
      resolve({
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name || 'foto.jpg',
        mimeType: 'image/jpeg',
        data: base64,
        previewUrl: compressedUrl,
      });
    };
    img.onerror = () => reject(new Error('Formato de imagen no compatible.'));
    img.src = dataUrl;
  });
}

export const AssistantView: React.FC<AssistantViewProps> = ({
  messages,
  agents,
  activePreset,
  onSelectPreset,
  engineRoute,
  onSelectEngineRoute,
  activeVoice,
  autoSpeak,
  onToggleAutoSpeak,
  isSending,
  onSendMessage,
  onRetryLast,
  onClearChat,
  playingMessageId,
  synthesizingMessageId,
  onSpeakMessage,
  onStopAudio,
  onNavigate,
}) => {
  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatImageAttachment[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; name: string } | null>(
    null
  );

  // Manual push-to-talk dictation
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  // Hands-free wake-word ("Jarvis") control
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);
  const [wakePhase, setWakePhase] = useState<'off' | 'standby' | 'awake' | 'paused'>('off');
  const [liveWakeTranscript, setLiveWakeTranscript] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Refs for stable wake-word recognition callbacks
  const wakeEnabledRef = useRef(false);
  const wakeRecognitionRef = useRef<any>(null);
  const wakeAwakeRef = useRef(false);
  const wakeSessionOffsetRef = useRef(0);
  const wakeSilenceTimerRef = useRef<number | null>(null);
  const wakeTimeoutTimerRef = useRef<number | null>(null);
  const wakeRestartTimerRef = useRef<number | null>(null);
  const isBusyRef = useRef(false);
  const pendingAttachmentsRef = useRef<ChatImageAttachment[]>([]);
  const onSendMessageRef = useRef(onSendMessage);

  const isBusy =
    isSending ||
    Boolean(playingMessageId) ||
    Boolean(synthesizingMessageId) ||
    isRecording ||
    isTranscribing;

  useEffect(() => {
    isBusyRef.current = isBusy;
  }, [isBusy]);

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  useEffect(() => {
    onSendMessageRef.current = onSendMessage;
  }, [onSendMessage]);

  useEffect(() => {
    wakeEnabledRef.current = wakeWordEnabled;
  }, [wakeWordEnabled]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSending]);

  const clearWakeTimers = useCallback(() => {
    if (wakeSilenceTimerRef.current !== null) {
      window.clearTimeout(wakeSilenceTimerRef.current);
      wakeSilenceTimerRef.current = null;
    }
    if (wakeTimeoutTimerRef.current !== null) {
      window.clearTimeout(wakeTimeoutTimerRef.current);
      wakeTimeoutTimerRef.current = null;
    }
    if (wakeRestartTimerRef.current !== null) {
      window.clearTimeout(wakeRestartTimerRef.current);
      wakeRestartTimerRef.current = null;
    }
  }, []);

  const stopWakeRecognition = useCallback(() => {
    clearWakeTimers();
    wakeAwakeRef.current = false;
    setLiveWakeTranscript('');
    if (wakeRecognitionRef.current) {
      try {
        wakeRecognitionRef.current.onresult = null;
        wakeRecognitionRef.current.onend = null;
        wakeRecognitionRef.current.onerror = null;
        wakeRecognitionRef.current.stop();
      } catch {
        // Ignore stop errors
      }
      wakeRecognitionRef.current = null;
    }
  }, [clearWakeTimers]);

  const startWakeRecognition = useCallback(() => {
    if (!wakeEnabledRef.current || isBusyRef.current) return;
    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: new () => any }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => any })
        .webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setMicError(
        'Tu navegador no soporta escucha continua por palabra clave. Usa Chrome o Edge, o el botón de micrófono.'
      );
      setWakeWordEnabled(false);
      setWakePhase('off');
      return;
    }

    stopWakeRecognition();

    try {
      const rec = new SpeechRecognitionCtor();
      rec.lang = 'es-ES';
      rec.continuous = true;
      rec.interimResults = true;
      wakeSessionOffsetRef.current = 0;

      const returnToStandby = (nextOffset: number) => {
        clearWakeTimers();
        wakeAwakeRef.current = false;
        wakeSessionOffsetRef.current = nextOffset;
        setLiveWakeTranscript('');
        if (wakeEnabledRef.current && !isBusyRef.current) {
          setWakePhase('standby');
        }
      };

      const submitWakeCommand = (commandText: string, nextOffset: number) => {
        const cleanCmd = commandText.trim();
        const currentImgs = pendingAttachmentsRef.current;
        if (!cleanCmd && currentImgs.length === 0) {
          returnToStandby(nextOffset);
          return;
        }
        returnToStandby(nextOffset);
        if (currentImgs.length > 0) {
          setPendingAttachments([]);
        }
        onSendMessageRef.current(cleanCmd, {
          attachments: currentImgs.length > 0 ? currentImgs : undefined,
          forceSpeak: true,
        });
      };

      rec.onresult = (event: any) => {
        if (!wakeEnabledRef.current || isBusyRef.current) return;
        const results = event?.results;
        if (!results || results.length === 0) return;

        const startIdx = Math.min(wakeSessionOffsetRef.current, results.length);
        let segment = '';
        let lastResultIsFinal = false;

        for (let i = startIdx; i < results.length; i++) {
          const item = results[i];
          if (item && item[0]?.transcript) {
            segment += (segment ? ' ' : '') + item[0].transcript;
            lastResultIsFinal = Boolean(item.isFinal);
          }
        }

        const trimmedSegment = segment.trim();
        if (!trimmedSegment) return;

        if (!wakeAwakeRef.current) {
          const wakeCheck = extractCommandAfterWake(trimmedSegment);
          if (!wakeCheck.matched) {
            // Keep cursor fresh on finalized non-wake phrases to avoid stale buffer growth
            if (lastResultIsFinal && results.length - startIdx >= 3) {
              wakeSessionOffsetRef.current = results.length;
            }
            return;
          }

          // Wake word "Jarvis" detected!
          wakeAwakeRef.current = true;
          setWakePhase('awake');
          playWakeChime();

          if (wakeTimeoutTimerRef.current !== null) {
            window.clearTimeout(wakeTimeoutTimerRef.current);
          }
          wakeTimeoutTimerRef.current = window.setTimeout(() => {
            returnToStandby(results.length);
          }, 10000);

          if (wakeCheck.command) {
            setLiveWakeTranscript(wakeCheck.command);
            if (wakeSilenceTimerRef.current !== null) {
              window.clearTimeout(wakeSilenceTimerRef.current);
            }
            const delay = lastResultIsFinal ? 250 : 800;
            wakeSilenceTimerRef.current = window.setTimeout(() => {
              submitWakeCommand(wakeCheck.command, results.length);
            }, delay);
          } else {
            setLiveWakeTranscript('');
          }
          return;
        }

        // Already in awake mode: collect command after wake word (or entire new phrase)
        const wakeCheck = extractCommandAfterWake(trimmedSegment);
        const commandText = wakeCheck.matched ? wakeCheck.command : trimmedSegment;
        setLiveWakeTranscript(commandText);

        if (wakeTimeoutTimerRef.current !== null) {
          window.clearTimeout(wakeTimeoutTimerRef.current);
        }
        wakeTimeoutTimerRef.current = window.setTimeout(() => {
          if (commandText.trim().length > 1) {
            submitWakeCommand(commandText, results.length);
          } else {
            returnToStandby(results.length);
          }
        }, 9000);

        if (commandText.trim().length > 0) {
          if (wakeSilenceTimerRef.current !== null) {
            window.clearTimeout(wakeSilenceTimerRef.current);
          }
          const delay = lastResultIsFinal ? 250 : 800;
          wakeSilenceTimerRef.current = window.setTimeout(() => {
            submitWakeCommand(commandText, results.length);
          }, delay);
        }
      };

      rec.onerror = (event: any) => {
        const errCode = event?.error;
        if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
          setMicError(
            'Permite el acceso al micrófono para activar la escucha automática de "Jarvis".'
          );
          setWakeWordEnabled(false);
          setWakePhase('off');
          stopWakeRecognition();
        }
      };

      rec.onend = () => {
        wakeRecognitionRef.current = null;
        if (wakeEnabledRef.current && !isBusyRef.current) {
          wakeRestartTimerRef.current = window.setTimeout(() => {
            startWakeRecognition();
          }, 300);
        }
      };

      wakeRecognitionRef.current = rec;
      rec.start();
      setWakePhase('standby');
    } catch {
      setMicError('No se pudo iniciar el reconocimiento continuo de voz.');
      setWakeWordEnabled(false);
      setWakePhase('off');
    }
  }, [clearWakeTimers, stopWakeRecognition]);

  useEffect(() => {
    if (!wakeWordEnabled) {
      stopWakeRecognition();
      setWakePhase('off');
      return;
    }

    if (isBusy) {
      stopWakeRecognition();
      setWakePhase('paused');
      return;
    }

    const timer = window.setTimeout(() => {
      startWakeRecognition();
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [wakeWordEnabled, isBusy, startWakeRecognition, stopWakeRecognition]);

  useEffect(() => {
    return () => {
      stopWakeRecognition();
    };
  }, [stopWakeRecognition]);

  const toggleWakeWordMode = () => {
    setMicError(null);
    if (wakeWordEnabled) {
      setWakeWordEnabled(false);
      return;
    }
    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: new () => any }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => any })
        .webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setMicError(
        'La escucha continua "Jarvis" requiere Chrome, Edge o un navegador compatible con Web Speech API.'
      );
      return;
    }
    setWakeWordEnabled(true);
  };

  const handleFilesSelected = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    setMicError(null);
    const remainingSlots = MAX_ATTACHMENTS - pendingAttachments.length;
    if (remainingSlots <= 0) {
      setMicError(`Máximo ${MAX_ATTACHMENTS} fotos por mensaje.`);
      return;
    }

    const imageFiles = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, remainingSlots);

    if (imageFiles.length === 0) {
      setMicError('Selecciona archivos de imagen válidos (JPG, PNG, WEBP).');
      return;
    }

    try {
      const processed = await Promise.all(imageFiles.map((f) => compressImageFile(f)));
      setPendingAttachments((prev) => [...prev, ...processed].slice(0, MAX_ATTACHMENTS));
    } catch (err) {
      setMicError(err instanceof Error ? err.message : 'No se pudieron procesar las fotos.');
    }
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSubmit = () => {
    const trimmed = input.trim();
    if ((!trimmed && pendingAttachments.length === 0) || isSending) return;
    const attachmentsToSend = [...pendingAttachments];
    setInput('');
    setPendingAttachments([]);
    onSendMessage(trimmed, {
      attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
    });
  };

  const toggleVoiceDictation = async () => {
    setMicError(null);
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: new () => any }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => any })
        .webkitSpeechRecognition;

    if (SpeechRecognitionCtor) {
      try {
        const rec = new SpeechRecognitionCtor();
        rec.lang = 'es-ES';
        rec.interimResults = false;
        rec.onresult = (event: any) => {
          const transcript = event?.results?.[0]?.[0]?.transcript || '';
          if (transcript) {
            setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
          }
        };
        rec.onerror = () => {
          setIsRecording(false);
        };
        rec.onend = () => {
          setIsRecording(false);
        };
        rec.start();
        setIsRecording(true);
        return;
      } catch {
        // Fallback to MediaRecorder + Gemini STT
      }
    }

    // Fallback: record audio and transcribe via /api/jarvis/transcribe
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (blob.size < 100) return;
        setIsTranscribing(true);
        try {
          const reader = new FileReader();
          const base64: string = await new Promise((resolve, reject) => {
            reader.onloadend = () => {
              const res = String(reader.result || '');
              resolve(res.split(',')[1] || '');
            };
            reader.onerror = () => reject(new Error('Error leyendo audio'));
            reader.readAsDataURL(blob);
          });
          const res = await fetch('/api/jarvis/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: base64, mimeType: 'audio/webm' }),
          });
          const data = await res.json();
          if (res.ok && data.text) {
            setInput((prev) => (prev ? `${prev} ${data.text}` : data.text));
          } else {
            setMicError(data.error || 'No se pudo transcribir el audio.');
          }
        } catch (err) {
          setMicError(err instanceof Error ? err.message : 'Error de transcripción.');
        } finally {
          setIsTranscribing(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setMicError('Permite el acceso al micrófono para dictar por voz.');
      setIsRecording(false);
    }
  };

  const currentAgent = agents.find((a) => a.id === activePreset) || agents[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Subtle Top Workspace Bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="sr-only" htmlFor="console-agent-select">
            Agente activo
          </label>
          <select
            id="console-agent-select"
            value={activePreset}
            onChange={(e) => onSelectPreset(e.target.value)}
            className="rounded-lg border border-border/70 bg-card/80 px-2.5 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.label} · {agent.roleTitle}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="console-engine-select">
            Estrategia de motor
          </label>
          <select
            id="console-engine-select"
            value={engineRoute}
            onChange={(e) => onSelectEngineRoute(e.target.value as EngineRouteId)}
            className="rounded-lg border border-border/70 bg-card/80 px-2.5 py-1.5 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {ENGINE_ROUTES.map((r) => (
              <option key={r.id} value={r.id}>
                Motor: {r.label}
              </option>
            ))}
          </select>

          <span className="hidden text-xs text-muted-foreground sm:inline">
            Voz: <span className="font-mono text-foreground">{activeVoice}</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleWakeWordMode}
            title='Activa la escucha continua para activar a Jarvis diciendo "Jarvis"'
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              wakePhase === 'awake'
                ? 'border-primary bg-primary/20 text-primary ring-1 ring-primary/40'
                : wakeWordEnabled
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
          >
            <Radio
              className={`h-3.5 w-3.5 ${
                wakePhase === 'awake' || wakePhase === 'standby' ? 'animate-pulse' : ''
              }`}
            />
            <span>
              {wakePhase === 'awake'
                ? '¡Jarvis te escucha!'
                : wakePhase === 'paused'
                  ? 'Jarvis en pausa'
                  : wakeWordEnabled
                    ? 'Escuchando "Jarvis"'
                    : 'Oír "Jarvis"'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('constructor')}
            className="hidden shrink-0 whitespace-nowrap rounded-lg border border-border/70 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground sm:inline-flex"
          >
            Constructor
          </button>
          {messages.length > 0 ? (
            <button
              type="button"
              onClick={onClearChat}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border/70 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Limpiar</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Main Message Stream or Empty State */}
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          {messages.length === 0 ? (
            <div className="animate-rise flex flex-col items-center py-8 text-center sm:py-14">
              <BrandMark size={64} active={wakePhase === 'awake'} />
              <div className="mono-label mt-5">jarvis smart core</div>
              <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                ¿En qué trabajamos hoy?
              </h1>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
                Agente activo:{' '}
                <span className="font-medium text-foreground">{currentAgent?.label}</span>.{' '}
                {currentAgent?.description}
              </p>

              <div className="mt-8 grid w-full gap-3 text-left sm:grid-cols-2">
                {STARTER_PROMPTS.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => onSendMessage(item.prompt)}
                    className="panel group flex flex-col gap-1 p-4 text-left transition-colors hover:border-primary/40"
                  >
                    <div className="text-sm font-medium text-foreground group-hover:text-primary">
                      {item.title}
                    </div>
                    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {item.prompt}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isSpeaking = playingMessageId === msg.id;
              const isSynthesizing = synthesizingMessageId === msg.id;

              if (msg.role === 'user') {
                return (
                  <div key={msg.id} className="animate-rise flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md border border-border/70 bg-secondary/80 px-4 py-3 text-sm leading-relaxed text-foreground">
                      {msg.attachments && msg.attachments.length > 0 ? (
                        <div
                          className={`grid gap-2 ${
                            msg.attachments.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
                          } ${msg.content ? 'mb-2.5' : ''}`}
                        >
                          {msg.attachments.map((att) => {
                            const src =
                              att.previewUrl ||
                              (att.data ? `data:${att.mimeType};base64,${att.data}` : '');
                            if (!src) return null;
                            return (
                              <button
                                key={att.id}
                                type="button"
                                onClick={() => setLightboxImage({ src, name: att.name })}
                                className="overflow-hidden rounded-xl border border-border/60 bg-background/40 text-left transition-opacity hover:opacity-90"
                              >
                                <img
                                  src={src}
                                  alt={att.name}
                                  referrerPolicy="no-referrer"
                                  className="max-h-56 w-full object-cover"
                                />
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                      {msg.content ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : null}
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} className="animate-rise flex gap-3.5">
                  <div className="pt-1">
                    <BrandMark
                      size={26}
                      active={Boolean(msg.streaming) || isSynthesizing || isSpeaking}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-heading text-xs font-semibold tracking-[0.14em] text-foreground">
                        JARVIS
                      </span>
                      {msg.agentLabel ? (
                        <span className="mono-label">/ {msg.agentLabel}</span>
                      ) : null}
                      <span className="mono-label ml-auto tabular-nums">{msg.timestamp}</span>
                    </div>

                    <div
                      className={`mt-1.5 whitespace-pre-wrap text-sm leading-7 ${
                        msg.error ? 'text-red-400' : 'text-foreground/90'
                      }`}
                    >
                      {msg.content ? (
                        <>
                          {msg.content}
                          {msg.streaming ? (
                            <span className="ml-1 inline-block h-3.5 w-1.5 animate-pulse rounded-xs bg-primary align-middle" />
                          ) : null}
                        </>
                      ) : msg.streaming ? (
                        <span className="text-xs text-muted-foreground">
                          Respondiendo al instante...
                        </span>
                      ) : null}
                    </div>

                    {msg.launchActions && msg.launchActions.length > 0 ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {msg.launchActions.map((act) => (
                          <a
                            key={act.id}
                            href={act.launchUri}
                            target={act.launchUri.startsWith('http') ? '_blank' : '_self'}
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/15 px-3.5 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/25"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>Abrir {act.name}</span>
                          </a>
                        ))}
                      </div>
                    ) : null}

                    {msg.sources && msg.sources.length > 0 ? (
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border/50 pt-2.5 text-xs">
                        <span className="mono-label">Fuentes:</span>
                        {msg.sources.map((src, idx) => (
                          <a
                            key={`${src.url}-${idx}`}
                            href={src.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <span className="max-w-[200px] truncate">{src.title}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-2.5 flex flex-wrap items-center gap-3">
                      {msg.modelUsed ? (
                        <span className="mono-label tabular-nums">
                          {msg.modelUsed}
                          {msg.latencyMs ? ` · ${msg.latencyMs}ms` : ''}
                          {msg.outputTokens ? ` · ${msg.outputTokens} tok` : ''}
                        </span>
                      ) : null}

                      {msg.toolsUsed && msg.toolsUsed.length > 0 ? (
                        <span className="mono-label">
                          tools: {msg.toolsUsed.join(', ')}
                        </span>
                      ) : null}

                      {!msg.streaming ? (
                        !msg.error ? (
                          <button
                            type="button"
                            onClick={() =>
                              isSpeaking ? onStopAudio() : onSpeakMessage(msg)
                            }
                            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
                          >
                            {isSynthesizing ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                <span>sintetizando</span>
                              </>
                            ) : isSpeaking ? (
                              <>
                                <Square className="h-3 w-3 text-primary" />
                                <span>detener</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="h-3 w-3" />
                                <span>escuchar</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={onRetryLast}
                            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-primary hover:bg-accent"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Reintentar</span>
                          </button>
                        )
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {isSending && !messages.some((m) => m.streaming) ? (
            <div className="animate-rise flex items-center gap-3.5">
              <BrandMark size={26} active />
              <div className="text-xs text-muted-foreground">
                Procesando respuesta con {currentAgent?.label}...
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Bottom Docked Glass Composer */}
      <div className="shrink-0 border-t border-border/70 bg-background/80 px-4 pb-4 pt-3 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl">
          {micError ? (
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-red-400">
              <span>{micError}</span>
              <button
                type="button"
                onClick={() => setMicError(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                Cerrar
              </button>
            </div>
          ) : null}

          {wakeWordEnabled ? (
            <div
              className={`mb-2 flex items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-xs ${
                wakePhase === 'awake'
                  ? 'border-primary/60 bg-primary/15 text-primary'
                  : 'border-border/70 bg-card/70 text-muted-foreground'
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <Radio
                  className={`h-3.5 w-3.5 shrink-0 ${
                    wakePhase === 'awake' || wakePhase === 'standby'
                      ? 'animate-pulse text-primary'
                      : ''
                  }`}
                />
                <span className="truncate">
                  {wakePhase === 'awake'
                    ? liveWakeTranscript
                      ? `Escuchado: "${liveWakeTranscript}"`
                      : '¡Jarvis activo! Di tu orden ahora…'
                    : wakePhase === 'paused'
                      ? 'Escucha "Jarvis" en pausa mientras responde.'
                      : 'Control manos libres activo: di "Jarvis" seguido de tu orden.'}
                </span>
              </div>
              {wakePhase === 'awake' ? (
                <button
                  type="button"
                  onClick={() => {
                    clearWakeTimers();
                    wakeAwakeRef.current = false;
                    setLiveWakeTranscript('');
                    setWakePhase('standby');
                  }}
                  className="shrink-0 text-xs font-medium text-foreground hover:underline"
                >
                  Cancelar
                </button>
              ) : null}
            </div>
          ) : null}

          {/* Hidden File & Camera Inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFilesSelected(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              void handleFilesSelected(e.target.files);
              e.target.value = '';
            }}
          />

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingOver(false);
              void handleFilesSelected(e.dataTransfer.files);
            }}
            className={`panel flex flex-col gap-2 p-2 transition-colors focus-within:ring-1 focus-within:ring-primary/40 ${
              isDraggingOver ? 'border-primary/70 ring-1 ring-primary/50' : ''
            }`}
          >
            {pendingAttachments.length > 0 ? (
              <div className="flex flex-wrap gap-2 px-1 pt-1">
                {pendingAttachments.map((att) => (
                  <div
                    key={att.id}
                    className="group relative h-16 w-16 overflow-hidden rounded-xl border border-border/70 bg-background/60"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxImage({
                          src: att.previewUrl || `data:${att.mimeType};base64,${att.data}`,
                          name: att.name,
                        })
                      }
                      className="h-full w-full"
                    >
                      <img
                        src={att.previewUrl || `data:${att.mimeType};base64,${att.data}`}
                        alt={att.name}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => removePendingAttachment(att.id)}
                      aria-label={`Quitar ${att.name}`}
                      className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-background/85 text-foreground shadow transition-colors hover:bg-red-500 hover:text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex items-end gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending || pendingAttachments.length >= MAX_ATTACHMENTS}
                title="Adjuntar fotos o capturas"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-primary disabled:opacity-40"
              >
                <ImagePlus className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={isSending || pendingAttachments.length >= MAX_ATTACHMENTS}
                title="Tomar foto con cámara"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-primary disabled:opacity-40"
              >
                <Camera className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={toggleVoiceDictation}
                disabled={isTranscribing}
                title={isRecording ? 'Detener dictado' : 'Dictado por voz'}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors ${
                  isRecording
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-primary'
                }`}
              >
                {isTranscribing ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : isRecording ? (
                  <MicOff className="h-4 w-4 animate-pulse" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </button>

              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={(e) => {
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  const imageFiles: File[] = [];
                  for (let i = 0; i < items.length; i++) {
                    if (items[i].type.startsWith('image/')) {
                      const f = items[i].getAsFile();
                      if (f) imageFiles.push(f);
                    }
                  }
                  if (imageFiles.length > 0) {
                    e.preventDefault();
                    void handleFilesSelected(imageFiles);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder={
                  isRecording
                    ? 'Escuchando tu voz...'
                    : isTranscribing
                      ? 'Transcribiendo audio...'
                      : pendingAttachments.length > 0
                        ? 'Describe qué quieres hacer con estas fotos...'
                        : 'Habla, pega una foto o escribe a Jarvis...'
                }
                className="max-h-40 flex-1 resize-none bg-transparent py-2 text-sm leading-6 text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
              />

              <button
                type="button"
                onClick={onToggleAutoSpeak}
                title="Leer respuestas automáticamente en voz alta"
                className={`hidden h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-xs font-medium transition-colors sm:flex ${
                  autoSpeak
                    ? 'bg-primary/15 text-primary ring-1 ring-inset ring-primary/30'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <Volume2 className="h-3.5 w-3.5" />
                <span>{autoSpeak ? 'Auto-voz: Sí' : 'Auto-voz'}</span>
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={(!input.trim() && pendingAttachments.length === 0) || isSending}
                aria-label="Enviar mensaje"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Image Lightbox */}
      {lightboxImage ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[90vh] max-w-3xl overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between px-2 pt-1">
              <span className="truncate text-xs text-muted-foreground">
                {lightboxImage.name}
              </span>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                aria-label="Cerrar vista previa"
                className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <img
              src={lightboxImage.src}
              alt={lightboxImage.name}
              referrerPolicy="no-referrer"
              className="max-h-[80vh] w-auto rounded-xl object-contain"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};
