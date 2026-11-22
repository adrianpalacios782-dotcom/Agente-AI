import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Coins, RefreshCw, TrendingUp } from 'lucide-react';
import { api } from '../api/client';
import type { TelemetryStats } from '../types';

const money = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', minimumFractionDigits: 4 }).format(n ?? 0);

const num = (n: number) => new Intl.NumberFormat('es-AR').format(n ?? 0);

export const TelemetryView: React.FC = () => {
  const [stats, setStats] = useState<TelemetryStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await api.telemetry());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = stats?.byModel ?? [];
  const days = stats?.byDay ?? [];

  return (
    <div className="page-view">
      <div className="page-inner">
        <div className="page-header">
          <div>
            <h1 className="page-title">Telemetría de modelos</h1>
            <p className="page-subtitle">
              Uso real de tokens y costo estimado de Gemini, registrado desde los eventos de ADK.
            </p>
          </div>
          <button className="btn-ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Actualizar
          </button>
        </div>

        {error && <div className="empty-state" style={{ color: '#FF6B6B' }}>Error: {error}</div>}

        {stats && (
          <div className="list-stack">
            <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
              <div className="panel-box">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#999', fontSize: 12 }}>
                  <Activity size={14} color="#FF8733" /> Solicitudes
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>{num(stats.totalRequests)}</div>
              </div>
              <div className="panel-box">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#999', fontSize: 12 }}>
                  <TrendingUp size={14} color="#20C997" /> Tokens totales
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>{num(stats.totalTokens)}</div>
                <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>
                  {num(stats.totalPromptTokens)} entrada · {num(stats.totalCompletionTokens)} salida
                </div>
              </div>
              <div className="panel-box">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#999', fontSize: 12 }}>
                  <Coins size={14} color="#FFD166" /> Costo estimado
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: '#FFD166' }}>
                  {money(stats.totalCostUsd)}
                </div>
              </div>
            </div>

            <div className="panel-box">
              <strong style={{ fontSize: 14 }}>Por modelo</strong>
              {rows.length === 0 ? (
                <div className="empty-state" style={{ padding: 16 }}>Todavía no se registraron llamadas a modelos.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: '#888', textAlign: 'left' }}>
                      <th style={{ padding: '6px 4px' }}>Modelo</th>
                      <th style={{ padding: '6px 4px' }}>Solicitudes</th>
                      <th style={{ padding: '6px 4px' }}>Tokens</th>
                      <th style={{ padding: '6px 4px' }}>Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.model} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <td style={{ padding: '8px 4px', fontFamily: 'var(--font-mono)' }}>{r.model}</td>
                        <td style={{ padding: '8px 4px' }}>{num(r.requests)}</td>
                        <td style={{ padding: '8px 4px' }}>{num(r.tokens)}</td>
                        <td style={{ padding: '8px 4px', color: '#FFD166' }}>{money(r.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {days.length > 0 && (
              <div className="panel-box">
                <strong style={{ fontSize: 14 }}>Por día</strong>
                <div className="list-stack" style={{ marginTop: 10 }}>
                  {days.map((d) => (
                    <div key={d.day} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#D4D4D4' }}>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{d.day}</span>
                      <span>{num(d.requests)} solicitudes · {num(d.tokens)} tokens · {money(d.costUsd)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!stats.enabled && (
              <div className="empty-state">
                Telemetría deshabilitada: configura <code>DATABASE_URL</code> en <code>.env</code> para registrar el uso.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
