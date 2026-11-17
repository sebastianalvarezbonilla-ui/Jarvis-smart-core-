import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  Gamepad2,
  Globe,
  Loader2,
  Monitor,
  Play,
  Plug,
  Square,
} from 'lucide-react';
import { SectionHeader } from './BrandMark';
import type {
  AutonomousStepLog,
  AutonomousTaskType,
  ConnectedAppRecord,
  EngineRouteId,
  PublishedAppRecord,
} from '../types/jarvis';

interface AutonomousAgentViewProps {
  connectedApps: ConnectedAppRecord[];
  publishedApps: PublishedAppRecord[];
  engineRoute: EngineRouteId;
  onApplyAppStatusChanges: (
    changes: Array<{ kind: 'published' | 'connected'; id: string; status: 'active' | 'paused' }>
  ) => void;
  onSpeakLine: (text: string) => void;
  onRecordTrace: (trace: {
    operation: 'autonomous';
    model: string;
    latencyMs: number;
    promptTokens: number;
    outputTokens: number;
    toolsUsed: string[];
    status: 'ok' | 'error';
  }) => void;
}

interface SnakeGameState {
  gridSize: number;
  snake: Array<{ x: number; y: number }>;
  food: { x: number; y: number };
  score: number;
  alive: boolean;
}

const INITIAL_GAME: SnakeGameState = {
  gridSize: 12,
  snake: [
    { x: 5, y: 6 },
    { x: 4, y: 6 },
    { x: 3, y: 6 },
  ],
  food: { x: 9, y: 4 },
  score: 0,
  alive: true,
};

