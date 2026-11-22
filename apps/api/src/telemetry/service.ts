import { Pool } from 'pg';
import { POSTGRES } from '../config.js';

/**
 * Telemetría de uso de LLM (tokens y costo estimado) de Gemini vía ADK.
 * Se registra cada vez que un evento de sesión trae usageMetadata.
 *
 * Precios por 1M de tokens (configurables en .env; valores por defecto
 * son referenciales de Gemini y deben ajustarse por Adrián si cambian).
 */
export interface UsageRecord {
  sessionId: string;
  agentName: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface UsageStats {
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  byModel: Array<{
    model: string;
    requests: number;
    tokens: number;
    costUsd: number;
  }>;
  byDay: Array<{
    day: string;
    requests: number;
    tokens: number;
    costUsd: number;
  }>;
}

export class TelemetryService {
  readonly enabled: boolean;
  private readonly db: Pool;

  // Precios por 1M de tokens (USD). Ajustar en .env si es necesario.
  private readonly prices: Record<string, { input: number; output: number }>;

  constructor(connectionString: string) {
    this.enabled = /^postgres(ql)?:\/\//i.test(connectionString || '');
    this.db = this.enabled
      ? new Pool({
          connectionString,
          max: 5,
          connectionTimeoutMillis: 3_000,
          idleTimeoutMillis: 30_000,
          statement_timeout: 5_000,
        })
      : null as unknown as Pool;

    this.prices = {
      'gemini-3.1-flash-lite': {
        input: Number(process.env.GEMINI_PRICE_FLASH_LITE_INPUT_USD_PER_M || 0.075),
        output: Number(process.env.GEMINI_PRICE_FLASH_LITE_OUTPUT_USD_PER_M || 0.30),
      },
      'gemini-3.8-flash': {
        input: Number(process.env.GEMINI_PRICE_FLASH_INPUT_USD_PER_M || 0.15),
        output: Number(process.env.GEMINI_PRICE_FLASH_OUTPUT_USD_PER_M || 0.60),
      },
      'gemini-3.1-pro-preview': {
        input: Number(process.env.GEMINI_PRICE_PRO_INPUT_USD_PER_M || 1.25),
        output: Number(process.env.GEMINI_PRICE_PRO_OUTPUT_USD_PER_M || 5.00),
      },
    };
  }

  async close(): Promise<void> {
    if (this.db.end) await this.db.end();
  }

  private ensureSchemaSql(): string {
    return `
      CREATE TABLE IF NOT EXISTS public.llm_usage (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id     TEXT NOT NULL,
        agent_name     TEXT NOT NULL,
        model          TEXT NOT NULL,
        prompt_tokens  INT NOT NULL DEFAULT 0,
        completion_tokens INT NOT NULL DEFAULT 0,
        total_tokens   INT NOT NULL DEFAULT 0,
        cost_usd       NUMERIC(10, 6) NOT NULL DEFAULT 0,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS llm_usage_session_idx
        ON public.llm_usage (session_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS llm_usage_model_idx
        ON public.llm_usage (model, created_at DESC);
    `;
  }

  async init(): Promise<void> {
    if (!this.enabled) return;
    await this.db.query(this.ensureSchemaSql());
  }

  private costFor(model: string, promptTokens: number, completionTokens: number): number {
    const p = this.prices[model] ?? { input: 0, output: 0 };
    return (promptTokens / 1_000_000) * p.input + (completionTokens / 1_000_000) * p.output;
  }

  async record(record: UsageRecord): Promise<void> {
    if (!this.enabled) return;
    const costUsd = this.costFor(record.model, record.promptTokens, record.completionTokens);
    await this.db.query(
      `INSERT INTO public.llm_usage
        (session_id, agent_name, model, prompt_tokens, completion_tokens, total_tokens, cost_usd)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        record.sessionId,
        record.agentName,
        record.model,
        record.promptTokens,
        record.completionTokens,
        record.totalTokens,
        costUsd,
      ],
    );
  }

  async stats(): Promise<UsageStats> {
    if (!this.enabled) {
      return {
        totalRequests: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        byModel: [],
        byDay: [],
      };
    }

    type UsageRow = {
      session_id: string;
      agent_name: string;
      model: string;
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      cost_usd: number;
      day: string;
    };

    const { rows } = await this.db.query<UsageRow>(
      `SELECT session_id, agent_name, model, prompt_tokens, completion_tokens,
              total_tokens, cost_usd,
              to_char(created_at, 'YYYY-MM-DD') AS day
         FROM public.llm_usage
        ORDER BY created_at DESC`,
    );

    let totalRequests = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let totalCostUsd = 0;
    const byModel = new Map<string, { requests: number; tokens: number; costUsd: number }>();
    const byDay = new Map<string, { requests: number; tokens: number; costUsd: number }>();

    for (const r of rows) {
      totalRequests += 1;
      totalPromptTokens += Number(r.prompt_tokens ?? 0);
      totalCompletionTokens += Number(r.completion_tokens ?? 0);
      totalTokens += Number(r.total_tokens ?? 0);
      totalCostUsd += Number(r.cost_usd ?? 0);

      const m = byModel.get(r.model) ?? { requests: 0, tokens: 0, costUsd: 0 };
      m.requests += 1;
      m.tokens += Number(r.total_tokens ?? 0);
      m.costUsd += Number(r.cost_usd ?? 0);
      byModel.set(r.model, m);

      const d = byDay.get(r.day) ?? { requests: 0, tokens: 0, costUsd: 0 };
      d.requests += 1;
      d.tokens += Number(r.total_tokens ?? 0);
      d.costUsd += Number(r.cost_usd ?? 0);
      byDay.set(r.day, d);
    }

    return {
      totalRequests,
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens,
      totalCostUsd: Number(totalCostUsd.toFixed(6)),
      byModel: Array.from(byModel.entries()).map(([model, v]) => ({ model, ...v })),
      byDay: Array.from(byDay.entries()).map(([day, v]) => ({ day, ...v })),
    };
  }
}
