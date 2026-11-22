import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api/client';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { ChatView } from './components/ChatView';
import {
  ArtifactsView,
  EvalsView,
  EventsView,
  StateView,
  TracesView,
} from './components/ObservabilityViews';
import {
  AgentsView,
  KnowledgeView,
  SettingsView,
  TemplatesView,
} from './components/WorkspaceViews';
import { TelemetryView } from './components/TelemetryView';
import type {
  AdkAgentNode,
  AdkAppInfo,
  AdkEvent,
  AdkPart,
  AdkSession,
  ContextFileSummary,
  NavView,
  PendingAttachment,
  ProjectSummary,
  SkillSummary,
  WorkspaceOverview,
} from './types';

function collectToolNames(node?: AdkAgentNode): string[] {
  if (!node) return [];
  const names = new Set<string>();
  const walk = (n: AdkAgentNode) => {
    for (const t of n.tools ?? []) {
      const label = typeof t === 'string' ? t : t.name;
      if (label) names.add(label);
    }
    for (const sub of n.subAgents ?? n.sub_agents ?? []) walk(sub);
  };
  walk(node);
  return [...names].sort();
}

async function readAttachmentFile(file: File): Promise<PendingAttachment> {
  const id = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const isImage = file.type.startsWith('image/');
  const isBinary = isImage || file.type === 'application/pdf';

  if (isBinary) {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result || '');
        const comma = res.indexOf(',');
        resolve(comma >= 0 ? res.slice(comma + 1) : res);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    return {
      id,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      base64,
      previewUrl: isImage ? `data:${file.type};base64,${base64}` : undefined,
    };
  }

  const textContent = await file.text();
  return {
    id,
    name: file.name,
    mimeType: file.type || 'text/plain',
    size: file.size,
    textContent: textContent.slice(0, 120_000),
  };
}

