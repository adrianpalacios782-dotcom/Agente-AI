import type {
  AdkAppInfo,
  AdkEvent,
  AdkPart,
  AdkSession,
  AdkTraceSpan,
  ContextFileSummary,
  MemoryItem,
  OutputFileSummary,
  ProjectSummary,
  SkillSummary,
  WorkspaceOverview,
} from '../types';

const DEFAULT_USER = 'adrian';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let msg = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(body);
      if (parsed.error) msg = String(parsed.error);
    } catch {
      if (body) msg = body.slice(0, 220);
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  userId: DEFAULT_USER,

  async health(): Promise<boolean> {
    try {
      const res = await fetch('/health');
      return res.ok;
    } catch {
      return false;
    }
  },

  async listApps(): Promise<string[]> {
    return fetchJson<string[]>('/list-apps');
  },

  async getAppGraph(appName: string): Promise<AdkAppInfo> {
    return fetchJson<AdkAppInfo>(`/dev/apps/${encodeURIComponent(appName)}/build_graph`);
  },

  async listSessions(appName: string): Promise<AdkSession[]> {
    const data = await fetchJson<{ sessions?: AdkSession[] } | AdkSession[]>(
      `/apps/${encodeURIComponent(appName)}/users/${DEFAULT_USER}/sessions`,
    );
    const list = Array.isArray(data) ? data : (data.sessions ?? []);
    return list.sort((a, b) => (b.lastUpdateTime ?? 0) - (a.lastUpdateTime ?? 0));
  },

  async getSession(appName: string, sessionId: string): Promise<AdkSession> {
    return fetchJson<AdkSession>(
      `/apps/${encodeURIComponent(appName)}/users/${DEFAULT_USER}/sessions/${encodeURIComponent(sessionId)}`,
    );
  },

  async createSession(appName: string, initialState: Record<string, unknown> = {}): Promise<AdkSession> {
    return fetchJson<AdkSession>(`/apps/${encodeURIComponent(appName)}/users/${DEFAULT_USER}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: initialState }),
    });
  },

  async deleteSession(appName: string, sessionId: string): Promise<void> {
    await fetchJson<void>(
      `/apps/${encodeURIComponent(appName)}/users/${DEFAULT_USER}/sessions/${encodeURIComponent(sessionId)}`,
      { method: 'DELETE' },
    );
  },

  async runSse(
    params: {
      appName: string;
      sessionId: string;
      parts: AdkPart[];
      streaming?: boolean;
      signal?: AbortSignal;
    },
    onEvent: (event: AdkEvent) => void,
  ): Promise<void> {
    const res = await fetch('/run_sse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: params.signal,
      body: JSON.stringify({
        appName: params.appName,
        userId: DEFAULT_USER,
        sessionId: params.sessionId,
        newMessage: { role: 'user', parts: params.parts },
        streaming: params.streaming ?? false,
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(txt || `HTTP ${res.status}`);
    }
    if (!res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const dataLines = block
          .split(/\r?\n/)
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim());
        if (dataLines.length === 0) continue;
        const raw = dataLines.join('\n');
        try {
          const parsed = JSON.parse(raw) as AdkEvent & { error?: string };
          if (parsed.error && !parsed.errorMessage) {
            onEvent({ errorCode: 'SSE_ERROR', errorMessage: parsed.error, timestamp: Date.now() / 1000 });
          } else {
            onEvent(parsed);
          }
        } catch {
          // Ignorar keep-alive o fragmentos no JSON
        }
      }
    }
  },

  async getSessionTraces(appName: string, sessionId: string): Promise<AdkTraceSpan[]> {
    try {
      return await fetchJson<AdkTraceSpan[]>(
        `/dev/apps/${encodeURIComponent(appName)}/debug/trace/session/${encodeURIComponent(sessionId)}`,
      );
    } catch {
      return [];
    }
  },

  async listArtifacts(appName: string, sessionId: string): Promise<string[]> {
    try {
      return await fetchJson<string[]>(
        `/apps/${encodeURIComponent(appName)}/users/${DEFAULT_USER}/sessions/${encodeURIComponent(sessionId)}/artifacts`,
      );
    } catch {
      return [];
    }
  },

  async loadArtifact(appName: string, sessionId: string, name: string): Promise<unknown> {
    return fetchJson<unknown>(
      `/apps/${encodeURIComponent(appName)}/users/${DEFAULT_USER}/sessions/${encodeURIComponent(sessionId)}/artifacts/${encodeURIComponent(name)}`,
    );
  },

  async listEvalSets(appName: string): Promise<string[]> {
    try {
      const res = await fetchJson<string[] | { evalSets?: string[] }>(
        `/dev/apps/${encodeURIComponent(appName)}/eval_sets`,
      );
      return Array.isArray(res) ? res : (res.evalSets ?? []);
    } catch {
      return [];
    }
  },

  async createEvalSet(appName: string, evalSetId: string): Promise<void> {
    await fetchJson<unknown>(
      `/dev/apps/${encodeURIComponent(appName)}/eval_sets/${encodeURIComponent(evalSetId)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    );
  },

  async addSessionToEvalSet(appName: string, evalSetId: string, sessionId: string, evalId: string): Promise<void> {
    await fetchJson<unknown>(
      `/dev/apps/${encodeURIComponent(appName)}/eval_sets/${encodeURIComponent(evalSetId)}/add_session`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evalId, sessionId, userId: DEFAULT_USER }),
      },
    );
  },

  async listEvalResults(appName: string): Promise<string[]> {
    try {
      const res = await fetchJson<string[] | { evalSetResults?: string[] }>(
        `/dev/apps/${encodeURIComponent(appName)}/eval_results`,
      );
      return Array.isArray(res) ? res : (res.evalSetResults ?? []);
    } catch {
      return [];
    }
  },

  async getEvalResult(appName: string, resultId: string): Promise<unknown> {
    return fetchJson<unknown>(
      `/dev/apps/${encodeURIComponent(appName)}/eval_results/${encodeURIComponent(resultId)}`,
    );
  },

  // --- Workspace ADRIAN AI endpoints (datos reales) ---
  overview(): Promise<WorkspaceOverview> {
    return fetchJson<WorkspaceOverview>('/api/workspace/overview');
  },

  memory(namespace = 'all', q = ''): Promise<{ backend: string; items: MemoryItem[] }> {
    const qs = new URLSearchParams({ namespace, q }).toString();
    return fetchJson<{ backend: string; items: MemoryItem[] }>(`/api/workspace/memory?${qs}`);
  },

  projects(): Promise<{ projects: ProjectSummary[] }> {
    return fetchJson<{ projects: ProjectSummary[] }>('/api/workspace/projects');
  },

  projectDetail(slug: string): Promise<{ slug: string; content: string }> {
    return fetchJson<{ slug: string; content: string }>(`/api/workspace/projects/${encodeURIComponent(slug)}`);
  },

  contextFiles(): Promise<{ files: ContextFileSummary[] }> {
    return fetchJson<{ files: ContextFileSummary[] }>('/api/workspace/context');
  },

  contextDetail(fileName: string): Promise<{ fileName: string; content: string; truncated: boolean }> {
    return fetchJson<{ fileName: string; content: string; truncated: boolean }>(
      `/api/workspace/context/${encodeURIComponent(fileName)}`,
    );
  },

  skills(): Promise<{ skills: SkillSummary[] }> {
    return fetchJson<{ skills: SkillSummary[] }>('/api/workspace/skills');
  },

  skillDetail(name: string): Promise<SkillSummary & { body: string }> {
    return fetchJson<SkillSummary & { body: string }>(`/api/workspace/skills/${encodeURIComponent(name)}`);
  },

  outputs(): Promise<{ outputs: OutputFileSummary[] }> {
    return fetchJson<{ outputs: OutputFileSummary[] }>('/api/workspace/outputs');
  },

  outputDetail(relPath: string): Promise<{ path: string; content: string; truncated: boolean }> {
    return fetchJson<{ path: string; content: string; truncated: boolean }>(
      `/api/workspace/outputs/file?path=${encodeURIComponent(relPath)}`,
    );
  },
};
