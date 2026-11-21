import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertCircle,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  FileText,
  Rocket,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { AdrianCenterEmblem, AdrianLogoA, AdrianPulseIcon } from './BrandLogos';
import { Composer } from './Composer';
import type {
  AdkEvent,
  AdkFunctionCall,
  AdkFunctionResponse,
  ContextFileSummary,
  PendingAttachment,
  ProjectSummary,
  SkillSummary,
} from '../types';

interface ChatViewProps {
  events: AdkEvent[];
  input: string;
  onInputChange: (v: string) => void;
  attachments: PendingAttachment[];
  onAddFiles: (files: FileList) => void;
  onRemoveAttachment: (id: string) => void;
  onSend: (overrideText?: string) => void;
  onStop: () => void;
  onConfirmTool: (callId: string, confirmed: boolean) => void;
  sending: boolean;
  skills: SkillSummary[];
  contextFiles: ContextFileSummary[];
  projects: ProjectSummary[];
  activeTools: string[];
  bannerError: string | null;
}

const ToolAccordion: React.FC<{
  call?: AdkFunctionCall;
  response?: AdkFunctionResponse;
}> = ({ call, response }) => {
  const [open, setOpen] = useState(false);
  const name = call?.name ?? response?.name ?? 'herramienta';
  const isResult = Boolean(response && !call);

  return (
    <div className="tool-card">
      <button className="tool-card-header" onClick={() => setOpen((o) => !o)}>
        <span className="tool-card-title">
          <Wrench size={12} color="#FF8733" />
          <span>{isResult ? `Resultado · ${name}` : `Herramienta · ${name}`}</span>
        </span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div className="tool-card-body">
          {call && (
            <>
              <div style={{ color: '#FF8733', marginBottom: 4 }}>Argumentos:</div>
              {JSON.stringify(call.args ?? {}, null, 2)}
            </>
          )}
          {response && (
            <>
              <div style={{ color: '#20C997', marginTop: call ? 8 : 0, marginBottom: 4 }}>Resultado:</div>
              {JSON.stringify(response.response ?? {}, null, 2)}
            </>
          )}
        </div>
      )}
    </div>
  );
};

