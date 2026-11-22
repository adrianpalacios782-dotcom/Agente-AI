import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import {
  BaseSessionService,
  type AppendEventRequest,
  type CreateSessionRequest,
  type DeleteSessionRequest,
  type Event,
  type GetSessionRequest,
  type ListSessionsRequest,
  type ListSessionsResponse,
  type Session,
} from '@google/adk';
import type { PgQueryExecutor } from '../memory/postgresStore.js';
import { MODELS } from '../config.js';
import { TelemetryService } from '../telemetry/service.js';

interface UsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

interface SessionRow {
  id: string;
  app_name: string;
  user_id: string;
  state: Record<string, unknown>;
  last_update_time: string | number;
  first_event?: Event | null;
}

interface EventRow {
  event_id: string;
  payload: Event;
}

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS public.adk_sessions (
  id               TEXT PRIMARY KEY,
  app_name         TEXT NOT NULL,
  user_id          TEXT NOT NULL,
  state            JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_update_time DOUBLE PRECISION NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adk_sessions_app_user_idx
  ON public.adk_sessions (app_name, user_id, last_update_time DESC);

CREATE TABLE IF NOT EXISTS public.adk_session_events (
  seq         BIGSERIAL PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES public.adk_sessions(id) ON DELETE CASCADE,
  event_id    TEXT NOT NULL,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, event_id)
);
CREATE INDEX IF NOT EXISTS adk_session_events_sid_seq_idx
  ON public.adk_session_events (session_id, seq ASC);
