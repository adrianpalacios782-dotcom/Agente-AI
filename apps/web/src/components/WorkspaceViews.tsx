import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot,
  CheckCircle2,
  Database,
  FileText,
  FolderKanban,
  Play,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { api } from '../api/client';
import type {
  AdkAgentNode,
  AdkAppInfo,
  ContextFileSummary,
  MemoryItem,
  ProjectSummary,
  SkillSummary,
  WorkspaceOverview,
} from '../types';

/* ==================== AGENTES (INFO & ARQUITECTURA ADK) ==================== */
const AgentNodeCard: React.FC<{ node: AdkAgentNode; depth?: number }> = ({ node, depth = 0 }) => {
  const subs = node.subAgents ?? node.sub_agents ?? [];
  const tools = node.tools ?? [];

  return (
    <div style={{ marginLeft: depth * 18 }} className="list-stack">
      <div className="panel-box">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bot size={16} color="#FF8733" />
            <strong style={{ fontSize: 14 }}>{node.name}</strong>
            {node.class && <span className="status-pill deprecated">{node.class}</span>}
          </div>
          {node.model && <span className="status-pill accent">{node.model}</span>}
        </div>
        {node.description && (
          <p style={{ margin: '0 0 10px', color: '#999999', fontSize: 13 }}>{node.description}</p>
        )}
        {tools.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tools.map((t, i) => {
              const label = typeof t === 'string' ? t : (t.name ?? 'tool');
              return (
                <span key={`${label}-${i}`} className="attachment-chip" style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
                  <Wrench size={11} color="#FF8733" /> {label}
                </span>
              );
            })}
          </div>
        )}
      </div>
      {subs.map((sub) => (
        <AgentNodeCard key={sub.name} node={sub} depth={depth + 1} />
      ))}
    </div>
  );
};

export const AgentsView: React.FC<{ appInfo: AdkAppInfo | null; overview: WorkspaceOverview | null }> = ({
  appInfo,
  overview,
}) => {
  const root = appInfo?.rootAgent ?? appInfo?.root_agent;
  return (
    <div className="page-view">
      <div className="page-inner">
        <div className="page-header">
          <div>
            <h1 className="page-title">Agentes</h1>
            <p className="page-subtitle">
              Información general y jerarquía real cargada desde ADK ({overview?.entity ?? 'BIMCAT S.R.L.'}).
            </p>
          </div>
          {overview && <span className="status-pill confirmed">ADK {overview.adkVersion}</span>}
        </div>

        {root ? (
          <AgentNodeCard node={root} />
        ) : (
          <div className="empty-state">Cargando grafo real del agente desde /dev/apps/agent/build_graph…</div>
        )}
      </div>
    </div>
  );
};

