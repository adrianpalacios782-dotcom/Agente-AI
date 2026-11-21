export type NavView =
  | 'inicio'
  | 'agentes'
  | 'playground'
  | 'conocimiento'
  | 'plantillas'
  | 'evaluaciones'
  | 'eventos'
  | 'trazas'
  | 'artefactos'
  | 'estado'
  | 'configuracion';

export interface AdkInlineData {
  mimeType: string;
  data: string;
}

export interface AdkFunctionCall {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
}

export interface AdkFunctionResponse {
  id?: string;
  name: string;
  response?: Record<string, unknown>;
}

export interface AdkPart {
  text?: string;
  thought?: boolean;
  inlineData?: AdkInlineData;
  functionCall?: AdkFunctionCall;
  functionResponse?: AdkFunctionResponse;
}

export interface AdkEvent {
  id?: string;
  invocationId?: string;
  author?: string;
  timestamp?: number;
  partial?: boolean;
  errorCode?: string;
  errorMessage?: string;
  content?: {
    role?: string;
    parts?: AdkPart[];
  };
  actions?: {
    stateDelta?: Record<string, unknown>;
    artifactDelta?: Record<string, number>;
    transferToAgent?: string;
    requestedToolConfirmations?: Record<string, unknown>;
  };
}

export interface AdkSession {
  id: string;
  appName: string;
  userId: string;
  state: Record<string, unknown>;
  events: AdkEvent[];
  lastUpdateTime?: number;
}

export interface AdkTraceSpan {
  name: string;
  span_id: string;
  trace_id: string;
  start_time: number;
  end_time: number;
  parent_span_id: string | null;
  attributes?: Record<string, unknown>;
}

export interface AdkAgentNode {
  name: string;
  class?: string;
  description?: string;
  model?: string;
  tools?: Array<{ name?: string; description?: string } | string>;
  subAgents?: AdkAgentNode[];
  sub_agents?: AdkAgentNode[];
}

export interface AdkAppInfo {
  name?: string;
  rootAgent?: AdkAgentNode;
  root_agent?: AdkAgentNode;
  readme?: string;
}

export interface WorkspaceOverview {
  appName: string;
  appVersion: string;
  adkVersion: string;
  entity: string;
  models: { fast: string; standard: string; pro: string };
  memoryBackend: 'local' | 'postgres' | 'supabase';
  database: { postgresEnabled: boolean; supabaseEnabled: boolean };
  counts: {
    skills: number;
    contextFiles: number;
    projects: number;
    memoryConfirmed: number;
    memoryHypothesis: number;
    outputs: number;
  };
  authorizedReadDirs: string[];
  apiKeyConfigured: boolean;
}

export interface MemoryItem {
  id: string;
  namespace: 'company' | 'work' | 'technical' | 'projects' | 'creative' | 'preferences';
  entityKey: string;
  title: string;
  content: string;
  state: 'confirmed' | 'hypothesis' | 'deprecated';
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary {
  slug: string;
  title: string;
  status: string;
}

export interface SkillSummary {
  name: string;
  module: 'marketing' | 'software' | 'shared';
  modelTier: 'fast' | 'standard' | 'pro';
  description: string;
  body?: string;
}

export interface ContextFileSummary {
  name: string;
  size: number;
  updatedAt: string;
}

export interface OutputFileSummary {
  relativePath: string;
  size: number;
  updatedAt: string;
}

export interface PendingAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  base64?: string;
  textContent?: string;
  previewUrl?: string;
}
