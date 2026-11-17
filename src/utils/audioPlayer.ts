import type { TtsModelId, VoiceId } from '../types/jarvis';

export interface SynthesisRequest {
  text: string;
  voiceName: VoiceId;
  style?: string;
  ttsModel?: TtsModelId;
}

export interface SynthesisResponse {
  audioBase64: string;
  mimeType: string;
  voiceName: VoiceId;
  model: string;
  latencyMs: number;
  promptTokens: number;
  outputTokens: number;
}

export interface StreamPlaybackHandle {
  stop: () => void;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(binary);
}

function wrapPcm24kMonoToWavBase64(pcmChunks: Uint8Array[]): string {
  const totalDataLength = pcmChunks.reduce((acc, c) => acc + c.length, 0);
  const wav = new Uint8Array(44 + totalDataLength);
  const view = new DataView(wav.buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      wav[offset + i] = text.charCodeAt(i);
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + totalDataLength, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true);
  view.setUint32(28, 48000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, totalDataLength, true);

  let offset = 44;
  for (const chunk of pcmChunks) {
    wav.set(chunk, offset);
    offset += chunk.length;
  }

  return uint8ArrayToBase64(wav);
}

export function streamAndPlayTtsAudio(
  payload: SynthesisRequest,
  playbackRate: number,
  callbacks: {
    onFirstAudioChunk: () => void;
    onComplete: (result: SynthesisResponse) => void;
    onEnded: () => void;
    onError: (errMsg: string) => void;
  }
): StreamPlaybackHandle {
  const abortController = new AbortController();
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AudioCtx({ sampleRate: 24000 });
  const activeSources = new Set<AudioBufferSourceNode>();
  const pcmHistory: Uint8Array[] = [];
  let pendingByte: number | null = null;
  let nextStartTime = 0;
  let firstAudioSent = false;
  let stopped = false;
  let streamFinished = false;
  let lastSource: AudioBufferSourceNode | null = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    abortController.abort();
    for (const src of activeSources) {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    }
    activeSources.clear();
    if (ctx.state !== 'closed') {
      void ctx.close().catch(() => {});
    }
  };

  const schedulePcmBytes = (rawBytes: Uint8Array) => {
    if (stopped || rawBytes.length === 0) return;
    let combined = rawBytes;
    if (pendingByte !== null) {
      combined = new Uint8Array(1 + rawBytes.length);
      combined[0] = pendingByte;
      combined.set(rawBytes, 1);
      pendingByte = null;
    }

    const usableLen = combined.length - (combined.length % 2);
    if (combined.length % 2 === 1) {
      pendingByte = combined[combined.length - 1];
    }
    if (usableLen === 0) return;

    const sampleCount = usableLen / 2;
    const float32 = new Float32Array(sampleCount);
    const view = new DataView(combined.buffer, combined.byteOffset, usableLen);
    for (let i = 0; i < sampleCount; i++) {
      float32[i] = view.getInt16(i * 2, true) / 32768;
    }

    const audioBuffer = ctx.createBuffer(1, sampleCount, 24000);
    audioBuffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = playbackRate;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now + 0.02, nextStartTime);
    nextStartTime = startAt + audioBuffer.duration / playbackRate;
    activeSources.add(source);
    lastSource = source;

    source.onended = () => {
      activeSources.delete(source);
      if (streamFinished && activeSources.size === 0 && !stopped) {
        if (ctx.state !== 'closed') {
          void ctx.close().catch(() => {});
        }
        callbacks.onEnded();
      }
    };

    source.start(startAt);
    if (!firstAudioSent) {
      firstAudioSent = true;
      callbacks.onFirstAudioChunk();
    }
  };

  (async () => {
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const res = await fetch('/api/jarvis/tts-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify(payload),
      });

      if (!res.ok || !res.body) {
        const textBody = await res.text().catch(() => '');
        let msg = 'No se pudo iniciar el streaming de voz.';
        try {
          const parsed = JSON.parse(textBody);
          if (parsed?.error) msg = parsed.error;
        } catch {
          if (textBody) msg = textBody;
        }
        throw new Error(msg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalMeta: {
        model: string;
        voiceName: VoiceId;
        latencyMs: number;
        promptTokens: number;
        outputTokens: number;
      } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done || stopped) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const eventBlock of events) {
          const line = eventBlock.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          const data = JSON.parse(jsonStr) as {
            pcmBase64?: string;
            done?: boolean;
            error?: string;
            model?: string;
            voiceName?: VoiceId;
            latencyMs?: number;
            promptTokens?: number;
            outputTokens?: number;
          };

          if (data.error) {
            throw new Error(data.error);
          }

          if (data.pcmBase64) {
            const bytes = base64ToUint8Array(data.pcmBase64);
            pcmHistory.push(bytes);
            schedulePcmBytes(bytes);
          }

          if (data.done) {
            finalMeta = {
              model: data.model || payload.ttsModel || 'gemini-3.8-flash-lite-tts',
              voiceName: data.voiceName || payload.voiceName,
              latencyMs: data.latencyMs || 0,
              promptTokens: data.promptTokens || 0,
              outputTokens: data.outputTokens || 0,
            };
          }
        }
      }

      if (stopped) return;
      streamFinished = true;
      const wavBase64 = wrapPcm24kMonoToWavBase64(pcmHistory);

      callbacks.onComplete({
        audioBase64: wavBase64,
        mimeType: 'audio/wav',
        voiceName: finalMeta?.voiceName || payload.voiceName,
        model: finalMeta?.model || payload.ttsModel || 'gemini-3.8-flash-lite-tts',
        latencyMs: finalMeta?.latencyMs || 0,
        promptTokens: finalMeta?.promptTokens || 0,
        outputTokens: finalMeta?.outputTokens || 0,
      });

      if (!lastSource || activeSources.size === 0) {
        if (ctx.state !== 'closed') {
          void ctx.close().catch(() => {});
        }
        callbacks.onEnded();
      }
    } catch (err) {
      if (stopped) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      stop();
      callbacks.onError(
        err instanceof Error ? err.message : 'Error durante la síntesis de voz.'
      );
      callbacks.onEnded();
    }
  })();

  return { stop };
}

export async function requestTtsAudio(
  payload: SynthesisRequest
): Promise<SynthesisResponse> {
  const res = await fetch('/api/jarvis/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'No se pudo sintetizar la voz.');
  }
  return data as SynthesisResponse;
}

export function playBase64Wav(
  base64Audio: string,
  playbackRate = 1.0,
  onEnded?: () => void,
  onError?: (err: string) => void
): HTMLAudioElement {
  const audio = new Audio(`data:audio/wav;base64,${base64Audio}`);
  audio.playbackRate = playbackRate;
  audio.onended = () => {
    onEnded?.();
  };
  audio.onerror = () => {
    onError?.('No se pudo reproducir el audio WAV generado.');
    onEnded?.();
  };
  audio.play().catch((err) => {
    onError?.(
      err instanceof Error ? err.message : 'El navegador bloqueó la reproducción automática.'
    );
    onEnded?.();
  });
  return audio;
}

export function downloadBase64Wav(base64Audio: string, filename: string): void {
  const byteArray = base64ToUint8Array(base64Audio);
  const blob = new Blob([byteArray.buffer as ArrayBuffer], {
    type: 'audio/wav',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
