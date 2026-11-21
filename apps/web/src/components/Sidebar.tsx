import React from 'react';
import {
  Activity,
  BookOpen,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  FolderKanban,
  GitBranch,
  Home,
  LayoutTemplate,
  LogOut,
  PanelLeftOpen,
  Play,
  Plus,
  Settings,
  Users,
  Zap,
} from 'lucide-react';
import { AdrianLogoA } from './BrandLogos';
import type { AdkSession, NavView, ProjectSummary } from '../types';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeView: NavView;
  onSelectView: (view: NavView) => void;
  onNewSession: () => void;
  sessions: AdkSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  projects: ProjectSummary[];
  onOpenProject: (slug: string) => void;
  online: boolean;
  eventCount: number;
  artifactCount: number;
}

function getSessionLabel(session: AdkSession): string {
  const firstUser = session.events?.find((e) => e.author === 'user' || e.content?.role === 'user');
  const txt = firstUser?.content?.parts?.find((p) => p.text)?.text?.trim();
  if (txt) return txt.length > 28 ? `${txt.slice(0, 28)}…` : txt;
  return `Sesión ${session.id.slice(0, 6)}`;
}

function formatDateGroup(ts?: number): string {
  if (!ts) return 'Recientes';
  const d = new Date(ts > 1e12 ? ts : ts * 1000);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Hoy';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-BO', { day: '2-digit', month: 'short' });
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggleCollapse,
  activeView,
  onSelectView,
  onNewSession,
  sessions,
  activeSessionId,
  onSelectSession,
  projects,
  onOpenProject,
  online,
  eventCount,
  artifactCount,
}) => {
  const primaryItems: Array<{ id: NavView; label: string; icon: React.ReactNode }> = [
    { id: 'inicio', label: 'Inicio', icon: <Home size={16} /> },
    { id: 'agentes', label: 'Agentes', icon: <Users size={16} /> },
    { id: 'playground', label: 'Playground', icon: <Play size={16} /> },
    { id: 'conocimiento', label: 'Base de conocimiento', icon: <BookOpen size={16} /> },
    { id: 'plantillas', label: 'Plantillas', icon: <LayoutTemplate size={16} /> },
  ];

  const adkItems: Array<{ id: NavView; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'evaluaciones', label: 'Evaluaciones', icon: <CheckCircle2 size={16} /> },
    { id: 'eventos', label: 'Eventos', icon: <Zap size={16} />, badge: eventCount > 0 ? eventCount : undefined },
    { id: 'trazas', label: 'Trazas', icon: <GitBranch size={16} /> },
    { id: 'artefactos', label: 'Artefactos', icon: <Box size={16} />, badge: artifactCount > 0 ? artifactCount : undefined },
    { id: 'estado', label: 'Estado', icon: <Database size={16} /> },
  ];

  // Agrupar sesiones recientes por fecha
  const groupedSessions = sessions.slice(0, 6).reduce<Record<string, AdkSession[]>>((acc, s) => {
    const label = formatDateGroup(s.lastUpdateTime);
    (acc[label] ??= []).push(s);
    return acc;
  }, {});

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Parte superior: Logo + ADRIAN AI + Contraer */}
      <div className="sidebar-header">
        <div className="brand-lockup">
          <AdrianLogoA size={28} />
          {!collapsed && (
            <div className="brand-text">
              <span className="brand-name">ADRIAN AI</span>
              <span className="brand-sub">Agent Development Kit</span>
            </div>
          )}
        </div>
        <button
          className="icon-btn"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expandir menú' : 'Contraer menú'}
          aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <LogOut size={15} style={{ transform: 'rotate(180deg)' }} />}
        </button>
      </div>

      {/* Botón principal: + Nueva Sesión (Ctrl+N) */}
      <button className="new-session-btn" onClick={onNewSession} title="Nueva sesión (Ctrl+N)">
        <span className="new-session-left">
          <Plus size={17} />
          {!collapsed && <span>Nueva Sesión</span>}
        </span>
        {!collapsed && <span className="kbd-badge">Ctrl+N</span>}
      </button>

      {/* Navegación por grupos + Historial */}
      <div className="sidebar-scroll">
        <nav className="nav-group" aria-label="Principal">
          {primaryItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeView === item.id ? 'active' : ''}`}
              onClick={() => onSelectView(item.id)}
              title={collapsed ? item.label : undefined}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        <nav className="nav-group" aria-label="ADK Observabilidad">
          {!collapsed && <div className="nav-group-label">ADK</div>}
          {adkItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeView === item.id ? 'active' : ''}`}
              onClick={() => onSelectView(item.id)}
              title={collapsed ? item.label : undefined}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && item.badge !== undefined && <span className="nav-badge">{item.badge}</span>}
            </button>
          ))}
        </nav>

        <nav className="nav-group" aria-label="Sistema">
          <button
            className={`nav-item ${activeView === 'configuracion' ? 'active' : ''}`}
            onClick={() => onSelectView('configuracion')}
            title={collapsed ? 'Configuración' : undefined}
          >
            <Settings size={16} />
            {!collapsed && <span>Configuración</span>}
          </button>
        </nav>

        {/* Recientes: Conversaciones + Proyectos reales */}
        {!collapsed && (
          <div className="recents-section">
            <div className="nav-group-label">Recientes</div>

            {Object.entries(groupedSessions).map(([dateLabel, group]) => (
              <React.Fragment key={dateLabel}>
                {group.map((s) => (
                  <button
                    key={s.id}
                    className={`recent-item ${s.id === activeSessionId && activeView === 'inicio' ? 'active' : ''}`}
                    onClick={() => onSelectSession(s.id)}
                    title={`${getSessionLabel(s)} · ${dateLabel}`}
                  >
                    <span className="recent-item-left">
                      <Clock size={13} />
                      <span className="recent-item-title">{getSessionLabel(s)}</span>
                    </span>
                    <ChevronRight size={13} />
                  </button>
                ))}
              </React.Fragment>
            ))}

            {projects.slice(0, 4).map((p) => (
              <button
                key={p.slug}
                className="recent-item"
                onClick={() => onOpenProject(p.slug)}
                title={`Proyecto: ${p.title} (${p.status})`}
              >
                <span className="recent-item-left">
                  <FolderKanban size={13} />
                  <span className="recent-item-title">{p.title}</span>
                </span>
                <ChevronRight size={13} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Parte inferior: Perfil + Estado de conexión */}
      <div className="sidebar-footer">
        <button
          className="profile-card"
          onClick={() => onSelectView('configuracion')}
          title="Adrián Palacios · BIMCAT S.R.L."
        >
          <span className="profile-left">
            <span className="avatar-circle">
              AP
              <span className={`status-dot avatar-dot ${online ? '' : 'offline'}`} />
            </span>
            {!collapsed && (
              <span className="profile-meta">
                <span className="profile-name">Adrián Palacios</span>
                <span className="profile-status">
                  <Activity size={11} color={online ? '#20C997' : '#F05252'} />
                  {online ? 'En línea' : 'Desconectado'}
                </span>
              </span>
            )}
          </span>
          {!collapsed && <ChevronDown size={14} color="#999999" />}
        </button>
      </div>
    </aside>
  );
};
