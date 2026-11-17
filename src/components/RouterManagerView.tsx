import React, { useState } from 'react';
import {
  Activity,
  Check,
  Loader2,
  Plus,
  Router as RouterIcon,
  Shield,
  Sparkles,
  Trash2,
  Wifi,
} from 'lucide-react';
import { SectionHeader } from './BrandMark';
import type {
  EngineRouteId,
  RouterAuthScheme,
  RouterDiagnosticReport,
  RouterDnsProtection,
  RouterPriorityMode,
  RouterProfileRecord,
  RouterReachMode,
  RouterSecurityLevel,
  RouterVendor,
  SimplifiedRouterConfig,
} from '../types/jarvis';

interface RouterManagerViewProps {
  routers: RouterProfileRecord[];
  engineRoute: EngineRouteId;
  onSaveRouter: (router: RouterProfileRecord) => void;
  onDeleteRouter: (id: string) => void;
  onRecordTrace: (trace: {
    operation: 'router';
    model: string;
    latencyMs: number;
    promptTokens: number;
    outputTokens: number;
    toolsUsed: string[];
    status: 'ok' | 'error';
  }) => void;
}

const DEFAULT_CONFIG: SimplifiedRouterConfig = {
  wifiName: 'Red-Hogar-Principal',
  reachMode: 'balanced',
  securityLevel: 'strict_family',
  priorityMode: 'balanced',
  dnsProtection: 'fast_private',
  guestWifiEnabled: false,
  guestWifiName: 'Red-Invitados',
  autoOptimizeChannel: true,
};

