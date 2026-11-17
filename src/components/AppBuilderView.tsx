import React, { useState } from 'react';
import {
  Check,
  Code2,
  ExternalLink,
  Eye,
  FileCode2,
  FolderGit2,
  GitBranch,
  Loader2,
  Monitor,
  Pause,
  Play,
  Rocket,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
} from 'lucide-react';
import { SectionHeader } from './BrandMark';
import type {
  DesignAuditReport,
  DesignStyleId,
  EngineRouteId,
  GithubRepoInspectResult,
  PublishedAppRecord,
} from '../types/jarvis';

interface AppBuilderViewProps {
  publishedApps: PublishedAppRecord[];
  engineRoute: EngineRouteId;
  onSaveApp: (app: PublishedAppRecord) => void;
  onToggleAppStatus: (id: string) => void;
  onDeleteApp: (id: string) => void;
  onRecordTrace: (trace: {
    operation: 'builder';
    model: string;
    latencyMs: number;
    promptTokens: number;
    outputTokens: number;
    toolsUsed: string[];
    status: 'ok' | 'error';
  }) => void;
}

const DESIGN_STYLES: Array<{ id: DesignStyleId; label: string; hint: string }> = [
  { id: 'editorial-suiza', label: 'Editorial Suiza', hint: 'Papel cálido, azul cobalto, 1px' },
  { id: 'revista-lujo', label: 'Revista Lujo', hint: 'Marfil, serif editorial, sobrio' },
  { id: 'producto-saas', label: 'Producto SaaS', hint: 'Gris neutro, métricas tabulares' },
  { id: 'estudio-creativo', label: 'Estudio Creativo', hint: 'Bento limpio, alto contraste' },
];

