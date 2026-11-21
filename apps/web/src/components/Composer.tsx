import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Code2,
  FileText,
  Folder,
  Paperclip,
  Send,
  Square,
  Wrench,
  X,
} from 'lucide-react';
import type {
  ContextFileSummary,
  PendingAttachment,
  ProjectSummary,
  SkillSummary,
} from '../types';

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  attachments: PendingAttachment[];
  onAddFiles: (files: FileList) => void;
  onRemoveAttachment: (id: string) => void;
  onSend: () => void;
  onStop?: () => void;
  sending: boolean;
  skills: SkillSummary[];
  contextFiles: ContextFileSummary[];
  projects: ProjectSummary[];
  activeTools: string[];
  onInsertSnippet: (snippet: string) => void;
}

export const Composer: React.FC<ComposerProps> = ({
  value,
  onChange,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  onSend,
  onStop,
  sending,
  skills,
  contextFiles,
  projects,
  activeTools,
  onInsertSnippet,
}) => {
  const [popover, setPopover] = useState<'resources' | 'skills' | 'tools' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setPopover(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sending && (value.trim() || attachments.length > 0)) {
        onSend();
      }
    }
  };

  const canSend = !sending && (value.trim().length > 0 || attachments.length > 0);

  return (
    <div className="composer-box" ref={containerRef}>
      {attachments.length > 0 && (
        <div className="composer-attachments">
          {attachments.map((att) => (
            <span key={att.id} className="attachment-chip">
              {att.previewUrl ? (
                <img src={att.previewUrl} alt={att.name} className="attachment-thumb" />
              ) : (
                <FileText size={13} color="#FF8733" />
              )}
              <span>{att.name}</span>
              <button
                onClick={() => onRemoveAttachment(att.id)}
                title="Quitar archivo"
                style={{ display: 'inline-flex', color: '#999999' }}
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        className="composer-textarea"
        placeholder="Escribe tu mensaje o pide algo al agente..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        disabled={sending}
      />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.md,.txt,.csv,.json,.ts,.tsx,.js,.sql,.tex"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onAddFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />

      <div className="composer-toolbar">
        <div className="composer-tools-left">
          {/* Adjuntar archivo */}
          <button
            type="button"
            className="composer-icon-btn"
            title="Adjuntar imagen, PDF o documento"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip size={16} />
          </button>

          {/* Acceso a recursos reales (contexto/ y proyectos/) */}
          <div className="pill-select-wrap">
            <button
              type="button"
              className="composer-icon-btn"
              title="Insertar recurso de contexto/ o proyectos/"
              onClick={() => setPopover((p) => (p === 'resources' ? null : 'resources'))}
            >
              <Folder size={16} />
            </button>
            {popover === 'resources' && (
              <div className="dropdown-menu open-up">
                <div className="dropdown-header">Contexto ({contextFiles.length})</div>
                {contextFiles.map((f) => (
                  <button
                    key={f.name}
                    className="dropdown-item"
                    onClick={() => {
                      onInsertSnippet(`Consulta contexto/${f.name} y `);
                      setPopover(null);
                    }}
                  >
                    <span>contexto/{f.name}</span>
                  </button>
                ))}
                <div className="dropdown-header">Proyectos ({projects.length})</div>
                {projects.map((p) => (
                  <button
                    key={p.slug}
                    className="dropdown-item"
                    onClick={() => {
                      onInsertSnippet(`Revisa el proyecto "${p.slug}" y `);
                      setPopover(null);
                    }}
                  >
                    <span>{p.title}</span>
                    <span className="dropdown-sub">{p.status}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Skills especializadas */}
          <div className="pill-select-wrap">
            <button
              type="button"
              className="composer-icon-btn"
              title="Usar una Skill especializada"
              onClick={() => setPopover((p) => (p === 'skills' ? null : 'skills'))}
            >
              <Code2 size={16} />
            </button>
            {popover === 'skills' && (
              <div className="dropdown-menu open-up">
                <div className="dropdown-header">Skills disponibles ({skills.length})</div>
                {skills.map((s) => (
                  <button
                    key={s.name}
                    className="dropdown-item"
                    onClick={() => {
                      onInsertSnippet(`Usa la skill ${s.name}: `);
                      setPopover(null);
                    }}
                  >
                    <div>
                      <div>{s.name}</div>
                      <span className="dropdown-sub">{s.module} · {s.description.slice(0, 52)}…</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="composer-tools-right">
          {/* Herramientas disponibles */}
          <div className="pill-select-wrap">
            <button
              type="button"
              className="tools-pill-btn"
              onClick={() => setPopover((p) => (p === 'tools' ? null : 'tools'))}
            >
              <Wrench size={13} />
              <span>Herramientas ({activeTools.length})</span>
              <ChevronDown size={13} />
            </button>
            {popover === 'tools' && (
              <div className="dropdown-menu align-right open-up">
                <div className="dropdown-header">Herramientas activas del agente</div>
                {activeTools.length === 0 ? (
                  <div className="dropdown-item">Cargando herramientas…</div>
                ) : (
                  activeTools.map((t) => (
                    <div key={t} className="dropdown-item" style={{ cursor: 'default' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{t}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Botón enviar / detener */}
          {sending ? (
            <button type="button" className="send-btn stop" onClick={onStop} title="Detener generación">
              <Square size={14} fill="#FFFFFF" />
            </button>
          ) : (
            <button
              type="button"
              className="send-btn"
              onClick={onSend}
              disabled={!canSend}
              title="Enviar (Enter)"
            >
              <Send size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
