import React, { useState } from 'react';
import {
  BookOpen,
  ExternalLink,
  Globe,
  Loader2,
  Search,
  Volume2,
} from 'lucide-react';
import { SectionHeader } from './BrandMark';
import type {
  EngineRouteId,
  WebPageReadResult,
  WebSearchResultItem,
} from '../types/jarvis';

interface SearchWebReaderViewProps {
  engineRoute: EngineRouteId;
  onSpeakText: (text: string) => void;
  onRecordTrace: (trace: {
    operation: 'search';
    model: string;
    latencyMs: number;
    promptTokens: number;
    outputTokens: number;
    toolsUsed: string[];
    status: 'ok' | 'error';
  }) => void;
}

export const SearchWebReaderView: React.FC<SearchWebReaderViewProps> = ({
  engineRoute,
  onSpeakText,
  onRecordTrace,
}) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchAnswer, setSearchAnswer] = useState('');
  const [searchResults, setSearchResults] = useState<WebSearchResultItem[]>([]);

  const [urlInput, setUrlInput] = useState('');
  const [questionInput, setQuestionInput] = useState('');
  const [isReading, setIsReading] = useState(false);
  const [pageResult, setPageResult] = useState<WebPageReadResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setErrorMsg(null);
    setIsSearching(true);
    try {
      const res = await fetch('/api/jarvis/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, engineRoute }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo completar la búsqueda.');
      setSearchAnswer(data.answer || '');
      setSearchResults(data.results || []);
      onRecordTrace({
        operation: 'search',
        model: data.model || 'gemini-3.1-flash-lite',
        latencyMs: data.latencyMs || 0,
        promptTokens: data.promptTokens || 0,
        outputTokens: data.outputTokens || 0,
        toolsUsed: ['googleSearch'],
        status: 'ok',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error en búsqueda web.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleReadUrl = async (targetUrl?: string) => {
    const u = (targetUrl ?? urlInput).trim();
    if (!u) return;
    setUrlInput(u);
    setErrorMsg(null);
    setIsReading(true);
    try {
      const res = await fetch('/api/jarvis/web/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u, question: questionInput, engineRoute }),
      });
      const data = (await res.json()) as WebPageReadResult & {
        error?: string;
        promptTokens?: number;
        outputTokens?: number;
      };
      if (!res.ok) throw new Error(data.error || 'No se pudo leer la página.');
      setPageResult(data);
      onRecordTrace({
        operation: 'search',
        model: data.model || 'gemini-3.1-flash-lite',
        latencyMs: data.latencyMs || 0,
        promptTokens: data.promptTokens || 0,
        outputTokens: data.outputTokens || 0,
        toolsUsed: ['web_read'],
        status: 'ok',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error leyendo página.');
    } finally {
      setIsReading(false);
    }
  };

  return (
    <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6">
        <SectionHeader
          label="investigación en vivo"
          title="Buscador y Lector Web"
          description="Busca información verificada con Google Search en tiempo real y extrae el contenido limpio de cualquier página pública para resumir o hacer preguntas."
        />

        {errorMsg ? (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-2.5 text-xs text-red-300">
            {errorMsg}
          </div>
        ) : null}

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {/* Web Search Column */}
          <div className="panel flex flex-col space-y-4 p-5">
            <div className="mono-label">búsqueda con google grounding</div>
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ej. Novedades de TypeScript 7 o modelos locales..."
                  className="w-full rounded-xl border border-border bg-background/60 py-2 pl-9 pr-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching || !query.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                {isSearching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Globe className="h-3.5 w-3.5" />
                )}
                <span>Buscar</span>
              </button>
            </form>

            {searchAnswer ? (
              <div className="space-y-3 border-t border-border/60 pt-4">
                <div className="flex items-center justify-between">
                  <span className="mono-label">síntesis verificada</span>
                  <button
                    type="button"
                    onClick={() => onSpeakText(searchAnswer)}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                    <span>Escuchar</span>
                  </button>
                </div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {searchAnswer}
                </div>

                {searchResults.length > 0 ? (
                  <div className="space-y-2 border-t border-border/60 pt-3">
                    <div className="mono-label">fuentes ({searchResults.length})</div>
                    {searchResults.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">
                            {item.title}
                          </div>
                          <div className="truncate font-mono text-[11px] text-muted-foreground">
                            {item.domain}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleReadUrl(item.url)}
                            className="rounded-lg border border-border/70 px-2.5 py-1 text-xs text-primary hover:border-primary/40"
                          >
                            Leer
                          </button>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="py-10 text-center text-xs text-muted-foreground">
                Escribe una consulta para buscar en vivo y extraer fuentes citables.
              </div>
            )}
          </div>

          {/* Universal Web Reader Column */}
          <div className="panel flex flex-col space-y-4 p-5">
            <div className="mono-label">lector universal de páginas</div>
            <div className="space-y-2.5">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://ejemplo.com/articulo"
                  className="flex-1 rounded-xl border border-border bg-background/60 px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => handleReadUrl()}
                  disabled={isReading || !urlInput.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
                >
                  {isReading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <BookOpen className="h-3.5 w-3.5" />
                  )}
                  <span>Leer URL</span>
                </button>
              </div>
              <input
                type="text"
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                placeholder="Pregunta específica sobre esta página (opcional)"
                className="w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-foreground"
              />
            </div>

            {pageResult ? (
              <div className="space-y-3 border-t border-border/60 pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-heading text-sm font-semibold text-foreground">
                      {pageResult.title}
                    </h3>
                    <div className="mono-label mt-1 tabular-nums">
                      {pageResult.wordCount} palabras · {pageResult.readingTimeMin} min lectura ·{' '}
                      {pageResult.latencyMs}ms
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSpeakText(pageResult.aiSummary)}
                    className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                    <span>Escuchar</span>
                  </button>
                </div>

                <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {pageResult.aiSummary}
                </div>

                {pageResult.headings.length > 0 ? (
                  <div className="border-t border-border/60 pt-3">
                    <div className="mono-label mb-1.5">secciones detectadas</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {pageResult.headings.slice(0, 8).map((h, i) => (
                        <span key={i}>· {h}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="py-10 text-center text-xs text-muted-foreground">
                Pega cualquier URL pública o pulsa &ldquo;Leer&rdquo; en un resultado de búsqueda.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