`;

/**
 * Servicio de sesiones persistentes de ADK sobre PostgreSQL (Docker).
 * Conserva conversaciones, eventos y estado entre reinicios del servidor.
 */
export class PostgresSessionService extends BaseSessionService {
  private initialized = false;
  private telemetry?: TelemetryService;

  constructor(private readonly db: PgQueryExecutor) {
    super();
  }

  /** Inyecta el servicio de telemetría opcional para registrar uso de LLM. */
  setTelemetryService(telemetry: TelemetryService): void {
    this.telemetry = telemetry;
  }

  static fromUrl(connectionString: string): PostgresSessionService {
    const pool = new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 3_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 5_000,
    });
    return new PostgresSessionService(pool);
  }

  async ensureSchema(): Promise<void> {
    if (this.initialized) return;
    await this.db.query(INIT_SQL);
    this.initialized = true;
  }

  async close(): Promise<void> {
    if (this.db.end) await this.db.end();
  }

  async createSession(request: CreateSessionRequest): Promise<Session> {
    await this.ensureSchema();
    const id = request.sessionId?.trim() || randomUUID();
    const state = request.state ? { ...request.state } : {};
    const nowSec = Date.now() / 1000;

    await this.db.query(
      `INSERT INTO public.adk_sessions (id, app_name, user_id, state, last_update_time)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [id, request.appName, request.userId, JSON.stringify(state), nowSec],
    );

    return {
      id,
      appName: request.appName,
      userId: request.userId,
      state,
      events: [],
      lastUpdateTime: nowSec,
    };
  }

  async getSession(request: GetSessionRequest): Promise<Session | undefined> {
    await this.ensureSchema();
    const { rows } = await this.db.query<SessionRow>(
      `SELECT id, app_name, user_id, state, last_update_time
       FROM public.adk_sessions
       WHERE id = $1 AND app_name = $2 AND user_id = $3`,
      [request.sessionId, request.appName, request.userId],
    );
    const row = rows[0];
    if (!row) return undefined;

    const { rows: evRows } = await this.db.query<EventRow>(
      `SELECT event_id, payload
       FROM public.adk_session_events
       WHERE session_id = $1
       ORDER BY seq ASC`,
      [row.id],
    );

    let events = evRows.map((r) => r.payload);
    if (request.config?.afterTimestamp !== undefined) {
      const after = request.config.afterTimestamp;
      events = events.filter((e) => (e.timestamp ?? 0) >= after);
    }
    if (request.config?.numRecentEvents !== undefined && request.config.numRecentEvents > 0) {
      events = events.slice(-request.config.numRecentEvents);
    }

    return {
      id: row.id,
      appName: row.app_name,
      userId: row.user_id,
      state: row.state ?? {},
      events,
      lastUpdateTime: Number(row.last_update_time),
    };
  }

  async listSessions(request: ListSessionsRequest): Promise<ListSessionsResponse> {
    await this.ensureSchema();
    const direction = request.order === 'asc' ? 'ASC' : 'DESC';
    const { rows } = await this.db.query<SessionRow>(
      `SELECT s.id, s.app_name, s.user_id, s.state, s.last_update_time,
              (
                SELECT e.payload
                FROM public.adk_session_events e
                WHERE e.session_id = s.id
                  AND (e.payload->>'author' = 'user' OR e.payload->'content'->>'role' = 'user')
                ORDER BY e.seq ASC
                LIMIT 1
              ) AS first_event
       FROM public.adk_sessions s
       WHERE s.app_name = $1
         AND ($2::text IS NULL OR s.user_id = $2)
       ORDER BY s.last_update_time ${direction}`,
      [request.appName, request.userId ?? null],
    );

    const totalItems = rows.length;
    const limit = request.limit ?? (totalItems || 1);
    const page = request.page ?? 1;
    const offset = request.page ? (page - 1) * limit : (request.offset ?? 0);
    const sliced = request.limit ? rows.slice(offset, offset + limit) : rows;

    const sessions: Session[] = sliced.map((r) => ({
      id: r.id,
      appName: r.app_name,
      userId: r.user_id,
      state: {},
      events: r.first_event ? [r.first_event] : [],
      lastUpdateTime: Number(r.last_update_time),
    }));

    return {
      sessions,
      page,
      limit,
      totalItems,
      totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / limit),
    };
  }

  async deleteSession(request: DeleteSessionRequest): Promise<void> {
    await this.ensureSchema();
    await this.db.query(
      `DELETE FROM public.adk_sessions WHERE id = $1 AND app_name = $2 AND user_id = $3`,
      [request.sessionId, request.appName, request.userId],
    );
  }

  override async appendEvent({ session, event }: AppendEventRequest): Promise<Event> {
    await this.ensureSchema();
    const appended = await super.appendEvent({ session, event });
    if (appended.partial) return appended;

    const eventId = appended.id || randomUUID();
    const nowSec = appended.timestamp ?? Date.now() / 1000;
    session.lastUpdateTime = nowSec;

    await this.db.query(
      `INSERT INTO public.adk_session_events (session_id, event_id, payload)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (session_id, event_id) DO UPDATE SET payload = EXCLUDED.payload`,
      [session.id, eventId, JSON.stringify(appended)],
    );

    await this.db.query(
      `UPDATE public.adk_sessions
       SET state = $1::jsonb, last_update_time = $2
       WHERE id = $3`,
      [JSON.stringify(session.state ?? {}), nowSec, session.id],
    );

    // Telemetría: capturar uso de tokens de eventos del modelo (Gemini vía ADK)
    await this.recordUsage(appended, session.id);

    return appended;
  }

  /** Extrae usageMetadata de un evento ADK (puede estar en raíz o dentro de content). */
  private extractUsageMetadata(event: Event): UsageMetadata | null {
    const ev = event as unknown as Record<string, unknown>;
    const content = ev.content as unknown as Record<string, unknown> | undefined;
    const candidates: Array<Record<string, unknown> | undefined> = [ev, content];
    for (const c of candidates) {
      if (!c || typeof c !== 'object') continue;
      const um = c['usageMetadata'] ?? c['usage_metadata'];
      if (um && typeof um === 'object' && !Array.isArray(um)) {
        return um as UsageMetadata;
      }
    }
    return null;
  }

  /** Registra uso de LLM en telemetría si hay usageMetadata y servicio disponible. */
  private async recordUsage(event: Event, sessionId: string): Promise<void> {
    if (!this.telemetry) return;

    const um = this.extractUsageMetadata(event);
    if (!um) return;

    const promptTokens = Number(um.promptTokenCount ?? 0);
    const completionTokens = Number(um.candidatesTokenCount ?? 0);
    const totalTokens = Number(um.totalTokenCount ?? promptTokens + completionTokens);

    if (totalTokens === 0 && promptTokens === 0 && completionTokens === 0) return;

    const agentName = (event.author ?? 'unknown') as string;
    const ev = event as unknown as Record<string, unknown>;
    const customMetadata = (ev.customMetadata ?? ev.customData) as Record<string, unknown> | undefined;
    // Los eventos ADK no exponen el modelo usado; se infiere del agente emisor
    // según la configuración de MODELS. Un override explícito tiene prioridad.
    const modelFromAgent =
      agentName === 'software_agent' ? MODELS.pro : MODELS.standard;
    const model =
      (customMetadata?.model as string | undefined) ?? modelFromAgent;

    await this.telemetry.record({
      sessionId,
      agentName,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd: 0, // se calcula en el servicio según el modelo
    });
  }
}