export const RouterManagerView: React.FC<RouterManagerViewProps> = ({
  routers,
  engineRoute,
  onSaveRouter,
  onDeleteRouter,
  onRecordTrace,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(routers[0]?.id || null);
  const [name, setName] = useState(routers[0]?.name || 'Router Principal');
  const [vendor, setVendor] = useState<RouterVendor>(routers[0]?.vendor || 'openwrt');
  const [hostUrl, setHostUrl] = useState(routers[0]?.hostUrl || '');
  const [adminUsername, setAdminUsername] = useState(routers[0]?.adminUsername || 'admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [authScheme, setAuthScheme] = useState<RouterAuthScheme>(
    routers[0]?.authScheme || 'basic'
  );
  const [snapshot, setSnapshot] = useState('');
  const [config, setConfig] = useState<SimplifiedRouterConfig>(() =>
    routers[0]
      ? {
          wifiName: routers[0].wifiName,
          reachMode: routers[0].reachMode,
          securityLevel: routers[0].securityLevel,
          priorityMode: routers[0].priorityMode,
          dnsProtection: routers[0].dnsProtection,
          guestWifiEnabled: routers[0].guestWifiEnabled,
          guestWifiName: routers[0].guestWifiName,
          autoOptimizeChannel: routers[0].autoOptimizeChannel,
        }
      : DEFAULT_CONFIG
  );

  const [nlInstruction, setNlInstruction] = useState('');
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [isSimplifying, setIsSimplifying] = useState(false);
  const [report, setReport] = useState<RouterDiagnosticReport | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadRouter = (r: RouterProfileRecord) => {
    setSelectedId(r.id);
    setName(r.name);
    setVendor(r.vendor);
    setHostUrl(r.hostUrl);
    setAdminUsername(r.adminUsername);
    setAuthScheme(r.authScheme);
    setConfig({
      wifiName: r.wifiName,
      reachMode: r.reachMode,
      securityLevel: r.securityLevel,
      priorityMode: r.priorityMode,
      dnsProtection: r.dnsProtection,
      guestWifiEnabled: r.guestWifiEnabled,
      guestWifiName: r.guestWifiName,
      autoOptimizeChannel: r.autoOptimizeChannel,
    });
    setReport(null);
    setStatusMessage(null);
  };

  const handleSaveProfile = (diagnosticOverride?: RouterDiagnosticReport) => {
    const now = Date.now();
    const record: RouterProfileRecord = {
      id: selectedId || `router-${now}`,
      name: name.trim() || 'Router Principal',
      vendor,
      hostUrl: hostUrl.trim(),
      adminUsername: adminUsername.trim() || 'admin',
      authScheme,
      connectionStatus: diagnosticOverride?.connectionObserved.reachable
        ? 'connected'
        : hostUrl.trim()
          ? 'untested'
          : 'untested',
      lastHttpCode: diagnosticOverride?.connectionObserved.httpStatus ?? 0,
      lastLatencyMs: diagnosticOverride?.connectionObserved.latencyMs ?? 0,
      lastDiagnosticHealth: diagnosticOverride?.overallHealth ?? 'unknown',
      lastDiagnosticSummary: diagnosticOverride?.summary ?? '',
      ...config,
      createdAtMs: now,
      updatedAtMs: now,
    };
    onSaveRouter(record);
    setSelectedId(record.id);
    setStatusMessage('Perfil de router guardado en consola.');
  };

  const handleDiagnose = async () => {
    setIsDiagnosing(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/jarvis/router/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          vendor,
          hostUrl,
          adminUsername,
          adminPassword,
          authScheme,
          diagnosticSnapshot: snapshot,
          simplifiedConfig: config,
          engineRoute,
        }),
      });
      const data = (await res.json()) as RouterDiagnosticReport & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Error ejecutando diagnóstico.');
      setReport(data);
      handleSaveProfile(data);
      onRecordTrace({
        operation: 'router',
        model: data.model || 'gemini-3.1-flash-lite',
        latencyMs: data.latencyMs || 0,
        promptTokens: 0,
        outputTokens: 0,
        toolsUsed: ['router_diagnose'],
        status: 'ok',
      });
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? err.message : 'No se pudo diagnosticar el router.'
      );
    } finally {
      setIsDiagnosing(false);
    }
  };

  const handleSimplify = async () => {
    if (!nlInstruction.trim()) return;
    setIsSimplifying(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/jarvis/router/simplify-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: nlInstruction, currentConfig: config }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo ajustar la configuración.');
      setConfig((prev) => ({
        ...prev,
        ...(data.reachMode ? { reachMode: data.reachMode } : {}),
        ...(data.securityLevel ? { securityLevel: data.securityLevel } : {}),
        ...(data.priorityMode ? { priorityMode: data.priorityMode } : {}),
        ...(data.dnsProtection ? { dnsProtection: data.dnsProtection } : {}),
        ...(typeof data.guestWifiEnabled === 'boolean'
          ? { guestWifiEnabled: data.guestWifiEnabled }
          : {}),
        ...(typeof data.autoOptimizeChannel === 'boolean'
          ? { autoOptimizeChannel: data.autoOptimizeChannel }
          : {}),
      }));
      setStatusMessage(data.explanation || 'Configuración ajustada.');
      setNlInstruction('');
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Error ajustando parámetros.');
    } finally {
      setIsSimplifying(false);
    }
  };

  return (
    <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-6">
        <SectionHeader
          label="red y diagnóstico"
          title="Router Inteligente"
          description="Gestiona tu Wi-Fi con controles sencillos en lenguaje claro, evalúa las 5 áreas críticas de tu red y aplica ajustes rápidos con IA."
          actions={
            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                setName('Nuevo Router');
                setHostUrl('');
                setConfig(DEFAULT_CONFIG);
                setReport(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 px-3 py-2 text-xs font-medium text-foreground hover:border-primary/40"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nuevo perfil</span>
            </button>
          }
        />

        {/* Saved Routers Bar */}
        {routers.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {routers.map((r) => (
              <div
                key={r.id}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs ${
                  selectedId === r.id
                    ? 'border-primary/50 bg-primary/10 text-foreground'
                    : 'border-border/70 bg-card/60 text-muted-foreground'
                }`}
              >
                <button
                  type="button"
                  onClick={() => loadRouter(r)}
                  className="inline-flex items-center gap-1.5 font-medium"
                >
                  <RouterIcon className="h-3.5 w-3.5 text-primary" />
                  <span>{r.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteRouter(r.id)}
                  className="text-muted-foreground hover:text-red-400"
                  title="Eliminar perfil"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {/* Connection & Telemetry */}
          <div className="panel space-y-4 p-5">
            <div className="mono-label">conexión del router</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-muted-foreground">Nombre</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground">Marca / Sistema</label>
                <select
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value as RouterVendor)}
                  className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="openwrt">OpenWrt</option>
                  <option value="tplink">TP-Link</option>
                  <option value="asus">ASUS</option>
                  <option value="unifi">Ubiquiti UniFi</option>
                  <option value="mikrotik">MikroTik</option>
                  <option value="generic">Otro / Genérico</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground">
                URL de administración o túnel (opcional)
              </label>
              <input
                type="text"
                value={hostUrl}
                onChange={(e) => setHostUrl(e.target.value)}
                placeholder="Ej. https://mi-router.duckdns.org o 192.168.1.1"
                className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs text-muted-foreground">Auth</label>
                <select
                  value={authScheme}
                  onChange={(e) => setAuthScheme(e.target.value as RouterAuthScheme)}
                  className="mt-1 w-full rounded-xl border border-border bg-background/60 px-2.5 py-2 text-xs text-foreground"
                >
                  <option value="none">Sin auth</option>
                  <option value="basic">Basic</option>
                  <option value="bearer">Bearer</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground">Usuario</label>
                <input
                  type="text"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-background/60 px-2.5 py-2 text-xs text-foreground"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground">Clave / Token</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Opcional"
                  className="mt-1 w-full rounded-xl border border-border bg-background/60 px-2.5 py-2 text-xs text-foreground"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground">
                Pegar estado o log del router (opcional para análisis sin túnel)
              </label>
              <textarea
                rows={3}
                value={snapshot}
                onChange={(e) => setSnapshot(e.target.value)}
                placeholder="Pega aquí la salida de estado Wi-Fi, ping, canales o lista de clientes..."
                className="mt-1 w-full rounded-xl border border-border bg-background/60 p-2.5 font-mono text-xs text-foreground"
              />
            </div>

            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleDiagnose}
                disabled={isDiagnosing}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {isDiagnosing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Activity className="h-3.5 w-3.5" />
                )}
                <span>{isDiagnosing ? 'Diagnosticando...' : 'Diagnosticar red'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleSaveProfile()}
                className="rounded-xl border border-border/70 px-3.5 py-2 text-xs font-medium text-foreground hover:border-primary/40"
              >
                Guardar perfil
              </button>
            </div>
          </div>

          {/* Simplified Non-Technical Config */}
          <div className="panel space-y-4 p-5">
            <div className="mono-label">controles simplificados</div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-muted-foreground">Nombre Wi-Fi</label>
                <input
                  type="text"
                  value={config.wifiName}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, wifiName: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground">Alcance Wi-Fi</label>
                <select
                  value={config.reachMode}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      reachMode: e.target.value as RouterReachMode,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-foreground"
                >
                  <option value="balanced">Equilibrado (casa/oficina)</option>
                  <option value="max_range">Máxima cobertura (varios pisos)</option>
                  <option value="low_interference">Baja interferencia (alta velocidad)</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-muted-foreground">Prioridad de tráfico</label>
                <select
                  value={config.priorityMode}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      priorityMode: e.target.value as RouterPriorityMode,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-foreground"
                >
                  <option value="balanced">Uso mixto equilibrado</option>
                  <option value="calls_and_work">Videollamadas y teletrabajo</option>
                  <option value="streaming_4k">Streaming 4K sin cortes</option>
                  <option value="gaming_low_ping">Juegos / baja latencia</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground">Seguridad y DNS</label>
                <select
                  value={config.dnsProtection}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      dnsProtection: e.target.value as RouterDnsProtection,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-foreground"
                >
                  <option value="fast_private">DNS Privado Rápido</option>
                  <option value="family_safe">Protección Familiar y Anti-Phishing</option>
                  <option value="isp_default">Operador por defecto</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-muted-foreground">Nivel de seguridad</label>
                <select
                  value={config.securityLevel}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      securityLevel: e.target.value as RouterSecurityLevel,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-foreground"
                >
                  <option value="standard">Estándar (WPA2/WPA3)</option>
                  <option value="strict_family">Estricto familiar</option>
                  <option value="maximum">Máxima seguridad (WPA3 + aislamiento)</option>
                </select>
              </div>
              <div className="flex flex-col justify-end gap-2 pb-1">
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={config.guestWifiEnabled}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, guestWifiEnabled: e.target.checked }))
                    }
                    className="h-4 w-4 accent-primary"
                  />
                  <span>Activar Wi-Fi para invitados</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={config.autoOptimizeChannel}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, autoOptimizeChannel: e.target.checked }))
                    }
                    className="h-4 w-4 accent-primary"
                  />
                  <span>Auto-optimizar canal Wi-Fi</span>
                </label>
              </div>
            </div>

            {/* Natural Language Adjuster */}
            <div className="border-t border-border/60 pt-3">
              <label className="mono-label block">ajuste con lenguaje natural</label>
              <div className="mt-1.5 flex gap-2">
                <input
                  type="text"
                  value={nlInstruction}
                  onChange={(e) => setNlInstruction(e.target.value)}
                  placeholder="Ej. Prioriza mis videollamadas y activa red de invitados..."
                  className="flex-1 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={handleSimplify}
                  disabled={isSimplifying || !nlInstruction.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-secondary px-3 py-2 text-xs font-medium text-foreground hover:bg-primary hover:text-primary-foreground disabled:opacity-40 whitespace-nowrap"
                >
                  {isSimplifying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  )}
                  <span>Aplicar con IA</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {statusMessage ? (
          <div className="mt-4 flex items-center gap-2 text-xs text-primary">
            <Check className="h-3.5 w-3.5" />
            <span>{statusMessage}</span>
          </div>
        ) : null}

        {/* Detailed 5-Area Diagnostic Report */}
        {report ? (
          <div className="panel mt-6 space-y-5 p-5 animate-rise">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mono-label">informe completo de red</div>
                <h2 className="mt-1 font-heading text-lg font-semibold text-foreground">
                  {report.overallTitle}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{report.summary}</p>
              </div>
              <span
                className={`font-mono text-xs uppercase ${
                  report.overallHealth === 'optimal'
                    ? 'text-emerald-400'
                    : report.overallHealth === 'attention'
                      ? 'text-amber-400'
                      : 'text-red-400'
                }`}
              >
                {report.overallHealth} · {report.latencyMs}ms
              </span>
            </div>

            <div className="text-xs text-muted-foreground border-t border-border/60 pt-3">
              <Wifi className="mr-1.5 inline h-3.5 w-3.5 text-primary" />
              {report.connectionObserved.note}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {report.areas.map((area, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-border/70 bg-background/40 p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      {area.area}
                    </span>
                    <span
                      className={`font-mono text-[10px] uppercase ${
                        area.status === 'optimal'
                          ? 'text-emerald-400'
                          : area.status === 'attention'
                            ? 'text-amber-400'
                            : 'text-red-400'
                      }`}
                    >
                      {area.status}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-foreground">{area.headline}</div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {area.plainExplanation}
                  </p>
                  <div className="text-[11px] font-mono text-muted-foreground/80">
                    {area.technicalDetail}
                  </div>
                  <div className="pt-1 text-xs text-primary">{area.recommendation}</div>
                </div>
              ))}
            </div>

            {report.quickFixes.length > 0 ? (
              <div className="border-t border-border/60 pt-4">
                <div className="mono-label mb-2.5">mejoras rápidas sugeridas</div>
                <div className="flex flex-wrap gap-2.5">
                  {report.quickFixes.map((fix, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setConfig((prev) => ({
                          ...prev,
                          ...(fix.reachMode ? { reachMode: fix.reachMode } : {}),
                          ...(fix.securityLevel
                            ? { securityLevel: fix.securityLevel }
                            : {}),
                          ...(fix.priorityMode ? { priorityMode: fix.priorityMode } : {}),
                          ...(fix.dnsProtection
                            ? { dnsProtection: fix.dnsProtection }
                            : {}),
                          ...(typeof fix.guestWifiEnabled === 'boolean'
                            ? { guestWifiEnabled: fix.guestWifiEnabled }
                            : {}),
                          ...(typeof fix.autoOptimizeChannel === 'boolean'
                            ? { autoOptimizeChannel: fix.autoOptimizeChannel }
                            : {}),
                        }));
                        setStatusMessage(`Aplicado ajuste rápido: ${fix.label}`);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-left text-xs text-foreground hover:bg-primary/20"
                    >
                      <Shield className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div>
                        <div className="font-medium">{fix.label}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {fix.effectDescription}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};
