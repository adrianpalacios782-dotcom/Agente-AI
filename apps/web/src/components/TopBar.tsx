import React, { useEffect, useRef, useState } from 'react';
import { Bot, Check, ChevronDown, Plus, Share2, Trash2 } from 'lucide-react';
import type { AdkSession, WorkspaceOverview } from '../types';

interface TopBarProps {
  apps: string[];
  activeApp: string;
  onSelectApp: (app: string) => void;
  sessions: AdkSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onShareConversation: () => void;
  canShare: boolean;
  shareCopied: boolean;
  online: boolean;
  overview: WorkspaceOverview | null;
  onOpenSettings: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  apps,
  activeApp,
  onSelectApp,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onShareConversation,
  canShare,
  shareCopied,
  online,
  overview,
  onOpenSettings,
}) => {
  const [openMenu, setOpenMenu] = useState<'agent' | 'session' | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const sessionLabel = activeSession
    ? `Sesión ${activeSession.id.slice(0, 6)}`
    : 'Sesión actual';

  return (
    <header className="topbar" ref={barRef}>
      <div className="topbar-left">
        {/* Selector de agente + versión */}
        <div className="pill-select-wrap">
          <button
            className="pill-select-btn"
            onClick={() => setOpenMenu((m) => (m === 'agent' ? null : 'agent'))}
          >
            <Bot size={15} color="#F5F5F5" />
            <span>
              {overview?.appName ?? 'ADRIAN AI'} {overview?.appVersion ?? 'v1.0'}
            </span>
            <ChevronDown size={14} color="#999999" />
          </button>

          {openMenu === 'agent' && (
            <div className="dropdown-menu">
              <div className="dropdown-header">Agentes ADK ({apps.length})</div>
              {apps.map((app) => (
                <button
                  key={app}
                  className={`dropdown-item ${app === activeApp ? 'selected' : ''}`}
                  onClick={() => {
                    onSelectApp(app);
                    setOpenMenu(null);
                  }}
                >
                  <div>
                    <div>ADRIAN AI ({app})</div>
                    <span className="dropdown-sub">
                      ADK {overview?.adkVersion ?? '2.5'} · {overview?.models.standard ?? 'Gemini'}
                    </span>
                  </div>
                  {app === activeApp && <Check size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selector de sesión */}
        <div className="pill-select-wrap">
          <button
            className="pill-select-btn"
            onClick={() => setOpenMenu((m) => (m === 'session' ? null : 'session'))}
          >
            <span className={`status-dot ${online ? '' : 'offline'}`} />
            <span>{sessionLabel}</span>
            <ChevronDown size={14} color="#999999" />
          </button>

          {openMenu === 'session' && (
            <div className="dropdown-menu">
              <div className="dropdown-header">Sesiones ({sessions.length})</div>
              <button
                className="dropdown-item"
                onClick={() => {
                  onNewSession();
                  setOpenMenu(null);
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#FF8733' }}>
                  <Plus size={14} /> Nueva sesión
                </span>
              </button>
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={`dropdown-item ${s.id === activeSessionId ? 'selected' : ''}`}
                  style={{ paddingRight: 4 }}
                >
                  <button
                    style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    onClick={() => {
                      onSelectSession(s.id);
                      setOpenMenu(null);
                    }}
                  >
                    <div>Sesión {s.id.slice(0, 8)}</div>
                    <span className="dropdown-sub">{s.events?.length ?? 0} eventos</span>
                  </button>
                  <button
                    className="icon-btn"
                    style={{ width: 24, height: 24 }}
                    title="Eliminar sesión"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(s.id);
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Derecha minimalista: Compartir (cuando hay conversación) + Perfil */}
      <div className="topbar-right">
        {canShare && (
          <button
            className="pill-select-btn"
            onClick={onShareConversation}
            title="Copiar conversación en Markdown"
          >
            {shareCopied ? <Check size={14} color="#20C997" /> : <Share2 size={14} />}
            <span>{shareCopied ? 'Copiado' : 'Compartir'}</span>
          </button>
        )}

        <span className="topbar-divider" />

        <button className="avatar-circle" onClick={onOpenSettings} title="Adrián Palacios · Configuración">
          A
          <span className={`status-dot avatar-dot ${online ? '' : 'offline'}`} />
        </button>
      </div>
    </header>
  );
};
