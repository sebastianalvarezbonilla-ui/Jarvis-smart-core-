import React, { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { SectionHeader } from './BrandMark';
import type { TraceRecord } from '../types/jarvis';

interface TracesViewProps {
  traces: TraceRecord[];
  onClearTraces: () => void;
}

export const TracesView: React.FC<TracesViewProps> = ({ traces, onClearTraces }) => {
  const [opFilter, setOpFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    if (opFilter === 'all') return traces;
    return traces.filter((t) => t.operation === opFilter);
  }, [traces, opFilter]);

  const stats = useMemo(() => {
    const count = filtered.length;
    const avgLatency =
      count > 0
        ? Math.round(filtered.reduce((sum, t) => sum + t.latencyMs, 0) / count)
        : 0;
    const totalTokens = filtered.reduce(
      (sum, t) => sum + t.promptTokens + t.outputTokens,
      0
    );
    const totalEnergy = filtered.reduce((sum, t) => sum + t.estimatedEnergyWh, 0);
    return { count, avgLatency, totalTokens, totalEnergy };
  }, [filtered]);

  const operations = Array.from(new Set(traces.map((t) => t.operation)));

  return (
    <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-6">
        <SectionHeader
          label="telemetría en vivo"
          title="Trazas de ejecución"
          description="Registro real de latencia, modelos empleados, consumo de tokens, herramientas invocadas y energía estimada por operación."
          actions={
            traces.length > 0 ? (
              <button
                type="button"
                onClick={onClearTraces}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Limpiar trazas</span>
              </button>
            ) : null
          }
        />

        {/* 4-column Summary Strip */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="panel p-4">
            <div className="mono-label">operaciones</div>
            <div className="mt-1.5 font-mono text-2xl font-semibold text-foreground tabular-nums">
              {stats.count}
            </div>
          </div>
          <div className="panel p-4">
            <div className="mono-label">latencia media</div>
            <div className="mt-1.5 font-mono text-2xl font-semibold text-foreground tabular-nums">
              {stats.avgLatency} ms
            </div>
          </div>
          <div className="panel p-4">
            <div className="mono-label">tokens totales</div>
            <div className="mt-1.5 font-mono text-2xl font-semibold text-foreground tabular-nums">
              {stats.totalTokens.toLocaleString('es-ES')}
            </div>
          </div>
          <div className="panel p-4">
            <div className="mono-label">energía est.</div>
            <div className="mt-1.5 font-mono text-2xl font-semibold text-foreground tabular-nums">
              {stats.totalEnergy.toFixed(4)} Wh
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        {operations.length > 0 ? (
          <div className="mt-5 flex flex-wrap items-center gap-1 rounded-xl border border-border/70 bg-card/50 p-1">
            <button
              type="button"
              onClick={() => setOpFilter('all')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                opFilter === 'all'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Todas
            </button>
            {operations.map((op) => (
              <button
                key={op}
                type="button"
                onClick={() => setOpFilter(op)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium uppercase transition-colors ${
                  opFilter === op
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {op}
              </button>
            ))}
          </div>
        ) : null}

        {/* Traces Table */}
        <div className="panel mt-4 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Aún no hay trazas registradas. Envía un mensaje en Consola o ejecuta cualquier herramienta para ver la telemetría real aquí.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border/70 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-mono font-medium">Hora</th>
                    <th className="px-4 py-3 font-mono font-medium">Operación</th>
                    <th className="px-4 py-3 font-mono font-medium">Modelo</th>
                    <th className="px-4 py-3 font-mono font-medium">Herramientas</th>
                    <th className="px-4 py-3 text-right font-mono font-medium">Tokens</th>
                    <th className="px-4 py-3 text-right font-mono font-medium">Latencia</th>
                    <th className="px-4 py-3 text-right font-mono font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filtered.map((t) => (
                    <tr key={t.id} className="hover:bg-accent/30">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-muted-foreground tabular-nums">
                        {t.timestamp}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                        {t.operation.toUpperCase()}
                        {t.voice ? ` · ${t.voice}` : ''}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-muted-foreground">
                        {t.model}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">
                        {t.toolsUsed.length > 0 ? t.toolsUsed.join(', ') : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-foreground tabular-nums">
                        {(t.promptTokens + t.outputTokens).toLocaleString('es-ES')}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-foreground tabular-nums">
                        {t.latencyMs} ms
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono">
                        <span
                          className={
                            t.status === 'ok' ? 'text-emerald-400' : 'text-red-400'
                          }
                        >
                          {t.status === 'ok' ? 'OK' : 'ERROR'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
