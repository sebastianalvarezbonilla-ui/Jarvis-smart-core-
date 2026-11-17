import React, { useMemo, useState } from 'react';
import {
  Activity,
  Check,
  ExternalLink,
  FolderUp,
  Globe,
  Laptop,
  Loader2,
  Pause,
  Play,
  Plug,
  Plus,
  Search,
  Send,
  Smartphone,
  Terminal,
  Trash2,
} from 'lucide-react';
import { SectionHeader } from './BrandMark';
import {
  DEVICE_APP_CATALOG,
  type ConnectedAppRecord,
  type ConnectedAppType,
  type DeviceAppPlatform,
  type DeviceAppPreset,
} from '../types/jarvis';

interface ConnectedAppsManagerProps {
  connectedApps: ConnectedAppRecord[];
  onSaveApp: (app: ConnectedAppRecord) => void;
  onToggleStatus: (id: string) => void;
  onDeleteApp: (id: string) => void;
}

const PLATFORM_LABELS: Record<DeviceAppPlatform, string> = {
  desktop: 'PC / Mac / Linux',
  mobile: 'Android / iOS',
  localhost: 'Servicio Local',
  web: 'Web / PWA',
};

export const ConnectedAppsManager: React.FC<ConnectedAppsManagerProps> = ({
  connectedApps,
  onSaveApp,
  onToggleStatus,
  onDeleteApp,
}) => {
  const [modeTab, setModeTab] = useState<'device' | 'api'>('device');
  const [filterKind, setFilterKind] = useState<'all' | 'device' | 'api'>('all');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [importNotice, setImportNotice] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [appType, setAppType] = useState<ConnectedAppType>('device_app');
  const [platform, setPlatform] = useState<DeviceAppPlatform>('desktop');
  const [launchUri, setLaunchUri] = useState('');
  const [packageOrExecutable, setPackageOrExecutable] = useState('');
  const [executionMode, setExecutionMode] = useState<'browser_local' | 'server_proxy'>(
    'browser_local'
  );
  const [baseUrl, setBaseUrl] = useState('');
  const [healthPath, setHealthPath] = useState('');
  const [defaultMethod, setDefaultMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE'>('GET');
  const [authHeaderName, setAuthHeaderName] = useState('');
  const [authHeaderValue, setAuthHeaderValue] = useState('');
  const [description, setDescription] = useState('');

  // Inspector / Dispatcher state
  const [selectedId, setSelectedId] = useState<string | null>(
    connectedApps[0]?.id || null
  );
  const [dispatchPath, setDispatchPath] = useState('');
  const [dispatchMethod, setDispatchMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE'>('GET');
  const [dispatchBody, setDispatchBody] = useState('');
  const [pingingId, setPingingId] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchOutput, setDispatchOutput] = useState<{
    ok: boolean;
    status: number;
    latencyMs: number;
    body: string;
  } | null>(null);

  const selectedApp = connectedApps.find((a) => a.id === selectedId) || null;

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return DEVICE_APP_CATALOG;
    return DEVICE_APP_CATALOG.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.launchUri.toLowerCase().includes(q)
    );
  }, [catalogSearch]);

  const filteredApps = useMemo(() => {
    if (filterKind === 'device') {
      return connectedApps.filter((a) =>
        ['device_app', 'pwa_web', 'local_service'].includes(a.appType)
      );
    }
    if (filterKind === 'api') {
      return connectedApps.filter((a) =>
        ['rest_api', 'webhook', 'mcp_bridge'].includes(a.appType)
      );
    }
    return connectedApps;
  }, [connectedApps, filterKind]);

  const switchFormTab = (tab: 'device' | 'api') => {
    setModeTab(tab);
    if (tab === 'device') {
      setAppType('device_app');
      setExecutionMode('browser_local');
      setHealthPath('');
    } else {
      setAppType('rest_api');
      setExecutionMode('server_proxy');
      setHealthPath('/health');
    }
  };

  const addPresetFromCatalog = (preset: DeviceAppPreset) => {
    const exists = connectedApps.some(
      (a) => a.name.toLowerCase() === preset.name.toLowerCase()
    );
    if (exists) return;
    const record: ConnectedAppRecord = {
      id: `dev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: preset.name,
      appType: preset.appType,
      platform: preset.platform,
      launchUri: preset.launchUri,
      packageOrExecutable: preset.packageOrExecutable,
      executionMode: preset.executionMode,
      baseUrl: preset.baseUrl,
      healthPath: preset.healthPath,
      defaultMethod: 'GET',
      authHeaderName: '',
      authHeaderValue: '',
      description: preset.description,
      status: 'active',
      lastCheckStatus: 'unknown',
      lastCheckLatencyMs: 0,
      lastCheckedAtMs: 0,
    };
    onSaveApp(record);
    setSelectedId(record.id);
    setImportNotice(`"${preset.name}" añadida a tus aplicaciones.`);
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedUri = launchUri.trim() || baseUrl.trim();
    if (!name.trim() || !resolvedUri) return;

    const now = Date.now();
    const record: ConnectedAppRecord = {
      id: `conn-${now}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      appType,
      platform: modeTab === 'device' ? platform : undefined,
      launchUri: resolvedUri,
      packageOrExecutable: packageOrExecutable.trim() || undefined,
      executionMode,
      baseUrl: baseUrl.trim() || resolvedUri,
      healthPath: healthPath.trim(),
      defaultMethod,
      authHeaderName: authHeaderName.trim(),
      authHeaderValue: authHeaderValue.trim(),
      description:
        description.trim() ||
        (modeTab === 'device'
          ? 'Aplicación de tu dispositivo integrada en Jarvis.'
          : 'Conector externo registrado en Jarvis.'),
      status: 'active',
      lastCheckStatus: 'unknown',
      lastCheckLatencyMs: 0,
      lastCheckedAtMs: 0,
    };
    onSaveApp(record);
    setSelectedId(record.id);
    setName('');
    setLaunchUri('');
    setPackageOrExecutable('');
    setBaseUrl('');
    setDescription('');
    setImportNotice(`"${record.name}" guardada correctamente.`);
  };

  const handleShortcutFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    let added = 0;

    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const text = await file.text().catch(() => '');

      if (ext === 'json' || ext === 'webmanifest') {
        try {
          const parsed = JSON.parse(text);
          const list = Array.isArray(parsed) ? parsed : [parsed];
          for (const item of list) {
            const appName = String(item.name || item.short_name || baseName).trim();
            const appUri = String(
              item.launchUri || item.start_url || item.url || item.baseUrl || ''
            ).trim();
            if (!appName) continue;
            onSaveApp({
              id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: appName,
              appType: appUri.startsWith('http') ? 'pwa_web' : 'device_app',
              platform: appUri.includes('localhost') ? 'localhost' : 'desktop',
              launchUri: appUri || `${appName.toLowerCase().replace(/\s+/g, '')}://`,
              packageOrExecutable: String(item.exec || item.package || file.name),
              executionMode: 'browser_local',
              baseUrl: appUri.startsWith('http') ? appUri : '',
              healthPath: '',
              defaultMethod: 'GET',
              authHeaderName: '',
              authHeaderValue: '',
              description: String(item.description || `Importada desde ${file.name}`),
              status: 'active',
              lastCheckStatus: 'unknown',
              lastCheckLatencyMs: 0,
              lastCheckedAtMs: 0,
            });
            added++;
          }
          continue;
        } catch {
          // fall through to line parser
        }
      }

      if (ext === 'desktop') {
        const nameMatch = text.match(/^Name=(.+)$/m);
        const execMatch = text.match(/^Exec=(.+)$/m);
        const urlMatch = text.match(/^URL=(.+)$/m);
        const appName = (nameMatch?.[1] || baseName).trim();
        const uri = (
          urlMatch?.[1] ||
          `${appName.toLowerCase().replace(/[^a-z0-9]+/g, '')}://`
        ).trim();
        onSaveApp({
          id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: appName,
          appType: 'device_app',
          platform: 'desktop',
          launchUri: uri,
          packageOrExecutable: execMatch?.[1]?.trim() || file.name,
          executionMode: 'browser_local',
          baseUrl: uri.startsWith('http') ? uri : '',
          healthPath: '',
          defaultMethod: 'GET',
          authHeaderName: '',
          authHeaderValue: '',
          description: `Acceso directo importado (${file.name})`,
          status: 'active',
          lastCheckStatus: 'unknown',
          lastCheckLatencyMs: 0,
          lastCheckedAtMs: 0,
        });
        added++;
        continue;
      }

      if (ext === 'url') {
        const urlMatch = text.match(/^URL=(.+)$/im);
        const uri = (urlMatch?.[1] || '').trim();
        onSaveApp({
          id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: baseName,
          appType: uri.startsWith('http') ? 'pwa_web' : 'device_app',
          platform: uri.includes('localhost') ? 'localhost' : 'web',
          launchUri: uri || `https://${baseName.toLowerCase()}.com`,
          packageOrExecutable: file.name,
          executionMode: 'browser_local',
          baseUrl: uri.startsWith('http') ? uri : '',
          healthPath: '',
          defaultMethod: 'GET',
          authHeaderName: '',
          authHeaderValue: '',
          description: `Acceso directo importado (${file.name})`,
          status: 'active',
          lastCheckStatus: 'unknown',
          lastCheckLatencyMs: 0,
          lastCheckedAtMs: 0,
        });
        added++;
        continue;
      }

      // Generic file or txt list
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (ext === 'txt' && lines.length > 0) {
        for (const line of lines) {
          const [rawN, rawU] = line.split(/[|,;]/).map((s) => s.trim());
          const appName = rawN || 'App importada';
          const uri = rawU || `${appName.toLowerCase().replace(/\s+/g, '')}://`;
          onSaveApp({
            id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: appName,
            appType: uri.startsWith('http') ? 'pwa_web' : 'device_app',
            platform: uri.includes('localhost') ? 'localhost' : 'desktop',
            launchUri: uri,
            packageOrExecutable: appName,
            executionMode: 'browser_local',
            baseUrl: uri.startsWith('http') ? uri : '',
            healthPath: '',
            defaultMethod: 'GET',
            authHeaderName: '',
            authHeaderValue: '',
            description: `Importada desde ${file.name}`,
            status: 'active',
            lastCheckStatus: 'unknown',
            lastCheckLatencyMs: 0,
            lastCheckedAtMs: 0,
          });
          added++;
        }
      } else {
        onSaveApp({
          id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: baseName,
          appType: 'device_app',
          platform: ext === 'apk' ? 'mobile' : 'desktop',
          launchUri: `${baseName.toLowerCase().replace(/[^a-z0-9]+/g, '')}://`,
          packageOrExecutable: file.name,
          executionMode: 'browser_local',
          baseUrl: '',
          healthPath: '',
          defaultMethod: 'GET',
          authHeaderName: '',
          authHeaderValue: '',
          description: `Archivo de aplicación detectado (${file.name})`,
          status: 'active',
          lastCheckStatus: 'unknown',
          lastCheckLatencyMs: 0,
          lastCheckedAtMs: 0,
        });
        added++;
      }
    }

    setImportNotice(
      added > 0
        ? `Se importaron ${added} ${added === 1 ? 'aplicación' : 'aplicaciones'} de tu dispositivo.`
        : 'No se encontraron aplicaciones válidas en los archivos.'
    );
    e.target.value = '';
  };

  const handleBatchTextImport = () => {
    const lines = batchText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    let count = 0;
    for (const line of lines) {
      const parts = line.split(/[|,]/).map((s) => s.trim());
      const appName = parts[0];
      if (!appName) continue;
      const uri =
        parts[1] ||
        (appName.includes('://')
          ? appName
          : `${appName.toLowerCase().replace(/[^a-z0-9]+/g, '')}://`);
      onSaveApp({
        id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: appName.includes('://') ? appName.replace(/^https?:\/\//, '') : appName,
        appType: uri.startsWith('http')
          ? uri.includes('localhost') || uri.includes('127.0.0.1')
            ? 'local_service'
            : 'pwa_web'
          : 'device_app',
        platform: uri.includes('localhost') || uri.includes('127.0.0.1') ? 'localhost' : 'desktop',
        launchUri: uri,
        packageOrExecutable: parts[2] || appName,
        executionMode: 'browser_local',
        baseUrl: uri.startsWith('http') ? uri : '',
        healthPath: '',
        defaultMethod: 'GET',
        authHeaderName: '',
        authHeaderValue: '',
        description: 'Añadida mediante importación por lote.',
        status: 'active',
        lastCheckStatus: 'unknown',
        lastCheckLatencyMs: 0,
        lastCheckedAtMs: 0,
      });
      count++;
    }

    setBatchText('');
    setShowBatchImport(false);
    setImportNotice(`Se agregaron ${count} aplicaciones a tu lista.`);
  };

  const handlePing = async (app: ConnectedAppRecord) => {
    setPingingId(app.id);
    const targetBase = app.baseUrl || app.launchUri || '';
    const isBrowserLocal =
      app.executionMode === 'browser_local' ||
      targetBase.includes('localhost') ||
      targetBase.includes('127.0.0.1') ||
      targetBase.includes('.local');

    if (isBrowserLocal && /^https?:\/\//i.test(targetBase)) {
      const t0 = Date.now();
      try {
        const sub = app.healthPath
          ? app.healthPath.startsWith('/')
            ? app.healthPath
            : `/${app.healthPath}`
          : '';
        const url = `${targetBase.replace(/\/$/, '')}${sub}`;
        const resp = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        onSaveApp({
          ...app,
          lastCheckStatus: resp.ok ? 'online' : 'offline',
          lastCheckLatencyMs: Date.now() - t0,
          lastCheckedAtMs: Date.now(),
        });
      } catch {
        onSaveApp({
          ...app,
          lastCheckStatus: 'offline',
          lastCheckLatencyMs: Date.now() - t0,
          lastCheckedAtMs: Date.now(),
        });
      } finally {
        setPingingId(null);
      }
      return;
    }

    if (!/^https?:\/\//i.test(targetBase)) {
      // Custom OS protocol URI (e.g. spotify://)
      onSaveApp({
        ...app,
        lastCheckStatus: 'online',
        lastCheckLatencyMs: 1,
        lastCheckedAtMs: Date.now(),
      });
      setPingingId(null);
      return;
    }

    try {
      const res = await fetch('/api/jarvis/apps/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: targetBase,
          healthPath: app.healthPath,
          authHeaderName: app.authHeaderName,
          authHeaderValue: app.authHeaderValue,
        }),
      });
      const data = await res.json();
      onSaveApp({
        ...app,
        lastCheckStatus: data.online ? 'online' : 'offline',
        lastCheckLatencyMs: data.latencyMs || 0,
        lastCheckedAtMs: Date.now(),
      });
    } catch {
      onSaveApp({
        ...app,
        lastCheckStatus: 'offline',
        lastCheckedAtMs: Date.now(),
      });
    } finally {
      setPingingId(null);
    }
  };

  const handleDispatch = async () => {
    if (!selectedApp) return;
    const targetBase = selectedApp.baseUrl || selectedApp.launchUri || '';
    if (!/^https?:\/\//i.test(targetBase)) {
      setDispatchOutput({
        ok: false,
        status: 0,
        latencyMs: 0,
        body: `Esta aplicación usa el protocolo local "${targetBase}". Usa el botón "Abrir app" para lanzarla en tu dispositivo.`,
      });
      return;
    }

    setIsDispatching(true);
    setDispatchOutput(null);

    const isBrowserLocal =
      selectedApp.executionMode === 'browser_local' ||
      targetBase.includes('localhost') ||
      targetBase.includes('127.0.0.1');

    if (isBrowserLocal) {
      const t0 = Date.now();
      try {
        const sub = dispatchPath || selectedApp.healthPath || '';
        const cleanSub = sub ? (sub.startsWith('/') ? sub : `/${sub}`) : '';
        const url = `${targetBase.replace(/\/$/, '')}${cleanSub}`;
        const headers: Record<string, string> = {};
        if (selectedApp.authHeaderName && selectedApp.authHeaderValue) {
          headers[selectedApp.authHeaderName] = selectedApp.authHeaderValue;
        }
        const init: RequestInit = { method: dispatchMethod, headers };
        if ((dispatchMethod === 'POST' || dispatchMethod === 'PUT') && dispatchBody.trim()) {
          headers['Content-Type'] = 'application/json';
          init.body = dispatchBody;
        }
        const resp = await fetch(url, init);
        const text = (await resp.text()).slice(0, 8000);
        setDispatchOutput({
          ok: resp.ok,
          status: resp.status,
          latencyMs: Date.now() - t0,
          body: text,
        });
      } catch (err) {
        setDispatchOutput({
          ok: false,
          status: 0,
          latencyMs: Date.now() - t0,
          body:
            err instanceof Error
              ? `${err.message} (verifica que el servicio local permita CORS o esté ejecutándose en tu dispositivo)`
              : 'Error conectando con el dispositivo.',
        });
      } finally {
        setIsDispatching(false);
      }
      return;
    }

    try {
      const res = await fetch('/api/jarvis/apps/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: targetBase,
          path: dispatchPath || selectedApp.healthPath,
          method: dispatchMethod,
          authHeaderName: selectedApp.authHeaderName,
          authHeaderValue: selectedApp.authHeaderValue,
          bodyText: dispatchBody,
        }),
      });
      const data = await res.json();
      setDispatchOutput({
        ok: Boolean(data.ok),
        status: data.httpStatus || 0,
        latencyMs: data.latencyMs || 0,
        body: data.bodyText || data.error || '',
      });
    } catch (err) {
      setDispatchOutput({
        ok: false,
        status: 0,
        latencyMs: 0,
        body: err instanceof Error ? err.message : 'Error de red',
      });
    } finally {
      setIsDispatching(false);
    }
  };

  const renderPlatformIcon = (p?: DeviceAppPlatform, type?: ConnectedAppType) => {
    if (p === 'mobile') return <Smartphone className="h-3.5 w-3.5 text-primary shrink-0" />;
    if (p === 'localhost' || type === 'local_service')
      return <Terminal className="h-3.5 w-3.5 text-primary shrink-0" />;
    if (p === 'web' || type === 'pwa_web')
      return <Globe className="h-3.5 w-3.5 text-primary shrink-0" />;
    if (type === 'device_app')
      return <Laptop className="h-3.5 w-3.5 text-primary shrink-0" />;
    return <Plug className="h-3.5 w-3.5 text-primary shrink-0" />;
  };

  return (
    <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6">
        <SectionHeader
          label="dispositivo, apis y puentes"
          title="Aplicaciones de tu Dispositivo y Conectadas"
          description="Agrega aplicaciones instaladas en tu teléfono o computadora, servicios locales (Ollama, LM Studio, localhost) y APIs externas para abrirlas o controlarlas desde Jarvis."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border/70 px-3 py-2 text-xs font-medium text-foreground hover:border-primary/40">
                <FolderUp className="h-3.5 w-3.5 text-primary" />
                <span>Importar accesos (.desktop / .url / .json)</span>
                <input
                  type="file"
                  multiple
                  accept=".desktop,.url,.json,.webmanifest,.txt,.apk,.exe,.app"
                  onChange={handleShortcutFiles}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={() => setShowBatchImport((v) => !v)}
                className="rounded-xl border border-border/70 px-3 py-2 text-xs font-medium text-foreground hover:border-primary/40"
              >
                Importar lista
              </button>
            </div>
          }
        />

        {importNotice ? (
          <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs text-primary">
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5" />
              {importNotice}
            </span>
            <button
              type="button"
              onClick={() => setImportNotice(null)}
              className="underline"
            >
              Cerrar
            </button>
          </div>
        ) : null}

        {showBatchImport ? (
          <div className="panel mt-4 space-y-3 p-4 animate-rise">
            <div className="mono-label">agregar múltiples apps de una vez</div>
            <p className="text-xs text-muted-foreground">
              Escribe una aplicación por línea con el formato <span className="font-mono text-foreground">Nombre | URI o URL | Paquete (opcional)</span>.
            </p>
            <textarea
              rows={4}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              placeholder={`Spotify | spotify:// | Spotify.exe\nMi Servidor Local | http://localhost:8080\nCalculadora | calculator://`}
              className="w-full rounded-xl border border-border bg-background/60 p-3 font-mono text-xs text-foreground"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBatchImport(false)}
                className="rounded-xl border border-border/70 px-3 py-1.5 text-xs text-muted-foreground"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleBatchTextImport}
                className="rounded-xl bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground"
              >
                Agregar todas
              </button>
            </div>
          </div>
        ) : null}

        {/* Quick Catalog of Device Apps */}
        <section className="panel mt-6 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mono-label">catálogo rápido del dispositivo</div>
              <h2 className="mt-1 font-heading text-sm font-semibold text-foreground">
                Añade tus apps habituales en un clic
              </h2>
            </div>
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Buscar WhatsApp, Ollama, VS Code..."
                className="w-full rounded-xl border border-border/70 bg-background/60 py-1.5 pl-8 pr-3 text-xs text-foreground"
              />
            </div>
          </div>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filteredCatalog.map((preset) => {
              const alreadyAdded = connectedApps.some(
                (a) => a.name.toLowerCase() === preset.name.toLowerCase()
              );
              return (
                <button
                  key={preset.name}
                  type="button"
                  disabled={alreadyAdded}
                  onClick={() => addPresetFromCatalog(preset)}
                  className={`flex items-start justify-between gap-2 rounded-xl border p-3 text-left transition-colors ${
                    alreadyAdded
                      ? 'border-primary/30 bg-primary/5 opacity-80 cursor-default'
                      : 'border-border/70 bg-background/40 hover:border-primary/50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {renderPlatformIcon(preset.platform, preset.appType)}
                      <span className="truncate text-xs font-semibold text-foreground">
                        {preset.name}
                      </span>
                    </div>
                    <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                      {preset.launchUri}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-primary">
                    {alreadyAdded ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Custom App / API Form */}
        <form onSubmit={handleAddCustom} className="panel mt-5 space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="mono-label">registrar aplicación personalizada</div>
            <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-background/50 p-1">
              <button
                type="button"
                onClick={() => switchFormTab('device')}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  modeTab === 'device'
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                App de mi dispositivo
              </button>
              <button
                type="button"
                onClick={() => switchFormTab('api')}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  modeTab === 'api'
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                API / Webhook / MCP
              </button>
            </div>
          </div>

          {modeTab === 'device' ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs text-muted-foreground">Nombre de la app</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej. Steam, Figma, Cámara, App Local"
                    className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground">Plataforma</label>
                  <select
                    value={platform}
                    onChange={(e) => {
                      const p = e.target.value as DeviceAppPlatform;
                      setPlatform(p);
                      setAppType(
                        p === 'localhost'
                          ? 'local_service'
                          : p === 'web'
                            ? 'pwa_web'
                            : 'device_app'
                      );
                    }}
                    className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground"
                  >
                    <option value="desktop">PC / Mac / Linux</option>
                    <option value="mobile">Teléfono Android / iOS</option>
                    <option value="localhost">Servicio Local (localhost / LAN)</option>
                    <option value="web">Web / PWA instalada</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground">
                    Protocolo o URL de apertura
                  </label>
                  <input
                    type="text"
                    required
                    value={launchUri}
                    onChange={(e) => setLaunchUri(e.target.value)}
                    placeholder="Ej. steam:// o http://localhost:3001"
                    className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 font-mono text-xs text-foreground"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs text-muted-foreground">
                    Paquete o ejecutable (opc.)
                  </label>
                  <input
                    type="text"
                    value={packageOrExecutable}
                    onChange={(e) => setPackageOrExecutable(e.target.value)}
                    placeholder="Ej. com.valvesoftware.android / app.exe"
                    className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 font-mono text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground">
                    Endpoint HTTP / Health (opc.)
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="http://localhost:8080 (si tiene API)"
                    className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 font-mono text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground">Descripción</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Para qué usas esta aplicación"
                    className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-foreground"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs text-muted-foreground">Nombre</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej. API Clima o CRM"
                    className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground">Tipo</label>
                  <select
                    value={appType}
                    onChange={(e) => setAppType(e.target.value as ConnectedAppType)}
                    className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground"
                  >
                    <option value="rest_api">API REST</option>
                    <option value="webhook">Webhook</option>
                    <option value="mcp_bridge">Puente MCP</option>
                    <option value="local_service">Servicio Local</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground">Método</label>
                  <select
                    value={defaultMethod}
                    onChange={(e) =>
                      setDefaultMethod(
                        e.target.value as 'GET' | 'POST' | 'PUT' | 'DELETE'
                      )
                    }
                    className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-muted-foreground">URL Base</label>
                  <input
                    type="text"
                    required
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.ejemplo.com"
                    className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground">Ruta Health</label>
                  <input
                    type="text"
                    value={healthPath}
                    onChange={(e) => setHealthPath(e.target.value)}
                    placeholder="/health"
                    className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs text-muted-foreground">Header Auth (opc.)</label>
                  <input
                    type="text"
                    value={authHeaderName}
                    onChange={(e) => setAuthHeaderName(e.target.value)}
                    placeholder="Authorization"
                    className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground">Valor Auth (opc.)</label>
                  <input
                    type="password"
                    value={authHeaderValue}
                    onChange={(e) => setAuthHeaderValue(e.target.value)}
                    placeholder="Bearer ..."
                    className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground">Ejecución de red</label>
                  <select
                    value={executionMode}
                    onChange={(e) =>
                      setExecutionMode(
                        e.target.value as 'browser_local' | 'server_proxy'
                      )
                    }
                    className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-foreground"
                  >
                    <option value="server_proxy">Proxy servidor (APIs públicas)</option>
                    <option value="browser_local">Directo navegador (localhost / LAN)</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>
              {modeTab === 'device' ? 'Agregar app del dispositivo' : 'Conectar API / puente'}
            </span>
          </button>
        </form>

        {/* Connected & Device Apps List + Live Dispatcher */}
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="mono-label">mis aplicaciones ({filteredApps.length})</div>
              <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-card/50 p-0.5 text-[11px]">
                {(
                  [
                    ['all', 'Todas'],
                    ['device', 'Dispositivo'],
                    ['api', 'APIs'],
                  ] as const
                ).map(([k, lbl]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFilterKind(k)}
                    className={`rounded-md px-2.5 py-1 font-medium ${
                      filterKind === k
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {filteredApps.length === 0 ? (
              <div className="panel p-6 text-sm text-muted-foreground">
                No hay aplicaciones registradas en esta categoría. Añade una arriba desde el catálogo o el formulario.
              </div>
            ) : (
              filteredApps.map((app) => {
                const openTarget = app.launchUri || app.baseUrl;
                return (
                  <div
                    key={app.id}
                    onClick={() => {
                      setSelectedId(app.id);
                      setDispatchPath(app.healthPath);
                      setDispatchMethod(app.defaultMethod);
                    }}
                    className={`panel cursor-pointer p-4 transition-colors ${
                      selectedId === app.id ? 'ring-1 ring-inset ring-primary/50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {renderPlatformIcon(app.platform, app.appType)}
                          <span className="font-heading text-sm font-semibold text-foreground truncate">
                            {app.name}
                          </span>
                        </div>
                        <div className="mono-label mt-1 truncate">
                          {app.platform ? PLATFORM_LABELS[app.platform] : app.appType} ·{' '}
                          {app.lastCheckStatus}
                          {app.lastCheckLatencyMs ? ` · ${app.lastCheckLatencyMs}ms` : ''}
                        </div>
                      </div>
                      <span
                        className={`font-mono text-[10px] uppercase ${
                          app.status === 'active' ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {app.status}
                      </span>
                    </div>

                    <p className="mt-1.5 text-xs text-muted-foreground">{app.description}</p>
                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground/80">
                      {openTarget}
                      {app.packageOrExecutable ? ` · ${app.packageOrExecutable}` : ''}
                    </p>

                    <div
                      className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-2">
                        {openTarget ? (
                          <a
                            href={openTarget}
                            target={openTarget.startsWith('http') ? '_blank' : '_self'}
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/25"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span>Abrir app</span>
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handlePing(app)}
                          disabled={pingingId === app.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1 text-xs text-foreground hover:border-primary/40"
                        >
                          {pingingId === app.id ? (
                            <Loader2 className="h-3 w-3 animate-spin text-primary" />
                          ) : (
                            <Activity className="h-3 w-3 text-primary" />
                          )}
                          <span>Comprobar</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onToggleStatus(app.id)}
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
                  </div>
                );
              })
            )}
          </div>

          {/* Live HTTP Command Dispatcher */}
          <div className="panel space-y-4 p-5">
            <div className="mono-label">controlador y lanzador</div>
            {!selectedApp ? (
              <div className="text-sm text-muted-foreground">
                Selecciona una aplicación de tu lista para abrirla, comprobar su servicio local o enviar peticiones HTTP.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-foreground">
                    Seleccionada: <span className="text-primary">{selectedApp.name}</span>
                  </div>
                  {(selectedApp.launchUri || selectedApp.baseUrl) ? (
                    <a
                      href={selectedApp.launchUri || selectedApp.baseUrl}
                      target={
                        (selectedApp.launchUri || selectedApp.baseUrl).startsWith('http')
                          ? '_blank'
                          : '_self'
                      }
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>Abrir en dispositivo</span>
                    </a>
                  ) : null}
                </div>

                <div className="flex gap-2">
                  <select
                    value={dispatchMethod}
                    onChange={(e) =>
                      setDispatchMethod(
                        e.target.value as 'GET' | 'POST' | 'PUT' | 'DELETE'
                      )
                    }
                    className="rounded-xl border border-border bg-background/60 px-2.5 py-2 font-mono text-xs text-foreground"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                  <input
                    type="text"
                    value={dispatchPath}
                    onChange={(e) => setDispatchPath(e.target.value)}
                    placeholder="/ruta-endpoint (opcional)"
                    className="flex-1 rounded-xl border border-border bg-background/60 px-3 py-2 font-mono text-xs text-foreground"
                  />
                </div>
                {(dispatchMethod === 'POST' || dispatchMethod === 'PUT') && (
                  <textarea
                    rows={4}
                    value={dispatchBody}
                    onChange={(e) => setDispatchBody(e.target.value)}
                    placeholder='{"accion": "ejecutar"}'
                    className="w-full rounded-xl border border-border bg-background/60 p-3 font-mono text-xs text-foreground"
                  />
                )}
                <button
                  type="button"
                  onClick={handleDispatch}
                  disabled={isDispatching}
                  className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-secondary px-4 py-2 text-xs font-medium text-foreground hover:border-primary/40 disabled:opacity-50"
                >
                  {isDispatching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  ) : (
                    <Send className="h-3.5 w-3.5 text-primary" />
                  )}
                  <span>Ejecutar petición HTTP</span>
                </button>

                {dispatchOutput ? (
                  <div className="space-y-2 border-t border-border/60 pt-3">
                    <div className="mono-label tabular-nums">
                      HTTP {dispatchOutput.status} · {dispatchOutput.latencyMs} ms
                    </div>
                    <pre className="scroll-slim max-h-56 overflow-auto rounded-xl border border-border/70 bg-background/70 p-3 font-mono text-xs text-foreground">
                      {dispatchOutput.body || '(respuesta vacía)'}
                    </pre>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