export const AppBuilderView: React.FC<AppBuilderViewProps> = ({
  publishedApps,
  engineRoute,
  onSaveApp,
  onToggleAppStatus,
  onDeleteApp,
  onRecordTrace,
}) => {
  const [builderSource, setBuilderSource] = useState<'prompt' | 'github'>('prompt');
  const [prompt, setPrompt] = useState('');
  const [repoUrlInput, setRepoUrlInput] = useState('');
  const [inspectedRepo, setInspectedRepo] = useState<GithubRepoInspectResult | null>(null);
  const [inspectedForInput, setInspectedForInput] = useState('');
  const [selectedFilePaths, setSelectedFilePaths] = useState<string[]>([]);
  const [showRepoFiles, setShowRepoFiles] = useState(false);
  const [isInspectingRepo, setIsInspectingRepo] = useState(false);

  const [designStyle, setDesignStyle] = useState<DesignStyleId>('editorial-suiza');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [slug, setSlug] = useState('');
  const [sourceRepoUrl, setSourceRepoUrl] = useState('');
  const [htmlCode, setHtmlCode] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditReport, setAuditReport] = useState<DesignAuditReport | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const inspectRepo = async (targetUrl?: string): Promise<GithubRepoInspectResult | null> => {
    const cleanUrl = (targetUrl ?? repoUrlInput).trim();
    if (!cleanUrl) {
      setErrorMsg('Pega una URL de repositorio de GitHub para leer su código.');
      return null;
    }
    setErrorMsg(null);
    setSavedNotice(null);
    setIsInspectingRepo(true);
    try {
      const res = await fetch('/api/jarvis/github/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: cleanUrl }),
      });
      const data = (await res.json()) as GithubRepoInspectResult & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo leer el repositorio de GitHub.');
      }
      setInspectedRepo(data);
      setInspectedForInput(cleanUrl);
      setSelectedFilePaths(data.files.map((f) => f.path));
      setSourceRepoUrl(data.repoUrl);
      if (!title.trim()) {
        setTitle(data.repo);
      }
      return data;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error leyendo el repositorio.');
      return null;
    } finally {
      setIsInspectingRepo(false);
    }
  };

  const toggleSelectedFile = (path: string) => {
    setSelectedFilePaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  };

  const handleGenerate = async (iterateExisting = false) => {
    setErrorMsg(null);
    setSavedNotice(null);

    if (builderSource === 'prompt' && !prompt.trim()) return;

    let activeRepo: GithubRepoInspectResult | null = null;
    if (builderSource === 'github' && !iterateExisting) {
      const cleanUrl = repoUrlInput.trim();
      if (!cleanUrl) {
        setErrorMsg('Ingresa la URL del repositorio de GitHub.');
        return;
      }
      if (inspectedRepo && inspectedForInput === cleanUrl) {
        activeRepo = inspectedRepo;
      } else {
        activeRepo = await inspectRepo(cleanUrl);
        if (!activeRepo) return;
      }
    } else if (builderSource === 'github' && inspectedRepo) {
      activeRepo = inspectedRepo;
    }

    const filteredRepoFiles = activeRepo
      ? activeRepo.files.filter(
          (f) => selectedFilePaths.length === 0 || selectedFilePaths.includes(f.path)
        )
      : [];

    setIsGenerating(true);
    try {
      const res = await fetch('/api/jarvis/generate-app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          currentHtml: iterateExisting ? htmlCode : '',
          designStyle,
          engineRoute,
          repoContext: activeRepo
            ? {
                fullName: activeRepo.fullName,
                repoUrl: activeRepo.repoUrl,
                branch: activeRepo.branch,
                description: activeRepo.description,
                language: activeRepo.language,
                treePaths: activeRepo.treePaths,
                files:
                  filteredRepoFiles.length > 0 ? filteredRepoFiles : activeRepo.files,
              }
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error generando aplicación.');
      setTitle(data.title);
      setSummary(data.summary);
      setSlug((prev) => prev || data.suggestedSlug);
      setHtmlCode(data.htmlCode);
      setAuditReport(null);
      if (activeRepo) {
        setSourceRepoUrl(activeRepo.repoUrl);
      }
      onRecordTrace({
        operation: 'builder',
        model: data.model || 'gemini-4-hydrogen',
        latencyMs: data.latencyMs || 0,
        promptTokens: data.promptTokens || 0,
        outputTokens: data.outputTokens || 0,
        toolsUsed: activeRepo ? ['github_inspect', 'generate_app'] : ['generate_app'],
        status: 'ok',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error generando aplicación.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAuditDesign = async () => {
    if (!htmlCode.trim()) return;
    setErrorMsg(null);
    setIsAuditing(true);
    try {
      const res = await fetch('/api/jarvis/design/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ htmlCode, designStyle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo auditar el diseño.');
      setAuditReport(data);
      if (data.refinedHtml) {
        setHtmlCode(data.refinedHtml);
      }
      onRecordTrace({
        operation: 'builder',
        model: data.model || 'gemini-4-hydrogen',
        latencyMs: data.latencyMs || 0,
        promptTokens: data.promptTokens || 0,
        outputTokens: data.outputTokens || 0,
        toolsUsed: ['design_audit'],
        status: 'ok',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error auditando diseño.');
    } finally {
      setIsAuditing(false);
    }
  };

  const handlePublish = () => {
    if (!htmlCode.trim()) return;
    const cleanSlug =
      (slug || title || 'mi-app')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '') || `app-${Date.now().toString(36)}`;
    const now = Date.now();
    const record: PublishedAppRecord = {
      id: editingId || `app-${now}-${Math.random().toString(36).slice(2, 6)}`,
      slug: cleanSlug,
      title: title.trim() || 'Aplicación Jarvis',
      summary: summary.trim() || 'Aplicación web publicada desde Constructor.',
      prompt:
        prompt.trim() ||
        (sourceRepoUrl ? `Realizada desde repositorio ${sourceRepoUrl}` : ''),
      htmlCode,
      status: 'active',
      designStyle,
      sourceRepoUrl: sourceRepoUrl.trim() || undefined,
      createdAtMs: now,
      updatedAtMs: now,
    };
    onSaveApp(record);
    setEditingId(record.id);
    setSlug(record.slug);
    setSavedNotice(`Publicada en /p/${record.slug}`);
  };

  const loadAppIntoEditor = (app: PublishedAppRecord) => {
    setEditingId(app.id);
    setTitle(app.title);
    setSummary(app.summary);
    setSlug(app.slug);
    setPrompt(app.prompt);
    setHtmlCode(app.htmlCode);
    setDesignStyle(app.designStyle || 'editorial-suiza');
    setSourceRepoUrl(app.sourceRepoUrl || '');
    if (app.sourceRepoUrl) {
      setBuilderSource('github');
      setRepoUrlInput(app.sourceRepoUrl);
    }
    setSavedNotice(null);
    setAuditReport(null);
  };

  const viewportWidth =
    viewport === 'mobile' ? '390px' : viewport === 'tablet' ? '768px' : '100%';

  const repoBusy = isInspectingRepo || isGenerating;
  const repoNeedsInspect =
    builderSource === 'github' &&
    (!inspectedRepo || inspectedForInput !== repoUrlInput.trim());

  return (
    <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6">
        <SectionHeader
          label="constructor de aplicaciones"
          title="Constructor & Repo GitHub"
          description="Crea aplicaciones web completas desde un prompt o lee directamente cualquier repositorio público de GitHub para realizarlo en vivo y publicarlo bajo /p/:slug."
        />

        {/* Source Switch, Repo Reader & Prompt Controls */}
        <div className="panel mt-6 space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="inline-flex rounded-lg border border-border/70 bg-background/50 p-0.5">
              <button
                type="button"
                onClick={() => {
                  setBuilderSource('prompt');
                  setErrorMsg(null);
                }}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  builderSource === 'prompt'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Desde Prompt</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setBuilderSource('github');
                  setErrorMsg(null);
                }}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  builderSource === 'github'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FolderGit2 className="h-3.5 w-3.5" />
                <span>Desde Repo GitHub</span>
              </button>
            </div>

            {builderSource === 'github' ? (
              <span className="mono-label">
                lee estructura, readme y código fuente del repo
              </span>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
            {DESIGN_STYLES.map((st) => {
              const active = designStyle === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setDesignStyle(st.id)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    active
                      ? 'border-primary/50 bg-primary/10 text-foreground'
                      : 'border-border/70 bg-background/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <div className="text-xs font-semibold text-foreground">{st.label}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{st.hint}</div>
                </button>
              );
            })}
          </div>

          {builderSource === 'github' ? (
            <div className="space-y-3 rounded-xl border border-border/70 bg-background/40 p-3.5">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <FolderGit2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={repoUrlInput}
                    onChange={(e) => setRepoUrlInput(e.target.value)}
                    placeholder="https://github.com/usuario/repositorio (o usuario/repo)"
                    className="w-full rounded-xl border border-border bg-background/70 py-2 pl-9 pr-3 font-mono text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void inspectRepo()}
                  disabled={repoBusy || !repoUrlInput.trim()}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border/80 bg-background/70 px-3.5 py-2 text-xs font-medium text-foreground hover:border-primary/50 disabled:opacity-40"
                >
                  {isInspectingRepo ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  ) : (
                    <GitBranch className="h-3.5 w-3.5 text-primary" />
                  )}
                  <span>{isInspectingRepo ? 'Leyendo repo...' : 'Leer código'}</span>
                </button>
              </div>

              {inspectedRepo ? (
                <div className="space-y-2.5 border-t border-border/60 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-heading text-xs font-semibold text-foreground">
                          {inspectedRepo.fullName}
                        </span>
                        <span className="mono-label">
                          rama {inspectedRepo.branch} · {inspectedRepo.language || 'Código'} ·{' '}
                          {selectedFilePaths.length}/{inspectedRepo.files.length} archivos
                          cargados ({inspectedRepo.totalTreeFiles} en árbol)
                        </span>
                      </div>
                      {inspectedRepo.description ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {inspectedRepo.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowRepoFiles((v) => !v)}
                        className="rounded-lg border border-border/70 px-2.5 py-1 text-[11px] font-medium text-foreground hover:border-primary/40"
                      >
                        {showRepoFiles ? 'Ocultar archivos' : 'Ver archivos leídos'}
                      </button>
                      <a
                        href={inspectedRepo.repoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                      >
                        <span>GitHub</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>

                  {showRepoFiles ? (
                    <div className="scroll-slim max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border/60 bg-background/60 p-2.5">
                      {inspectedRepo.files.map((file) => {
                        const checked = selectedFilePaths.includes(file.path);
                        return (
                          <label
                            key={file.path}
                            className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent/50"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSelectedFile(file.path)}
                                className="h-3.5 w-3.5 rounded border-border accent-primary"
                              />
                              <FileCode2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                              <span className="truncate font-mono text-[11px] text-foreground">
                                {file.path}
                              </span>
                            </span>
                            <span className="mono-label shrink-0 tabular-nums">
                              {Math.max(1, Math.round(file.size / 1024))} KB
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-3">
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                builderSource === 'github'
                  ? 'Instrucciones opcionales para realizar el repo (ej. Mantén todas las funciones clave, tradúcelo al español o añade tema oscuro)...'
                  : 'Ej. Crea un gestor de gastos personales con categorías, gráfica de barras SVG limpia y exportación CSV...'
              }
              className="w-full rounded-xl border border-border bg-background/60 p-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => void handleGenerate(false)}
                disabled={
                  repoBusy ||
                  (builderSource === 'prompt' ? !prompt.trim() : !repoUrlInput.trim())
                }
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                {repoBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : builderSource === 'github' ? (
                  <FolderGit2 className="h-3.5 w-3.5" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span>
                  {isInspectingRepo
                    ? 'Leyendo repositorio...'
                    : isGenerating
                    ? builderSource === 'github'
                      ? 'Realizando repo en vivo...'
                      : 'Generando app...'
                    : builderSource === 'github'
                    ? repoNeedsInspect
                      ? 'Leer y realizar aplicación'
                      : 'Realizar aplicación desde repo'
                    : 'Crear aplicación'}
                </span>
              </button>

              {htmlCode ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleGenerate(true)}
                    disabled={repoBusy || !prompt.trim()}
                    className="inline-flex items-center gap-2 rounded-xl border border-border/70 px-3.5 py-2 text-xs font-medium text-foreground hover:border-primary/40 disabled:opacity-40"
                  >
                    <span>Iterar sobre actual</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAuditDesign}
                    disabled={isAuditing}
                    className="inline-flex items-center gap-2 rounded-xl border border-border/70 px-3.5 py-2 text-xs font-medium text-foreground hover:border-primary/40 disabled:opacity-40"
                  >
                    {isAuditing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    ) : (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    )}
                    <span>{isAuditing ? 'Auditando UI...' : 'Refinar diseño UI'}</span>
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {errorMsg ? <div className="text-xs text-red-400">{errorMsg}</div> : null}
          {savedNotice ? (
            <div className="flex items-center gap-2 text-xs text-primary">
              <Check className="h-3.5 w-3.5" />
              <span>{savedNotice}</span>
              <a
                href={`/p/${slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline"
              >
                Abrir enlace <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ) : null}
        </div>

        {/* Audit Report */}
        {auditReport ? (
          <div className="panel mt-4 space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-heading text-sm font-semibold text-foreground">
                {auditReport.scoreLabel}
              </span>
              <span className="mono-label">{auditReport.typographyPairing}</span>
            </div>
            <div className="grid gap-3 pt-1 text-xs sm:grid-cols-2">
              <div>
                <div className="mono-label mb-1">hallazgos corregidos</div>
                <ul className="space-y-1 text-muted-foreground">
                  {auditReport.aiTellsFound.map((item, i) => (
                    <li key={i}>· {item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mono-label mb-1">mejoras aplicadas</div>
                <ul className="space-y-1 text-muted-foreground">
                  {auditReport.improvementsApplied.map((item, i) => (
                    <li key={i}>· {item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : null}

        {/* Preview & Publish Stage */}
        {htmlCode ? (
          <div className="panel mt-5 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Título"
                  className="rounded-lg border border-border/70 bg-background/60 px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="slug-url"
                  className="rounded-lg border border-border/70 bg-background/60 px-2.5 py-1 font-mono text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center rounded-lg border border-border/70 bg-background/40 p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('preview')}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs ${
                      viewMode === 'preview'
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground'
                    }`}
                  >
                    <Eye className="h-3 w-3" />
                    <span>Vista</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('code')}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs ${
                      viewMode === 'code'
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground'
                    }`}
                  >
                    <Code2 className="h-3 w-3" />
                    <span>HTML</span>
                  </button>
                </div>

                {viewMode === 'preview' ? (
                  <div className="hidden items-center rounded-lg border border-border/70 bg-background/40 p-0.5 sm:flex">
                    <button
                      type="button"
                      onClick={() => setViewport('desktop')}
                      className={`rounded-md p-1.5 ${
                        viewport === 'desktop' ? 'text-primary' : 'text-muted-foreground'
                      }`}
                      title="Escritorio"
                    >
                      <Monitor className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewport('tablet')}
                      className={`rounded-md p-1.5 ${
                        viewport === 'tablet' ? 'text-primary' : 'text-muted-foreground'
                      }`}
                      title="Tablet"
                    >
                      <Tablet className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewport('mobile')}
                      className={`rounded-md p-1.5 ${
                        viewport === 'mobile' ? 'text-primary' : 'text-muted-foreground'
                      }`}
                      title="Móvil"
                    >
                      <Smartphone className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={handlePublish}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                >
                  <Rocket className="h-3.5 w-3.5" />
                  <span>Guardar y publicar</span>
                </button>
              </div>
            </div>

            {viewMode === 'preview' ? (
              <div className="flex justify-center bg-black/40 p-3">
                <iframe
                  title={title || 'Vista previa'}
                  srcDoc={htmlCode}
                  sandbox="allow-scripts allow-forms allow-modals"
                  style={{ width: viewportWidth, height: '540px' }}
                  className="rounded-lg border border-border/70 bg-white transition-all"
                />
              </div>
            ) : (
              <textarea
                value={htmlCode}
                onChange={(e) => setHtmlCode(e.target.value)}
                spellCheck={false}
                className="h-[540px] w-full resize-none bg-background/80 p-4 font-mono text-xs leading-relaxed text-foreground focus:outline-none"
              />
            )}
          </div>
        ) : null}

        {/* Published Apps Registry */}
        <section className="mt-8">
          <div className="mono-label">aplicaciones publicadas</div>
          <h2 className="mt-1 font-heading text-lg font-semibold text-foreground">
            Registro local (/p/:slug)
          </h2>

          {publishedApps.length === 0 ? (
            <div className="panel mt-3 p-6 text-sm text-muted-foreground">
              Aún no has publicado ninguna aplicación. Genera una arriba o desde un repo de GitHub y pulsa &ldquo;Guardar y publicar&rdquo;.
            </div>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {publishedApps.map((app) => (
                <article key={app.id} className="panel flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-heading text-sm font-semibold text-foreground">
                        {app.title}
                      </h3>
                      <div className="mono-label mt-0.5 truncate">
                        /p/{app.slug} · {app.status === 'active' ? 'activa' : 'pausada'}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">
                    {app.summary}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => loadAppIntoEditor(app)}
                        className="rounded-lg border border-border/70 px-2.5 py-1 text-xs text-foreground hover:border-primary/40"
                      >
                        Editar
                      </button>
                      <a
                        href={`/p/${app.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-border/70 px-2.5 py-1 text-xs text-primary hover:border-primary/40"
                      >
                        <span>Abrir</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      {app.sourceRepoUrl ? (
                        <a
                          href={app.sourceRepoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-border/70 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <FolderGit2 className="h-3 w-3" />
                          <span>Repo</span>
                        </a>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onToggleAppStatus(app.id)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        title={app.status === 'active' ? 'Pausar' : 'Activar'}
                      >
                        {app.status === 'active' ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteApp(app.id)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-red-400"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
