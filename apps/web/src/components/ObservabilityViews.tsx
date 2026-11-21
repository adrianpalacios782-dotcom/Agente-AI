import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  FileText,
  GitBranch,
  Plus,
  RefreshCw,
  Wrench,
  Zap,
} from 'lucide-react';
import { api } from '../api/client';
import type { AdkEvent, AdkSession, AdkTraceSpan, OutputFileSummary } from '../types';

/* ==================== EVENTOS ==================== */
export const EventsView: React.FC<{ session: AdkSession | null; onRefresh: () => void }> = ({
  session,
  onRefresh,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'message' | 'tool' | 'error'>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const events = session?.events ?? [];

  const classify = (ev: AdkEvent): 'error' | 'tool' | 'message' => {
    if (ev.errorMessage) return 'error';
    const parts = ev.content?.parts ?? [];
    if (parts.some((p) => p.functionCall || p.functionResponse)) return 'tool';
    return 'message';
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((ev) => {
      const kind = classify(ev);
      if (filterType !== 'all' && kind !== filterType) return false;
      if (!q) return true;
      return JSON.stringify(ev).toLowerCase().includes(q);
    });
  }, [events, filterType, search]);

  return (
    <div className="page-view">
      <div className="page-inner">
        <div className="page-header">
          <div>
            <h1 className="page-title">Eventos</h1>
            <p className="page-subtitle">
              Registro cronológico real de mensajes, llamadas a herramientas, resultados y errores de la sesión actual.
            </p>
          </div>
          <button className="btn-secondary" onClick={onRefresh}>
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>

        <div className="filter-bar">
          <input
            className="search-input"
            placeholder="Filtrar por autor, herramienta o contenido..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {(['all', 'message', 'tool', 'error'] as const).map((t) => (
            <button
              key={t}
              className={`chip-btn ${filterType === t ? 'active' : ''}`}
              onClick={() => setFilterType(t)}
            >
              {t === 'all' ? `Todos (${events.length})` : t === 'message' ? 'Mensajes' : t === 'tool' ? 'Herramientas' : 'Errores'}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <Zap size={22} style={{ marginBottom: 8, opacity: 0.6 }} />
            <div>No hay eventos registrados que coincidan con el filtro en esta sesión.</div>
          </div>
        ) : (
          <div className="list-stack">
            {filtered.map((ev, idx) => {
              const id = ev.id ?? `ev-${idx}`;
              const kind = classify(ev);
              const isOpen = expandedId === id;
              const parts = ev.content?.parts ?? [];
              const preview =
                ev.errorMessage ??
                parts.find((p) => p.functionCall)?.functionCall?.name ??
                parts.find((p) => p.functionResponse)?.functionResponse?.name ??
                parts.find((p) => p.text)?.text?.slice(0, 120) ??
                '(evento sin texto)';

              return (
                <div key={id} className="tool-card">
                  <button
                    className="tool-card-header"
                    onClick={() => setExpandedId(isOpen ? null : id)}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span className={`status-pill ${kind === 'error' ? 'error' : kind === 'tool' ? 'accent' : 'confirmed'}`}>
                        {kind === 'error' ? 'Error' : kind === 'tool' ? 'Tool' : 'Msg'}
                      </span>
                      <span style={{ fontWeight: 600, color: '#F5F5F5' }}>{ev.author ?? 'sistema'}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 460 }}>
                        {preview}
                      </span>
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {ev.timestamp && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                          {new Date(ev.timestamp > 1e12 ? ev.timestamp : ev.timestamp * 1000).toLocaleTimeString('es-BO')}
                        </span>
                      )}
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                  </button>
                  {isOpen && <div className="tool-card-body">{JSON.stringify(ev, null, 2)}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

/* ==================== TRAZAS (OPENTELEMETRY) ==================== */
export const TracesView: React.FC<{ appName: string; sessionId: string | null }> = ({
  appName,
  sessionId,
}) => {
  const [spans, setSpans] = useState<AdkTraceSpan[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedSpan, setSelectedSpan] = useState<AdkTraceSpan | null>(null);

  const load = async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const data = await api.getSessionTraces(appName, sessionId);
      setSpans(data.sort((a, b) => a.start_time - b.start_time));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [appName, sessionId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return spans;
    return spans.filter(
      (s) => s.name.toLowerCase().includes(q) || JSON.stringify(s.attributes ?? {}).toLowerCase().includes(q),
    );
  }, [spans, search]);

  const minStart = spans.length > 0 ? Math.min(...spans.map((s) => s.start_time)) : 0;
  const maxEnd = spans.length > 0 ? Math.max(...spans.map((s) => s.end_time)) : 1;
  const totalNs = Math.max(maxEnd - minStart, 1);

  return (
    <div className="page-view">
      <div className="page-inner">
        <div className="page-header">
          <div>
            <h1 className="page-title">Trazas</h1>
            <p className="page-subtitle">
              Inspección detallada de ejecuciones, operaciones, herramientas, duraciones y jerarquías OpenTelemetry.
            </p>
          </div>
          <button className="btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} /> {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>

        <div className="filter-bar">
          <input
            className="search-input"
            placeholder="Filtrar spans por nombre o atributo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="status-pill accent">{filtered.length} spans</span>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <GitBranch size={22} style={{ marginBottom: 8, opacity: 0.6 }} />
            <div>Envía un mensaje en la sesión actual para generar trazas reales de ejecución.</div>
          </div>
        ) : (
          <div className="split-grid">
            <div className="list-stack">
              {filtered.map((span) => {
                const durMs = Math.max((span.end_time - span.start_time) / 1e6, 0.1);
                const leftPct = ((span.start_time - minStart) / totalNs) * 100;
                const widthPct = Math.max(((span.end_time - span.start_time) / totalNs) * 100, 1.5);
                const isChild = Boolean(span.parent_span_id);
                const isSelected = selectedSpan?.span_id === span.span_id;

                return (
                  <button
                    key={span.span_id}
                    className="panel-box"
                    style={{
                      padding: '10px 12px',
                      textAlign: 'left',
                      marginLeft: isChild ? 14 : 0,
                      borderColor: isSelected ? 'rgba(255, 135, 51, 0.5)' : undefined,
                    }}
                    onClick={() => setSelectedSpan(span)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#F5F5F5', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {span.name}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: '#FF8733', flexShrink: 0 }}>
                        {durMs >= 1000 ? `${(durMs / 1000).toFixed(2)} s` : `${durMs.toFixed(0)} ms`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="trace-bar-track">
                        <div className="trace-bar-fill" style={{ left: `${leftPct}%`, width: `${Math.min(widthPct, 100 - leftPct)}%` }} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="panel-box">
              {selectedSpan ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{selectedSpan.name}</strong>
                    <span className="status-pill accent">
                      {((selectedSpan.end_time - selectedSpan.start_time) / 1e6).toFixed(1)} ms
                    </span>
                  </div>
                  <pre className="mono-pre">{JSON.stringify(selectedSpan, null, 2)}</pre>
                </>
              ) : (
                <div style={{ color: '#999999', fontSize: 13 }}>
                  Selecciona un span a la izquierda para inspeccionar atributos, jerarquía e IDs de traza.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ==================== ESTADO DE SESIÓN ==================== */
export const StateView: React.FC<{ session: AdkSession | null; onRefresh: () => void }> = ({
  session,
  onRefresh,
}) => {
  const [copied, setCopied] = useState(false);
  const stateObj = session?.state ?? {};
  const entries = Object.entries(stateObj);

  return (
    <div className="page-view">
      <div className="page-inner">
        <div className="page-header">
          <div>
            <h1 className="page-title">Estado de sesión</h1>
            <p className="page-subtitle">Variables almacenadas en tiempo real para la sesión activa de ADK.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-secondary"
              onClick={() => {
                navigator.clipboard?.writeText(JSON.stringify(stateObj, null, 2));
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check size={14} color="#20C997" /> : <Copy size={14} />}
              {copied ? 'Copiado' : 'Copiar JSON'}
            </button>
            <button className="btn-secondary" onClick={onRefresh}>
              <RefreshCw size={14} /> Actualizar
            </button>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="empty-state">
            <Database size={22} style={{ marginBottom: 8, opacity: 0.6 }} />
            <div>La sesión actual no tiene variables de estado almacenadas todavía.</div>
          </div>
        ) : (
          <div className="panel-box">
            <pre className="mono-pre">{JSON.stringify(stateObj, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
};

/* ==================== ARTEFACTOS (ADK + OUTPUTS/) ==================== */
export const ArtifactsView: React.FC<{ appName: string; sessionId: string | null }> = ({
  appName,
  sessionId,
}) => {
  const [adkKeys, setAdkKeys] = useState<string[]>([]);
  const [outputs, setOutputs] = useState<OutputFileSummary[]>([]);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [selectedBody, setSelectedBody] = useState<string>('');

  const load = async () => {
    const [keys, outs] = await Promise.all([
      sessionId ? api.listArtifacts(appName, sessionId) : Promise.resolve([]),
      api.outputs().catch(() => ({ outputs: [] })),
    ]);
    setAdkKeys(keys);
    setOutputs(outs.outputs);
  };

  useEffect(() => {
    load();
  }, [appName, sessionId]);

  const openAdkArtifact = async (name: string) => {
    if (!sessionId) return;
    setSelectedTitle(`ADK · ${name}`);
    const data = await api.loadArtifact(appName, sessionId, name);
    setSelectedBody(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  };

  const openOutput = async (relPath: string) => {
    setSelectedTitle(`outputs/${relPath}`);
    const data = await api.outputDetail(relPath);
    setSelectedBody(data.content);
  };

  return (
    <div className="page-view">
      <div className="page-inner">
        <div className="page-header">
          <div>
            <h1 className="page-title">Artefactos</h1>
            <p className="page-subtitle">
              Artefactos de sesión del Agent Development Kit y entregables aprobados guardados en <code>outputs/</code>.
            </p>
          </div>
          <button className="btn-secondary" onClick={load}>
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>

        {adkKeys.length === 0 && outputs.length === 0 ? (
          <div className="empty-state">
            <Box size={22} style={{ marginBottom: 8, opacity: 0.6 }} />
            <div>Aún no hay artefactos generados en esta sesión ni entregables guardados en outputs/.</div>
          </div>
        ) : (
          <div className="split-grid">
            <div className="list-stack">
              {adkKeys.map((k) => (
                <button key={k} className="panel-box" style={{ padding: 12, textAlign: 'left' }} onClick={() => openAdkArtifact(k)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Wrench size={14} color="#FF8733" />
                    <span style={{ fontWeight: 500 }}>{k}</span>
                  </div>
                  <span className="dropdown-sub">Artefacto de sesión ADK</span>
                </button>
              ))}
              {outputs.map((o) => (
                <button key={o.relativePath} className="panel-box" style={{ padding: 12, textAlign: 'left' }} onClick={() => openOutput(o.relativePath)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={14} color="#20C997" />
                    <span style={{ fontWeight: 500 }}>{o.relativePath}</span>
                  </div>
                  <span className="dropdown-sub">{(o.size / 1024).toFixed(1)} KB · outputs/</span>
                </button>
              ))}
            </div>
            <div className="panel-box">
              {selectedTitle ? (
                <>
                  <div style={{ fontWeight: 600, marginBottom: 10 }}>{selectedTitle}</div>
                  <pre className="mono-pre">{selectedBody}</pre>
                </>
              ) : (
                <div style={{ color: '#999999', fontSize: 13 }}>
                  Selecciona un artefacto o entregable para inspeccionar su contenido.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ==================== EVALUACIONES (ADK EVAL SETS & RESULTS) ==================== */
export const EvalsView: React.FC<{ appName: string; sessionId: string | null }> = ({
  appName,
  sessionId,
}) => {
  const [evalSets, setEvalSets] = useState<string[]>([]);
  const [evalResults, setEvalResults] = useState<string[]>([]);
  const [newSetName, setNewSetName] = useState('');
  const [selectedResult, setSelectedResult] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = async () => {
    const [sets, results] = await Promise.all([api.listEvalSets(appName), api.listEvalResults(appName)]);
    setEvalSets(sets);
    setEvalResults(results);
  };

  useEffect(() => {
    load();
  }, [appName]);

  const handleCreateSet = async () => {
    const clean = newSetName.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!clean) return;
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await api.createEvalSet(appName, clean);
      setNewSetName('');
      setStatusMsg(`Eval set "${clean}" creado.`);
      await load();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSaveSessionToSet = async (setId: string) => {
    if (!sessionId) return;
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const caseId = `case_${Date.now()}`;
      await api.addSessionToEvalSet(appName, setId, sessionId, caseId);
      setStatusMsg(`Sesión actual guardada en "${setId}" como ${caseId}.`);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="page-view">
      <div className="page-inner">
        <div className="page-header">
          <div>
            <h1 className="page-title">Evaluaciones</h1>
            <p className="page-subtitle">
              Conjuntos de evaluación y resultados reales del Agent Development Kit.
            </p>
          </div>
          <button className="btn-secondary" onClick={load}>
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>

        <div className="filter-bar">
          <input
            className="search-input"
            placeholder="Nombre de nuevo eval_set (ej. marketing_qa)..."
            value={newSetName}
            onChange={(e) => setNewSetName(e.target.value)}
          />
          <button className="btn-primary" onClick={handleCreateSet} disabled={!newSetName.trim()}>
            <Plus size={14} /> Crear Eval Set
          </button>
        </div>

        {statusMsg && <div className="status-pill confirmed">{statusMsg}</div>}
        {errorMsg && (
          <div className="error-banner">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={15} /> {errorMsg}
            </span>
          </div>
        )}

        <div className="split-grid">
          <div className="list-stack">
            <div className="nav-group-label">Eval Sets ({evalSets.length})</div>
            {evalSets.length === 0 ? (
              <div className="panel-box" style={{ color: '#999999', fontSize: 13 }}>
                No hay conjuntos de evaluación creados todavía.
              </div>
            ) : (
              evalSets.map((id) => (
                <div key={id} className="panel-box" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{id}</span>
                  {sessionId && (
                    <button className="btn-secondary" style={{ height: 28, fontSize: 12 }} onClick={() => handleSaveSessionToSet(id)}>
                      Guardar sesión
                    </button>
                  )}
                </div>
              ))
            )}

            <div className="nav-group-label" style={{ marginTop: 10 }}>
              Resultados ({evalResults.length})
            </div>
            {evalResults.length === 0 ? (
              <div className="panel-box" style={{ color: '#999999', fontSize: 13 }}>
                Sin ejecuciones de evaluación aún. Puedes ejecutar con <code>npx adk eval</code>.
              </div>
            ) : (
              evalResults.map((rid) => (
                <button
                  key={rid}
                  className="panel-box"
                  style={{ padding: 12, textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
                  onClick={async () => {
                    const data = await api.getEvalResult(appName, rid);
                    setSelectedResult(JSON.stringify(data, null, 2));
                  }}
                >
                  {rid}
                </button>
              ))
            )}
          </div>

          <div className="panel-box">
            {selectedResult ? (
              <pre className="mono-pre">{selectedResult}</pre>
            ) : (
              <div style={{ color: '#999999', fontSize: 13 }}>
                Selecciona un resultado de evaluación o guarda la sesión actual en un eval_set para crear pruebas de regresión.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