const MarkdownBlock: React.FC<{ text: string }> = ({ text }) => {
  const [copiedIdx, setCopiedIdx] = useState<string | null>(null);
  return (
    <div className="msg-bubble-agent">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            const codeChild = React.Children.toArray(children)[0] as React.ReactElement<{ children?: string }> | undefined;
            const rawCode = typeof codeChild?.props?.children === 'string' ? codeChild.props.children : '';
            const key = rawCode.slice(0, 24);
            return (
              <div style={{ position: 'relative' }}>
                <pre>{children}</pre>
                {rawCode && (
                  <button
                    className="icon-btn"
                    style={{ position: 'absolute', top: 8, right: 8, background: '#171717', borderColor: '#262626' }}
                    title="Copiar código"
                    onClick={() => {
                      navigator.clipboard?.writeText(rawCode);
                      setCopiedIdx(key);
                      setTimeout(() => setCopiedIdx(null), 1500);
                    }}
                  >
                    {copiedIdx === key ? <Check size={13} color="#20C997" /> : <Copy size={13} />}
                  </button>
                )}
              </div>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
};

export const ChatView: React.FC<ChatViewProps> = ({
  events,
  input,
  onInputChange,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  onSend,
  onStop,
  onConfirmTool,
  sending,
  skills,
  contextFiles,
  projects,
  activeTools,
  bannerError,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [resolvedConfirmations, setResolvedConfirmations] = useState<Record<string, boolean>>({});

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length, sending]);

  // Determinar si hay mensajes reales en la sesión
  const visibleEvents = events.filter((ev) => {
    if (ev.errorMessage) return true;
    const parts = ev.content?.parts ?? [];
    return parts.some((p) => (p.text && !p.thought) || p.inlineData || p.functionCall || p.functionResponse);
  });

  // Mapear respuestas de confirmación ya enviadas en la sesión
  const answeredConfirmIds = new Set<string>(Object.keys(resolvedConfirmations));
  for (const ev of events) {
    for (const part of ev.content?.parts ?? []) {
      if (part.functionResponse?.name === 'adk_request_confirmation' && part.functionResponse.id) {
        answeredConfirmIds.add(part.functionResponse.id);
      }
    }
  }

  const quickActions = [
    {
      icon: <FileText size={18} />,
      title: 'Resumen de proyecto',
      desc: 'Obtén un resumen rápido de tus proyectos',
      prompt: 'Dame un resumen ejecutivo del estado actual de todos mis proyectos registrados en proyectos/ y sus próximos pasos.',
    },
    {
      icon: <BarChart3 size={18} />,
      title: 'Analizar datos',
      desc: 'Procesa y analiza información',
      prompt: 'Revisa qué información confirmada tenemos en memoria y contexto/ sobre BIMCAT S.R.L. y qué datos faltan para campañas.',
    },
    {
      icon: <Code2 size={18} />,
      title: 'Generar código',
      desc: 'Crea o mejora tu código',
      prompt: 'Activa el Módulo B (software-architect) y dime qué repositorios o carpetas autorizadas puedes analizar hoy.',
    },
    {
      icon: <Rocket size={18} />,
      title: 'Explorar capacidades',
      desc: 'Descubre todo lo que puede hacer tu agente',
      prompt: 'Explícame brevemente tus módulos, tus 15 Skills y cómo puedo aprovechar el protocolo de 11 entregables de marketing.',
    },
  ];

  // PANTALLA DE BIENVENIDA (Estilo Cognivo exacto cuando la sesión está vacía)
  if (visibleEvents.length === 0) {
    return (
      <div className="welcome-screen">
        <div className="welcome-inner">
          <AdrianCenterEmblem size={46} />

          <div className="welcome-pill">
            <Rocket size={14} color="#FF8733" />
            <span>Mejora tu productividad con IA</span>
            <span className="welcome-pill-arrow">
              <ArrowUp size={12} />
            </span>
          </div>

          <h1 className="welcome-title">
            Comencemos una <span className="accent">conversación</span>
          </h1>
          <p className="welcome-subtitle">Tu agente está listo para ayudarte</p>

          {bannerError && (
            <div className="error-banner" style={{ width: '100%', marginBottom: 14 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={16} /> {bannerError}
              </span>
            </div>
          )}

          <Composer
            value={input}
            onChange={onInputChange}
            attachments={attachments}
            onAddFiles={onAddFiles}
            onRemoveAttachment={onRemoveAttachment}
            onSend={() => onSend()}
            onStop={onStop}
            sending={sending}
            skills={skills}
            contextFiles={contextFiles}
            projects={projects}
            activeTools={activeTools}
            onInsertSnippet={(s) => onInputChange(`${input}${s}`)}
          />

          <div className="quick-cards-grid">
            {quickActions.map((card) => (
              <button
                key={card.title}
                className="quick-card"
                disabled={sending}
                onClick={() => onSend(card.prompt)}
              >
                <div className="quick-card-icon">{card.icon}</div>
                <div>
                  <h3 className="quick-card-title">{card.title}</h3>
                  <div className="quick-card-footer">
                    <p className="quick-card-desc">{card.desc}</p>
                    <ArrowRight size={14} className="quick-card-arrow" />
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="welcome-footer">
            <div className="welcome-footer-top">
              <AdrianPulseIcon size={15} />
              <span>ADRIAN AI • Agent Development Kit</span>
            </div>
            <span>Construye. Automatiza. Escala.</span>
          </div>
        </div>
      </div>
    );
  }

  // CONVERSACIÓN ACTIVA
  return (
    <div className="chat-layout">
      <div className="chat-messages">
        <div className="chat-messages-inner">
          {visibleEvents.map((ev, idx) => {
            const key = ev.id ?? `${idx}-${ev.timestamp ?? ''}`;

            if (ev.errorMessage) {
              return (
                <div key={key} className="error-banner">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <AlertCircle size={16} />
                    <span>
                      <strong>Error {ev.errorCode ?? ''}:</strong> {ev.errorMessage}
                    </span>
                  </span>
                </div>
              );
            }

            const role = ev.content?.role;
            const isUser = ev.author === 'user' || role === 'user';
            const parts = ev.content?.parts ?? [];

            // Ocultar función de respuesta interna de confirmación del usuario para mantener chat limpio
            const onlyInternalConfirm =
              isUser &&
              parts.length > 0 &&
              parts.every((p) => p.functionResponse?.name === 'adk_request_confirmation');
            if (onlyInternalConfirm) return null;

            const textParts = parts.filter((p) => p.text && !p.thought).map((p) => p.text!).join('\n');
            const imageParts = parts.filter((p) => p.inlineData);
            const fnCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall!);
            const fnResps = parts.filter((p) => p.functionResponse).map((p) => p.functionResponse!);

            if (isUser) {
              if (!textParts && imageParts.length === 0) return null;
              return (
                <div key={key} className="msg-row user">
                  <div className="msg-content-col" style={{ alignItems: 'flex-end' }}>
                    {imageParts.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {imageParts.map((img, i) =>
                          img.inlineData?.mimeType.startsWith('image/') ? (
                            <img
                              key={i}
                              src={`data:${img.inlineData.mimeType};base64,${img.inlineData.data}`}
                              alt="Adjunto"
                              style={{
                                maxWidth: 220,
                                maxHeight: 160,
                                borderRadius: 10,
                                border: '1px solid #262626',
                                objectFit: 'cover',
                              }}
                            />
                          ) : (
                            <span key={i} className="attachment-chip">
                              <FileText size={13} color="#FF8733" /> {img.inlineData?.mimeType}
                            </span>
                          ),
                        )}
                      </div>
                    )}
                    {textParts && <div className="msg-bubble-user">{textParts}</div>}
                  </div>
                </div>
              );
            }

            return (
              <div key={key} className="msg-row">
                <div className="msg-avatar">
                  <AdrianLogoA size={18} />
                </div>
                <div className="msg-content-col">
                  <div className="msg-author-bar">
                    <span className="msg-author-name">{ev.author ?? 'adrian_ai'}</span>
                    {ev.timestamp && (
                      <span>
                        {new Date(ev.timestamp > 1e12 ? ev.timestamp : ev.timestamp * 1000).toLocaleTimeString(
                          'es-BO',
                          { hour: '2-digit', minute: '2-digit' },
                        )}
                      </span>
                    )}
                  </div>

                  {/* Solicitudes de confirmación HITL de ADK */}
                  {fnCalls
                    .filter((c) => c.name === 'adk_request_confirmation')
                    .map((c, ci) => {
                      const callId = c.id ?? `${key}-confirm-${ci}`;
                      const orig = (c.args?.originalFunctionCall as AdkFunctionCall | undefined) ?? undefined;
                      const alreadyAnswered = answeredConfirmIds.has(callId);
                      return (
                        <div key={callId} className="hitl-card">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                            <ShieldAlert size={16} color="#FF8733" />
                            <span>Autorización requerida: {orig?.name ?? 'acción sensible'}</span>
                          </div>
                          {orig?.args && (
                            <pre className="mono-pre" style={{ maxHeight: 140 }}>
                              {JSON.stringify(orig.args, null, 2)}
                            </pre>
                          )}
                          {alreadyAnswered ? (
                            <span className="status-pill confirmed">Respuesta registrada</span>
                          ) : (
                            <div className="hitl-actions">
                              <button
                                className="btn-primary"
                                disabled={sending}
                                onClick={() => {
                                  setResolvedConfirmations((prev) => ({ ...prev, [callId]: true }));
                                  onConfirmTool(callId, true);
                                }}
                              >
                                <Check size={14} /> Aprobar
                              </button>
                              <button
                                className="btn-secondary"
                                disabled={sending}
                                onClick={() => {
                                  setResolvedConfirmations((prev) => ({ ...prev, [callId]: false }));
                                  onConfirmTool(callId, false);
                                }}
                              >
                                Rechazar
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                  {/* Llamadas a herramientas normales (discretas y expandibles) */}
                  {fnCalls
                    .filter((c) => c.name !== 'adk_request_confirmation')
                    .map((c, ci) => (
                      <ToolAccordion key={c.id ?? `${key}-c-${ci}`} call={c} />
                    ))}

                  {fnResps
                    .filter((r) => r.name !== 'adk_request_confirmation')
                    .map((r, ri) => (
                      <ToolAccordion key={r.id ?? `${key}-r-${ri}`} response={r} />
                    ))}

                  {textParts && <MarkdownBlock text={textParts} />}
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="msg-row">
              <div className="msg-avatar">
                <AdrianLogoA size={18} />
              </div>
              <div className="msg-content-col">
                <div className="typing-dots">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}

          {bannerError && (
            <div className="error-banner">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={16} /> {bannerError}
              </span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="chat-composer-dock">
        <div className="chat-composer-dock-inner">
          <Composer
            value={input}
            onChange={onInputChange}
            attachments={attachments}
            onAddFiles={onAddFiles}
            onRemoveAttachment={onRemoveAttachment}
            onSend={() => onSend()}
            onStop={onStop}
            sending={sending}
            skills={skills}
            contextFiles={contextFiles}
            projects={projects}
            activeTools={activeTools}
            onInsertSnippet={(s) => onInputChange(`${input}${s}`)}
          />
        </div>
      </div>
    </div>
  );
};