export const AutonomousAgentView: React.FC<AutonomousAgentViewProps> = ({
  connectedApps,
  publishedApps,
  engineRoute,
  onApplyAppStatusChanges,
  onSpeakLine,
  onRecordTrace,
}) => {
  const [taskType, setTaskType] = useState<AutonomousTaskType>('google_research');
  const [goal, setGoal] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<AutonomousStepLog[]>([]);
  const [sources, setSources] = useState<Array<{ title: string; url: string }>>([]);
  const [companionScript, setCompanionScript] = useState('');
  const [copiedScript, setCopiedScript] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [gameState, setGameState] = useState<SnakeGameState>(INITIAL_GAME);
  const gameRef = useRef<SnakeGameState>(INITIAL_GAME);
  const runningRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const drawGame = (state: SnakeGameState) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cell = canvas.width / state.gridSize;

    ctx.fillStyle = '#090b10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= state.gridSize; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cell);
      ctx.lineTo(canvas.width, i * cell);
      ctx.stroke();
    }

    // Food
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(
      (state.food.x + 0.5) * cell,
      (state.food.y + 0.5) * cell,
      cell * 0.34,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Snake
    state.snake.forEach((seg, idx) => {
      ctx.fillStyle = idx === 0 ? '#2ee5cb' : '#189e8c';
      ctx.fillRect(seg.x * cell + 2, seg.y * cell + 2, cell - 4, cell - 4);
    });
  };

  useEffect(() => {
    if (taskType === 'play_game') {
      drawGame(gameState);
    }
  }, [taskType, gameState]);

  const applyGameMove = (
    current: SnakeGameState,
    move: string
  ): SnakeGameState => {
    if (!current.alive) return current;
    const head = current.snake[0];
    let dx = 0;
    let dy = 0;
    if (move === 'UP') dy = -1;
    else if (move === 'DOWN') dy = 1;
    else if (move === 'LEFT') dx = -1;
    else if (move === 'RIGHT') dx = 1;
    else {
      // STAY keeps heading
      const neck = current.snake[1] || head;
      dx = head.x - neck.x || 1;
      dy = head.y - neck.y;
    }
    const nx = head.x + dx;
    const ny = head.y + dy;

    if (
      nx < 0 ||
      ny < 0 ||
      nx >= current.gridSize ||
      ny >= current.gridSize ||
      current.snake.some((s) => s.x === nx && s.y === ny)
    ) {
      return { ...current, alive: false };
    }

    const ate = nx === current.food.x && ny === current.food.y;
    const nextSnake = [{ x: nx, y: ny }, ...current.snake];
    if (!ate) nextSnake.pop();

    let nextFood = current.food;
    if (ate) {
      nextFood = {
        x: Math.floor(Math.random() * current.gridSize),
        y: Math.floor(Math.random() * current.gridSize),
      };
    }

    return {
      ...current,
      snake: nextSnake,
      food: nextFood,
      score: ate ? current.score + 10 : current.score,
      alive: true,
    };
  };

  const stopAgent = () => {
    runningRef.current = false;
    setIsRunning(false);
  };

  const runAutonomousTask = async () => {
    setErrorMsg(null);
    setSources([]);
    setCompanionScript('');
    setIsRunning(true);
    runningRef.current = true;

    if (taskType === 'play_game') {
      gameRef.current = INITIAL_GAME;
      setGameState(INITIAL_GAME);
      setLogs([]);

      for (let step = 1; step <= 12; step++) {
        if (!runningRef.current || !gameRef.current.alive) break;
        try {
          const res = await fetch('/api/jarvis/autonomous/step', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              goal: goal || 'Alcanzar la comida evitando chocar',
              taskType: 'play_game',
              stepIndex: step,
              gameState: gameRef.current,
              engineRoute,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Error en paso autónomo.');

          const updated = applyGameMove(gameRef.current, data.move);
          gameRef.current = updated;
          setGameState(updated);

          setLogs((prev) => [
            {
              id: `step-${Date.now()}-${step}`,
              step,
              timestamp: new Date().toLocaleTimeString('es-ES'),
              action: data.action,
              observation: data.observation,
              outcome: updated.alive
                ? `${data.outcome} (Puntos: ${updated.score})`
                : 'Colisión detectada. Fin de ronda.',
              status: updated.alive ? 'ok' : 'warning',
            },
            ...prev,
          ]);
          onRecordTrace({
            operation: 'autonomous',
            model: data.model || 'gemini-3.1-flash-lite',
            latencyMs: data.latencyMs || 0,
            promptTokens: 0,
            outputTokens: 0,
            toolsUsed: ['autonomous_play_game'],
            status: 'ok',
          });
          if (!updated.alive) break;
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : 'Error ejecutando turno.');
          break;
        }
      }
      runningRef.current = false;
      setIsRunning(false);
      return;
    }

    try {
      const res = await fetch('/api/jarvis/autonomous/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal:
            goal ||
            (taskType === 'manage_apps'
              ? 'Verificar salud de todas las aplicaciones'
              : 'Investigar estado y fuentes relevantes'),
          taskType,
          stepIndex: 1,
          connectedApps,
          publishedApps: publishedApps.map((a) => ({
            id: a.id,
            slug: a.slug,
            title: a.title,
            status: a.status,
          })),
          engineRoute,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error ejecutando agente autónomo.');

      setLogs((prev) => [
        {
          id: `step-${Date.now()}`,
          step: prev.length + 1,
          timestamp: new Date().toLocaleTimeString('es-ES'),
          action: data.action || 'Ejecución autónoma',
          observation: data.observation || 'Completado',
          outcome: data.outcome || '',
          status: 'ok',
        },
        ...prev,
      ]);

      if (Array.isArray(data.sources)) setSources(data.sources);
      if (data.companionScript) setCompanionScript(data.companionScript);
      if (Array.isArray(data.statusChanges) && data.statusChanges.length > 0) {
        onApplyAppStatusChanges(data.statusChanges);
      }
      if (data.spokenLine) onSpeakLine(data.spokenLine);

      onRecordTrace({
        operation: 'autonomous',
        model: data.model || 'gemini-3.1-flash-lite',
        latencyMs: data.latencyMs || 0,
        promptTokens: 0,
        outputTokens: 0,
        toolsUsed: [`autonomous_${taskType}`],
        status: 'ok',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error en agente autónomo.');
    } finally {
      runningRef.current = false;
      setIsRunning(false);
    }
  };

  return (
    <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-6">
        <SectionHeader
          label="automatización multi-paso"
          title="Agente Autónomo"
          description="Ejecuta misiones completas de investigación en Google, auditoría de aplicaciones conectadas, flujos web o control autónomo en la Arena de juego."
        />

        <div className="panel mt-6 space-y-4 p-5">
          <div className="grid gap-2.5 sm:grid-cols-4">
            {(
              [
                {
                  id: 'google_research',
                  label: 'Investigación Google',
                  icon: Globe,
                },
                {
                  id: 'manage_apps',
                  label: 'Auditar Apps',
                  icon: Plug,
                },
                {
                  id: 'play_game',
                  label: 'Arena Juego IA',
                  icon: Gamepad2,
                },
                {
                  id: 'web_workflow',
                  label: 'Flujo Web / Script',
                  icon: Monitor,
                },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active = taskType === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTaskType(item.id)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors ${
                    active
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border/70 bg-background/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row">
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={
                taskType === 'google_research'
                  ? 'Ej. Investiga las mejores herramientas open-source de voz local en 2026'
                  : taskType === 'manage_apps'
                    ? 'Ej. Verifica qué integraciones están activas y resume su latencia'
                    : taskType === 'play_game'
                      ? 'Ej. Consigue la mayor puntuación evitando las paredes'
                      : 'Ej. Crea un script para resumir artículos largos o automatizar scroll'
              }
              className="flex-1 rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground"
            />
            {isRunning ? (
              <button
                type="button"
                onClick={stopAgent}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-2 text-xs font-medium text-red-300 whitespace-nowrap"
              >
                <Square className="h-3.5 w-3.5" />
                <span>Detener agente</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={runAutonomousTask}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 whitespace-nowrap"
              >
                <Play className="h-3.5 w-3.5" />
                <span>Ejecutar misión</span>
              </button>
            )}
          </div>
          {errorMsg ? <div className="text-xs text-red-400">{errorMsg}</div> : null}
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {taskType === 'play_game' ? (
            <div className="panel flex flex-col items-center p-5">
              <div className="mb-3 flex w-full items-center justify-between">
                <span className="mono-label">arena autónoma</span>
                <span className="font-mono text-xs text-primary tabular-nums">
                  Puntuación: {gameState.score} ·{' '}
                  {gameState.alive ? 'EN JUEGO' : 'FINALIZADO'}
                </span>
              </div>
              <canvas
                ref={canvasRef}
                width={320}
                height={320}
                className="rounded-xl border border-border/70"
              />
            </div>
          ) : null}

          <div
            className={`panel space-y-3 p-5 ${
              taskType === 'play_game' ? '' : 'lg:col-span-2'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="mono-label">bitácora de ejecución</span>
              {isRunning ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-primary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Ejecutando...</span>
                </span>
              ) : null}
            </div>

            {logs.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center text-xs text-muted-foreground">
                <Bot className="mb-2 h-7 w-7 text-primary/60" />
                <p>Lanza una misión arriba para ver los pasos y resultados autónomos.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-border/70 bg-background/40 p-3.5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-primary">
                        Paso {entry.step} · {entry.action}
                      </span>
                      <span className="mono-label tabular-nums">{entry.timestamp}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {entry.observation}
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {entry.outcome}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {sources.length > 0 ? (
              <div className="border-t border-border/60 pt-3 text-xs">
                <div className="mono-label mb-1.5">fuentes consultadas</div>
                <div className="flex flex-wrap gap-3">
                  {sources.map((s, idx) => (
                    <a
                      key={idx}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      {s.title}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {companionScript ? (
              <div className="border-t border-border/60 pt-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="mono-label">script compañero de navegador</span>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(companionScript);
                      setCopiedScript(true);
                      window.setTimeout(() => setCopiedScript(false), 2000);
                    }}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {copiedScript ? (
                      <>
                        <Check className="h-3 w-3" />
                        <span>Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="scroll-slim max-h-40 overflow-auto rounded-xl border border-border/70 bg-background/70 p-3 font-mono text-xs text-foreground">
                  {companionScript}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