export const App: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<NavView>('inicio');
  const [online, setOnline] = useState(true);
  const [apps, setApps] = useState<string[]>([]);
  const [activeApp, setActiveApp] = useState<string>('agent');
  const [appInfo, setAppInfo] = useState<AdkAppInfo | null>(null);
  const [sessions, setSessions] = useState<AdkSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<AdkSession | null>(null);
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [contextFiles, setContextFiles] = useState<ContextFileSummary[]>([]);
  const [selectedProjectSlug, setSelectedProjectSlug] = useState<string | null>(null);

  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const loadWorkspaceData = useCallback(async () => {
    const [ov, sk, pr, cx] = await Promise.all([
      api.overview().catch(() => null),
      api.skills().catch(() => ({ skills: [] })),
      api.projects().catch(() => ({ projects: [] })),
      api.contextFiles().catch(() => ({ files: [] })),
    ]);
    if (ov) setOverview(ov);
    setSkills(sk.skills);
    setProjects(pr.projects);
    setContextFiles(cx.files);
  }, []);

  const refreshActiveSession = useCallback(
    async (app: string, sid: string) => {
      try {
        const s = await api.getSession(app, sid);
        setActiveSession(s);
        setSessions((prev) => {
          const rest = prev.filter((x) => x.id !== s.id);
          return [s, ...rest];
        });
      } catch {
        // Ignorar si fue eliminada
      }
    },
    [],
  );

  const handleNewSession = useCallback(
    async (targetApp?: string) => {
      const app = targetApp ?? activeApp;
      setBannerError(null);
      try {
        const created = await api.createSession(app);
        setActiveSessionId(created.id);
        setActiveSession(created);
        setSessions((prev) => [created, ...prev.filter((s) => s.id !== created.id)]);
        setActiveView('inicio');
      } catch (e) {
        setBannerError(e instanceof Error ? e.message : 'No se pudo crear una nueva sesión.');
      }
    },
    [activeApp],
  );

  // Carga inicial + polling de estado de conexión
  useEffect(() => {
    let mounted = true;
    (async () => {
      const ok = await api.health();
      if (!mounted) return;
      setOnline(ok);
      loadWorkspaceData();

      try {
        const appList = await api.listApps();
        if (!mounted) return;
        const resolvedApps = appList.length > 0 ? appList : ['agent'];
        setApps(resolvedApps);
        const firstApp = resolvedApps[0];
        setActiveApp(firstApp);

        const [graph, existingSessions] = await Promise.all([
          api.getAppGraph(firstApp).catch(() => null),
          api.listSessions(firstApp).catch(() => []),
        ]);
        if (!mounted) return;
        if (graph) setAppInfo(graph);

        if (existingSessions.length > 0) {
          setSessions(existingSessions);
          setActiveSessionId(existingSessions[0].id);
          const full = await api.getSession(firstApp, existingSessions[0].id).catch(() => existingSessions[0]);
          if (mounted) setActiveSession(full);
        } else {
          const created = await api.createSession(firstApp);
          if (mounted) {
            setSessions([created]);
            setActiveSessionId(created.id);
            setActiveSession(created);
          }
        }
      } catch (e) {
        if (mounted) {
          setBannerError(e instanceof Error ? e.message : 'No se pudo conectar con el servidor ADK.');
        }
      }
    })();

    const interval = setInterval(async () => {
      const ok = await api.health();
      if (mounted) setOnline(ok);
    }, 15_000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [loadWorkspaceData]);

  // Atajo de teclado Ctrl+N (y Alt+N como respaldo en navegadores que reservan Ctrl+N)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey || e.altKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewSession();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleNewSession]);

  const handleSelectSession = async (sid: string) => {
    setActiveSessionId(sid);
    setActiveView('inicio');
    setBannerError(null);
    await refreshActiveSession(activeApp, sid);
  };

  const handleDeleteSession = async (sid: string) => {
    try {
      await api.deleteSession(activeApp, sid);
      const remaining = sessions.filter((s) => s.id !== sid);
      setSessions(remaining);
      if (activeSessionId === sid) {
        if (remaining.length > 0) {
          await handleSelectSession(remaining[0].id);
        } else {
          await handleNewSession(activeApp);
        }
      }
    } catch (e) {
      setBannerError(e instanceof Error ? e.message : 'Error eliminando sesión.');
    }
  };

  const handleAddFiles = async (files: FileList) => {
    const added: PendingAttachment[] = [];
    for (const file of Array.from(files).slice(0, 6)) {
      if (file.size > 15 * 1024 * 1024) {
        setBannerError(`"${file.name}" supera el límite de 15 MB.`);
        continue;
      }
      added.push(await readAttachmentFile(file));
    }
    setAttachments((prev) => [...prev, ...added]);
  };

  const runParts = async (parts: AdkPart[], optimisticUserEvent?: AdkEvent) => {
    let sid = activeSessionId;
    if (!sid) {
      const created = await api.createSession(activeApp);
      sid = created.id;
      setActiveSessionId(sid);
      setActiveSession(created);
      setSessions((prev) => [created, ...prev]);
    }

    setBannerError(null);
    setSending(true);
    const controller = new AbortController();
    abortRef.current = controller;

    if (optimisticUserEvent) {
      setActiveSession((prev) =>
        prev
          ? { ...prev, events: [...(prev.events ?? []), optimisticUserEvent] }
          : { id: sid!, appName: activeApp, userId: api.userId, state: {}, events: [optimisticUserEvent] },
      );
    }

    try {
      await api.runSse(
        { appName: activeApp, sessionId: sid, parts, streaming: false, signal: controller.signal },
        (ev) => {
          setActiveSession((prev) =>
            prev ? { ...prev, events: [...(prev.events ?? []), ev] } : prev,
          );
        },
      );
      await refreshActiveSession(activeApp, sid);
      loadWorkspaceData();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setBannerError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  };

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    const currentAttachments = overrideText ? [] : attachments;
    if (!text && currentAttachments.length === 0) return;

    const parts: AdkPart[] = [];
    for (const att of currentAttachments) {
      if (att.base64) {
        parts.push({ inlineData: { mimeType: att.mimeType, data: att.base64 } });
      } else if (att.textContent) {
        parts.push({ text: `[Archivo adjunto: ${att.name}]\n${att.textContent}` });
      }
    }
    if (text) parts.push({ text });

    if (!overrideText) {
      setInput('');
      setAttachments([]);
    }

    const optimistic: AdkEvent = {
      id: `local-${Date.now()}`,
      author: 'user',
      timestamp: Date.now() / 1000,
      content: { role: 'user', parts },
    };

    await runParts(parts, optimistic);
  };

  const handleConfirmTool = async (callId: string, confirmed: boolean) => {
    await runParts([
      {
        functionResponse: {
          id: callId,
          name: 'adk_request_confirmation',
          response: { confirmed },
        },
      },
    ]);
  };

  const handleShareConversation = () => {
    const evs = activeSession?.events ?? [];
    const lines = evs
      .map((e) => {
        const txt = e.content?.parts?.filter((p) => p.text && !p.thought).map((p) => p.text).join('\n');
        if (!txt) return null;
        return `### ${e.author ?? 'agente'}\n${txt}`;
      })
      .filter(Boolean);
    navigator.clipboard?.writeText(lines.join('\n\n'));
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1600);
  };

  const activeTools = useMemo(
    () => collectToolNames(appInfo?.rootAgent ?? appInfo?.root_agent),
    [appInfo],
  );

  const sessionEvents = activeSession?.events ?? [];
  const hasConversation = sessionEvents.some(
    (e) => e.errorMessage || (e.content?.parts ?? []).some((p) => (p.text && !p.thought) || p.inlineData),
  );

  return (
    <div className="app-shell">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        activeView={activeView}
        onSelectView={setActiveView}
        onNewSession={() => handleNewSession()}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        projects={projects}
        onOpenProject={(slug) => {
          setSelectedProjectSlug(slug);
          setActiveView('conocimiento');
        }}
        online={online}
        eventCount={sessionEvents.length}
        artifactCount={overview?.counts.outputs ?? 0}
      />

      <div className="main-column">
        <TopBar
          apps={apps}
          activeApp={activeApp}
          onSelectApp={async (app) => {
            setActiveApp(app);
            const graph = await api.getAppGraph(app).catch(() => null);
            if (graph) setAppInfo(graph);
            await handleNewSession(app);
          }}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={() => handleNewSession()}
          onDeleteSession={handleDeleteSession}
          onShareConversation={handleShareConversation}
          canShare={hasConversation}
          shareCopied={shareCopied}
          online={online}
          overview={overview}
          onOpenSettings={() => setActiveView('configuracion')}
        />

        <main className="workspace-body">
          {(activeView === 'inicio' || activeView === 'playground') && (
            <ChatView
              events={sessionEvents}
              input={input}
              onInputChange={setInput}
              attachments={attachments}
              onAddFiles={handleAddFiles}
              onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
              onSend={handleSend}
              onStop={() => abortRef.current?.abort()}
              onConfirmTool={handleConfirmTool}
              sending={sending}
              skills={skills}
              contextFiles={contextFiles}
              projects={projects}
              activeTools={activeTools}
              bannerError={bannerError}
            />
          )}

          {activeView === 'agentes' && <AgentsView appInfo={appInfo} overview={overview} />}

          {activeView === 'conocimiento' && (
            <KnowledgeView
              initialProjectSlug={selectedProjectSlug}
              onAskAbout={(prompt) => {
                setActiveView('inicio');
                setInput(prompt);
              }}
            />
          )}

          {activeView === 'plantillas' && (
            <TemplatesView
              skills={skills}
              onUseSkill={(skillName) => {
                setActiveView('inicio');
                setInput(`Usa la skill ${skillName}: `);
              }}
            />
          )}

          {activeView === 'eventos' && (
            <EventsView
              session={activeSession}
              onRefresh={() => activeSessionId && refreshActiveSession(activeApp, activeSessionId)}
            />
          )}

          {activeView === 'trazas' && <TracesView appName={activeApp} sessionId={activeSessionId} />}

          {activeView === 'estado' && (
            <StateView
              session={activeSession}
              onRefresh={() => activeSessionId && refreshActiveSession(activeApp, activeSessionId)}
            />
          )}

          {activeView === 'artefactos' && <ArtifactsView appName={activeApp} sessionId={activeSessionId} />}

          {activeView === 'evaluaciones' && <EvalsView appName={activeApp} sessionId={activeSessionId} />}

          {activeView === 'telemetria' && <TelemetryView />}

          {activeView === 'configuracion' && <SettingsView overview={overview} online={online} />}
        </main>
      </div>
    </div>
  );
};
