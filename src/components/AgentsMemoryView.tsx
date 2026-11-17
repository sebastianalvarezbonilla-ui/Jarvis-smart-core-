import React, { useMemo, useState } from 'react';
import { Check, Plus, Search, Trash2, X } from 'lucide-react';
import { SectionHeader } from './BrandMark';
import {
  ENGINE_ROUTES,
  MEMORY_CATEGORY_LABELS,
  VOICE_PROFILES,
  type AgentPreset,
  type AgentPresetId,
  type EngineRouteId,
  type MemoryCategory,
  type MemoryNote,
  type VoiceId,
} from '../types/jarvis';

interface AgentsViewProps {
  agents: AgentPreset[];
  activePreset: AgentPresetId;
  onSelectPreset: (id: AgentPresetId) => void;
  onAddCustomAgent: (agent: AgentPreset) => void;
  onDeleteCustomAgent: (id: string) => void;
  engineRoute: EngineRouteId;
  onSelectEngineRoute: (route: EngineRouteId) => void;
}

export const AgentsView: React.FC<AgentsViewProps> = ({
  agents,
  activePreset,
  onSelectPreset,
  onAddCustomAgent,
  onDeleteCustomAgent,
  engineRoute,
  onSelectEngineRoute,
}) => {
  const [showCreator, setShowCreator] = useState(false);
  const [label, setLabel] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [skillsText, setSkillsText] = useState('Planificación, Síntesis');
  const [recommendedVoice, setRecommendedVoice] = useState<VoiceId>('Charon');
  const [thinkingLevel, setThinkingLevel] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [usesSearch, setUsesSearch] = useState(false);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !systemPrompt.trim()) return;
    const slug = label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const next: AgentPreset = {
      id: `custom-${slug || 'agent'}-${Date.now().toString(36)}`,
      label: label.trim(),
      roleTitle: roleTitle.trim() || 'Agente personalizado',
      yamlName: `${slug || 'custom'}.yaml`,
      description:
        description.trim() ||
        'Agente personalizado configurado con instrucciones y habilidades propias.',
      thinkingLevel,
      usesSearch,
      systemPrompt: systemPrompt.trim(),
      skills: skillsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      recommendedVoice,
      isCustom: true,
    };
    onAddCustomAgent(next);
    onSelectPreset(next.id);
    setLabel('');
    setRoleTitle('');
    setDescription('');
    setSystemPrompt('');
    setShowCreator(false);
  };

  return (
    <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-6">
        <SectionHeader
          label="agentes configurables"
          title="Agentes y Motor"
          description="Elige la personalidad operativa de Jarvis o crea agentes propios con instrucciones, habilidades, búsqueda web y voz asignada."
          actions={
            <button
              type="button"
              onClick={() => setShowCreator((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 whitespace-nowrap"
            >
              {showCreator ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              <span>{showCreator ? 'Cerrar editor' : 'Nuevo agente'}</span>
            </button>
          }
        />

        {showCreator ? (
          <form onSubmit={handleCreate} className="panel mt-6 space-y-4 p-5 animate-rise">
            <div className="mono-label">crear agente personalizado</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-foreground">
                  Nombre del agente
                </label>
                <input
                  type="text"
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Ej. Arquitecto Cloud"
                  className="mt-1.5 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground">
                  Especialidad breve
                </label>
                <input
                  type="text"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  placeholder="Ej. Infraestructura y costos"
                  className="mt-1.5 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground">
                Descripción corta
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Qué hace este agente cuando está activo."
                className="mt-1.5 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground">
                Instrucciones del sistema
              </label>
              <textarea
                rows={3}
                required
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Describe su tono, criterios de respuesta y formato..."
                className="mt-1.5 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-foreground">
                  Habilidades (separadas por coma)
                </label>
                <input
                  type="text"
                  value={skillsText}
                  onChange={(e) => setSkillsText(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground">
                  Voz sugerida
                </label>
                <select
                  value={recommendedVoice}
                  onChange={(e) => setRecommendedVoice(e.target.value as VoiceId)}
                  className="mt-1.5 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {VOICE_PROFILES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.register})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground">
                  Profundidad de razonamiento
                </label>
                <select
                  value={thinkingLevel}
                  onChange={(e) =>
                    setThinkingLevel(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')
                  }
                  className="mt-1.5 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="LOW">Baja (rápida)</option>
                  <option value="MEDIUM">Media (equilibrada)</option>
                  <option value="HIGH">Alta (profunda)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={usesSearch}
                  onChange={(e) => setUsesSearch(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span>Habilitar Google Search en tiempo real</span>
              </label>
              <button
                type="submit"
                className="rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                Guardar y activar agente
              </button>
            </div>
          </form>
        ) : null}

        {/* Agents Grid */}
        <div className="mt-6 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const isSelected = agent.id === activePreset;
            return (
              <article
                key={agent.id}
                className={`panel flex flex-col p-5 transition-colors ${
                  isSelected ? 'ring-1 ring-inset ring-primary/50' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-heading text-base font-semibold text-foreground truncate">
                      {agent.label}
                    </h2>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {agent.roleTitle}
                    </div>
                  </div>
                  {isSelected ? (
                    <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
                      <Check className="h-3 w-3" />
                      activo
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {agent.description}
                </p>

                <div className="mt-3 text-xs text-muted-foreground">
                  {agent.skills.join(' · ')}
                </div>

                <div className="mt-3 font-mono text-[11px] text-muted-foreground">
                  {agent.yamlName} · {agent.thinkingLevel}
                  {agent.usesSearch ? ' · Web Search' : ''} · Voz {agent.recommendedVoice}
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                  <button
                    type="button"
                    onClick={() => onSelectPreset(agent.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      isSelected
                        ? 'bg-primary/15 text-primary'
                        : 'border border-border/70 text-foreground hover:border-primary/40 hover:text-primary'
                    }`}
                  >
                    {isSelected ? 'Activo en consola' : 'Activar agente'}
                  </button>

                  {agent.isCustom ? (
                    <button
                      type="button"
                      onClick={() => onDeleteCustomAgent(agent.id)}
                      title="Eliminar agente"
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

        {/* Engine Routing Section */}
        <section className="mt-8 border-t border-border/60 pt-6">
          <div className="mono-label">enrutamiento de motor</div>
          <h2 className="mt-1 font-heading text-lg font-semibold text-foreground">
            Estrategia de inferencia
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {ENGINE_ROUTES.map((route) => {
              const active = engineRoute === route.id;
              return (
                <button
                  key={route.id}
                  type="button"
                  onClick={() => onSelectEngineRoute(route.id)}
                  className={`panel p-4 text-left transition-colors ${
                    active
                      ? 'ring-1 ring-inset ring-primary/50'
                      : 'hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-heading text-sm font-semibold text-foreground">
                      {route.label}
                    </span>
                    {active ? (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {route.detail}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

interface MemoryViewProps {
  memories: MemoryNote[];
  onAddMemory: (category: MemoryCategory, content: string) => void;
  onDeleteMemory: (id: string) => void;
}

export const MemoryView: React.FC<MemoryViewProps> = ({
  memories,
  onAddMemory,
  onDeleteMemory,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<'all' | MemoryCategory>('all');
  const [search, setSearch] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('preferencia');
  const [newContent, setNewContent] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return memories.filter((m) => {
      if (categoryFilter !== 'all' && m.category !== categoryFilter) return false;
      if (q && !m.content.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [memories, categoryFilter, search]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    onAddMemory(newCategory, newContent.trim());
    setNewContent('');
  };

  return (
    <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-7 sm:px-6">
        <SectionHeader
          label="memoria persistente"
          title="Memoria"
          description="Hechos, preferencias y contexto de proyectos que Jarvis recuerda automáticamente en cada conversación."
        />

        {/* Add Memory Form */}
        <form onSubmit={handleAdd} className="panel mt-6 p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
              className="rounded-xl border border-border bg-background/60 px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary sm:w-40"
            >
              {(Object.keys(MEMORY_CATEGORY_LABELS) as MemoryCategory[]).map((cat) => (
                <option key={cat} value={cat}>
                  {MEMORY_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Ej. Prefiero ejemplos en TypeScript estricto y respuestas directas..."
              className="flex-1 rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={!newContent.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Guardar nota</span>
            </button>
          </div>
        </form>

        {/* Filters & Search */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border/70 bg-card/50 p-1">
            {(['all', 'preferencia', 'proyecto', 'persona', 'contexto'] as const).map(
              (cat) => {
                const active = categoryFilter === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {cat === 'all' ? 'Todas' : MEMORY_CATEGORY_LABELS[cat]}
                  </button>
                );
              }
            )}
          </div>

          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar memoria..."
              className="w-full rounded-xl border border-border/70 bg-card/60 py-2 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Memory List */}
        <div className="mt-4 space-y-2.5">
          {filtered.length === 0 ? (
            <div className="panel p-8 text-center text-sm text-muted-foreground">
              No hay notas de memoria que coincidan con el filtro actual.
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                className="panel flex items-start justify-between gap-4 px-4 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono uppercase tracking-[0.12em] text-primary">
                      {MEMORY_CATEGORY_LABELS[item.category]}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{item.createdAt}</span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-foreground">
                    {item.content}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteMemory(item.id)}
                  aria-label="Eliminar nota"
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
