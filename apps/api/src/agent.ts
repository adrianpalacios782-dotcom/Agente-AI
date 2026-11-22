import { AgentTool, GOOGLE_SEARCH, LlmAgent } from '@google/adk';
import { MODELS, SUPABASE } from './config.js';
import {
  brandComplianceCheckTool,
  contextListTool,
  contextReadTool,
  listAuthorizedFilesTool,
  listCreativeAssetsTool,
  listSkillsTool,
  loadSkillTool,
  memoryConfirmTool,
  memoryNoteTool,
  memorySearchTool,
  projectCreateTool,
  projectListTool,
  projectLogTool,
  projectReadTool,
  projectSetStatusTool,
  readAuthorizedFileTool,
  saveDeliverableTool,
  uploadCreativeAssetTool,
} from './tools/index.js';
import { githubTools } from './tools/githubTools.js';
import { triggerN8nWebhookTool } from './tools/n8nTools.js';
import {
  MARKETING_INSTRUCTION,
  RESEARCH_INSTRUCTION,
  ROOT_INSTRUCTION,
  SOFTWARE_INSTRUCTION,
} from './agents/prompts.js';

/**
 * Investigador con Google Search (aislado porque la búsqueda integrada de Gemini
 * no se combina con function tools en el mismo agente).
 */
const researchAgent = new LlmAgent({
  name: 'research_agent',
  model: MODELS.standard,
  description: 'Investiga en Internet con Google Search y devuelve hallazgos con fuentes y fechas.',
  instruction: RESEARCH_INSTRUCTION,
  tools: [GOOGLE_SEARCH],
  generateContentConfig: { thinkingConfig: { thinkingBudget: 0 } },
});
const researchTool = new AgentTool({ agent: researchAgent });

const coreMemoryAndContext = [
  contextListTool,
  contextReadTool,
  memorySearchTool,
  memoryNoteTool,
  memoryConfirmTool,
];

const projectTools = [
  projectListTool,
  projectReadTool,
  projectCreateTool,
  projectLogTool,
  projectSetStatusTool,
];

const rootTools = [
  ...coreMemoryAndContext,
  ...projectTools,
  triggerN8nWebhookTool,
  researchTool,
];

const marketingTools = [
  ...coreMemoryAndContext,
  listSkillsTool,
  loadSkillTool,
  brandComplianceCheckTool,
  projectLogTool,
  saveDeliverableTool,
  triggerN8nWebhookTool,
  researchTool,
  ...(SUPABASE.enabled ? [listCreativeAssetsTool, uploadCreativeAssetTool] : []),
];

const softwareTools = [
  ...coreMemoryAndContext,
  listSkillsTool,
  loadSkillTool,
  listAuthorizedFilesTool,
  readAuthorizedFileTool,
  ...githubTools,
  projectLogTool,
  saveDeliverableTool,
  researchTool,
];

export const marketingAgent = new LlmAgent({
  name: 'marketing_agent',
  model: MODELS.standard,
  description:
    'Módulo A: marketing digital, publicidad, branding, diseño, copywriting, redes sociales y prompts de imagen/video con IA.',
  instruction: MARKETING_INSTRUCTION,
  tools: marketingTools,
  generateContentConfig: { thinkingConfig: { thinkingBudget: 512 } },
});

export const softwareAgent = new LlmAgent({
  name: 'software_agent',
  model: MODELS.pro,
  description:
    'Módulo B: ingeniería de software. Arquitectura, frontend, backend, bases de datos, depuración, auditoría y pruebas.',
  instruction: SOFTWARE_INSTRUCTION,
  tools: softwareTools,
  generateContentConfig: { thinkingConfig: { thinkingBudget: 2048 } },
});

export const rootAgent = new LlmAgent({
  name: 'adrian_ai',
  model: MODELS.standard,
  description: 'ADRIAN AI: coordinador y asistente personal de trabajo de Adrián en BIMCAT S.R.L.',
  instruction: ROOT_INSTRUCTION,
  tools: rootTools,
  subAgents: [marketingAgent, softwareAgent],
  generateContentConfig: { thinkingConfig: { thinkingBudget: 0 } },
});