/* ==================== BASE DE CONOCIMIENTO (MEMORIA + CONTEXTO + PROYECTOS) ==================== */
export const KnowledgeView: React.FC<{
  initialProjectSlug?: string | null;
  onAskAbout: (prompt: string) => void;
}> = ({ initialProjectSlug, onAskAbout }) => {
  const [tab, setTab] = useState<'memory' | 'context' | 'projects'>(initialProjectSlug ? 'projects' : 'memory');
  const [ns, setNs] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [memoryItems, setMemoryItems] = useState<MemoryItem[]>([]);
  const [backend, setBackend] = useState<string>('local');
  const [contextFiles, setContextFiles] = useState<ContextFileSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [selectedMarkdown, setSelectedMarkdown] = useState<string>('');

  const loadMemory = async () => {
    const res = await api.memory(ns, query);
    setMemoryItems(res.items);
    setBackend(res.backend);
  };

  useEffect(() => {
    if (tab === 'memory') loadMemory();
  }, [tab, ns]);

  useEffect(() => {
    api.contextFiles().then((r) => setContextFiles(r.files)).catch(() => {});
    api.projects().then((r) => setProjects(r.projects)).catch(() => {});
  }, []);

  useEffect(() => {
    if (initialProjectSlug) {
      setTab('projects');
      api.projectDetail(initialProjectSlug).then((r) => {
        setSelectedTitle(`proyectos/${r.slug}.md`);
        setSelectedMarkdown(r.content);
      }).catch(() => {});
    }
  }, [initialProjectSlug]);

  const namespaces = [
    { id: 'all', label: 'Todos' },
    { id: 'company', label: 'Empresa' },
    { id: 'work', label: 'Laboral' },
    { id: 'technical', label: 'Técnica' },
    { id: 'projects', label: 'Proyectos' },
    { id: 'creative', label: 'Creativa' },
    { id: 'preferences', label: 'Preferencias' },
  ];

  return (
    <div className="page-view">
      <div className="page-inner">
        <div className="page-header">
          <div>
            <h1 className="page-title">Base de conocimiento</h1>
            <p className="page-subtitle">
              Memoria persistente ({backend === 'postgres' ? 'PostgreSQL + pgvector en Docker' : backend}), archivos de <code>contexto/</code> y <code>proyectos/</code>.
            </p>
          </div>
          <div className="filter-bar">
            <button className={`chip-btn ${tab === 'memory' ? 'active' : ''}`} onClick={() => setTab('memory')}>
              Memoria (6 dominios)
            </button>
            <button className={`chip-btn ${tab === 'context' ? 'active' : ''}`} onClick={() => setTab('context')}>
              Contexto ({contextFiles.length})
            </button>
            <button className={`chip-btn ${tab === 'projects' ? 'active' : ''}`} onClick={() => setTab('projects')}>
              Proyectos ({projects.length})
            </button>
          </div>
        </div>

        {tab === 'memory' && (
          <>
            <div className="filter-bar">
              <input
                className="search-input"
                placeholder="Buscar en memoria..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadMemory()}
              />
              <button className="btn-secondary" onClick={loadMemory}>
                <RefreshCw size={13} /> Buscar
              </button>
              {namespaces.map((n) => (
                <button
                  key={n.id}
                  className={`chip-btn ${ns === n.id ? 'active' : ''}`}
                  onClick={() => setNs(n.id)}
                >
                  {n.label}
                </button>
              ))}
            </div>

            <div className="list-stack">
              {memoryItems.length === 0 ? (
                <div className="empty-state">Sin recuerdos para este filtro.</div>
              ) : (
                memoryItems.map((m) => (
                  <div key={m.id} className="panel-box" style={{ padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <strong style={{ fontSize: 14 }}>{m.title}</strong>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span className="status-pill deprecated">{m.namespace}</span>
                        <span className={`status-pill ${m.state}`}>{m.state}</span>
                      </div>
                    </div>
                    <p style={{ margin: '0 0 6px', fontSize: 13.5, color: '#D4D4D4' }}>{m.content}</p>
                    <div style={{ fontSize: 11.5, color: '#6E6E6E' }}>
                      Entidad: <code>{m.entityKey}</code> · Fuente: {m.source}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {(tab === 'context' || tab === 'projects') && (
          <div className="split-grid">
            <div className="list-stack">
              {tab === 'context'
                ? contextFiles.map((f) => (
                    <button
                      key={f.name}
                      className="panel-box"
                      style={{ padding: 12, textAlign: 'left' }}
                      onClick={async () => {
                        const r = await api.contextDetail(f.name);
                        setSelectedTitle(`contexto/${r.fileName}`);
                        setSelectedMarkdown(r.content);
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileText size={14} color="#FF8733" />
                        <strong>{f.name}</strong>
                      </div>
                      <span className="dropdown-sub">{(f.size / 1024).toFixed(1)} KB</span>
                    </button>
                  ))
                : projects.map((p) => (
                    <button
                      key={p.slug}
                      className="panel-box"
                      style={{ padding: 12, textAlign: 'left' }}
                      onClick={async () => {
                        const r = await api.projectDetail(p.slug);
                        setSelectedTitle(`proyectos/${r.slug}.md`);
                        setSelectedMarkdown(r.content);
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <FolderKanban size={14} color="#FF8733" />
                          <strong>{p.title}</strong>
                        </span>
                        <span className="status-pill accent">{p.status}</span>
                      </div>
                    </button>
                  ))}
            </div>

            <div className="panel-box">
              {selectedTitle ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <code style={{ color: '#FF8733' }}>{selectedTitle}</code>
                    <button
                      className="btn-secondary"
                      style={{ height: 30, fontSize: 12 }}
                      onClick={() => onAskAbout(`Analiza ${selectedTitle} y dime qué acciones prioritarias recomiendas.`)}
                    >
                      <Play size={12} /> Trabajar en chat
                    </button>
                  </div>
                  <div className="msg-bubble-agent">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedMarkdown}</ReactMarkdown>
                  </div>
                </>
              ) : (
                <div style={{ color: '#999999', fontSize: 13 }}>
                  Selecciona un documento a la izquierda para leerlo.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ==================== PLANTILLAS (15 SKILLS REALES) ==================== */
export const TemplatesView: React.FC<{
  skills: SkillSummary[];
  onUseSkill: (skillName: string) => void;
}> = ({ skills, onUseSkill }) => {
  const [mod, setMod] = useState<'all' | 'marketing' | 'software' | 'shared'>('all');
  const [selected, setSelected] = useState<(SkillSummary & { body?: string }) | null>(null);

  const filtered = useMemo(
    () => skills.filter((s) => (mod === 'all' ? true : s.module === mod)),
    [skills, mod],
  );

  const openSkill = async (s: SkillSummary) => {
    const detail = await api.skillDetail(s.name);
    setSelected(detail);
  };

  return (
    <div className="page-view">
      <div className="page-inner">
        <div className="page-header">
          <div>
            <h1 className="page-title">Plantillas y Skills</h1>
            <p className="page-subtitle">
              {skills.length} Skills especializadas cargadas desde <code>skills/*/SKILL.md</code>.
            </p>
          </div>
          <div className="filter-bar">
            {(['all', 'marketing', 'software', 'shared'] as const).map((m) => (
              <button key={m} className={`chip-btn ${mod === m ? 'active' : ''}`} onClick={() => setMod(m)}>
                {m === 'all' ? 'Todas' : m === 'marketing' ? 'Marketing' : m === 'software' ? 'Software' : 'Compartidas'}
              </button>
            ))}
          </div>
        </div>

        <div className="split-grid">
          <div className="list-stack">
            {filtered.map((s) => (
              <button
                key={s.name}
                className="panel-box"
                style={{
                  padding: 12,
                  textAlign: 'left',
                  borderColor: selected?.name === s.name ? 'rgba(255, 135, 51, 0.5)' : undefined,
                }}
                onClick={() => openSkill(s)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{s.name}</strong>
                  <span className="status-pill accent">{s.module}</span>
                </div>
                <span className="dropdown-sub">{s.description}</span>
              </button>
            ))}
          </div>

          <div className="panel-box">
            {selected ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>{selected.name}</strong>
                    <span className="dropdown-sub">Tier sugerido: {selected.modelTier}</span>
                  </div>
                  <button className="btn-primary" onClick={() => onUseSkill(selected.name)}>
                    <Play size={13} /> Usar en chat
                  </button>
                </div>
                <div className="msg-bubble-agent">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.body ?? ''}</ReactMarkdown>
                </div>
              </>
            ) : (
              <div style={{ color: '#999999', fontSize: 13 }}>
                Selecciona una Skill para leer sus objetivos, metodología y criterios de calidad.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ==================== CONFIGURACIÓN ==================== */
export const SettingsView: React.FC<{ overview: WorkspaceOverview | null; online: boolean }> = ({
  overview,
  online,
}) => (
  <div className="page-view">
    <div className="page-inner">
      <div className="page-header">
        <div>
          <h1 className="page-title">Configuración</h1>
          <p className="page-subtitle">Estado real del entorno, modelos Gemini, persistencia y medidas de seguridad activas.</p>
        </div>
        <span className={`status-pill ${online ? 'confirmed' : 'error'}`}>
          {online ? 'Servidor conectado' : 'Sin conexión'}
        </span>
      </div>

      {overview && (
        <div className="list-stack">
          <div className="panel-box">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Bot size={16} color="#FF8733" />
              <strong>Modelos Gemini activos (.env)</strong>
            </div>
            <div className="list-stack" style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
              <div>Rápido (fast): <span style={{ color: '#FF8733' }}>{overview.models.fast}</span></div>
              <div>Estándar (coordinador + marketing): <span style={{ color: '#FF8733' }}>{overview.models.standard}</span></div>
              <div>Pro (ingeniería de software): <span style={{ color: '#FF8733' }}>{overview.models.pro}</span></div>
              <div>API Key configurada: {overview.apiKeyConfigured ? 'Sí' : 'No (revisa D:\\adrian-ai\\.env)'}</div>
            </div>
          </div>

          <div className="panel-box">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Database size={16} color="#20C997" />
              <strong>Persistencia y Base de Conocimiento</strong>
            </div>
            <div style={{ fontSize: 13, color: '#D4D4D4' }}>
              Memoria: <strong style={{ color: '#20C997' }}>{overview.memoryBackend}</strong> ·
              Sesiones de chat: <strong style={{ color: '#20C997' }}>{overview.sessionsBackend ?? 'memory'}</strong> ·
              GitHub (Módulo B): <strong>{overview.integrations?.githubEnabled ? 'Conectado' : 'Sin token'}</strong> ·
              n8n (Fase 4): <strong>{overview.integrations?.n8nEnabled ? 'Token activo' : 'Pendiente'}</strong>
              <br />
              Recuerdos confirmados: <strong>{overview.counts.memoryConfirmed}</strong> ·
              Hipótesis: <strong>{overview.counts.memoryHypothesis}</strong> ·
              Skills: <strong>{overview.counts.skills}</strong> ·
              Proyectos: <strong>{overview.counts.projects}</strong>
            </div>
          </div>

          <div className="panel-box">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <ShieldCheck size={16} color="#FF8733" />
              <strong>Ciberseguridad y Carpetas Autorizadas (Solo Lectura)</strong>
            </div>
            <ul style={{ margin: '0 0 12px', paddingLeft: 18, color: '#D4D4D4', fontSize: 13 }}>
              <li><CheckCircle2 size={12} color="#20C997" /> PostgreSQL restringido a <code>127.0.0.1:5432</code></li>
              <li><CheckCircle2 size={12} color="#20C997" /> HITL obligatorio para confirmar datos en memoria y guardar entregables</li>
              <li><CheckCircle2 size={12} color="#20C997" /> Bloqueo de secretos, symlinks y lectura acotada (anti-OOM)</li>
            </ul>
            <div className="nav-group-label" style={{ paddingLeft: 0 }}>Rutas autorizadas en lectura</div>
            <pre className="mono-pre">{overview.authorizedReadDirs.join('\n')}</pre>
          </div>
        </div>
      )}
    </div>
  </div>
);
