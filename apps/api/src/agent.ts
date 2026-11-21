import { AgentTool, GOOGLE_SEARCH, LlmAgent } from '@google/adk';
import { MODELS } from './config.js';
import {
  contextListTool,
  contextReadTool,
  listAuthorizedFilesTool,
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
} from './tools/index.js';
import {
  MARKETING_INSTRUCTION,
  RESEARCH_INSTRUCTION,
  ROOT_INSTRUCTION,
  SOFTWARE_INSTRUCTION,
} from './agents/prompts.js';

/**
 * Investigador con Google Search. Va aislado en su propio agente porque la
 * búsqueda integrada de Gemini no se combina con function tools en el mismo agente.
 */
const researchAgent = new LlmAgent({
  name: 'research_agent',
  model: MODELS.standard,
  description: 'Investiga en Internet con Google Search y devuelve hallazgos con fuentes y fechas.',
  instruction: RESEARCH_INSTRUCTION,
  tools: [GOOGLE_SEARCH],
});
const researchTool = new AgentTool({ agent: researchAgent });

const commonTools = [
  contextListTool,
  contextReadTool,
  listSkillsTool,
  loadSkillTool,
  memorySearchTool,
  memoryNoteTool,
  memoryConfirmTool,
  projectListTool,
  projectReadTool,
  projectCreateTool,
  projectLogTool,
  projectSetStatusTool,
  listAuthorizedFilesTool,
  readAuthorizedFileTool,
  saveDeliverableTool,
  researchTool,
];

export const marketingAgent = new LlmAgent({
  name: 'marketing_agent',
  model: MODELS.standard,
  description:
    'Módulo A: marketing digital, publicidad, branding, diseño, copywriting, redes sociales y prompts de imagen/video con IA. Analiza referencias visuales con el protocolo de 11 entregables.',
  instruction: MARKETING_INSTRUCTION,
  tools: commonTools,
});

export const softwareAgent = new LlmAgent({
  name: 'software_agent',
  model: MODELS.pro,
  description:
    'Módulo B: ingeniería de software. Arquitectura, frontend, backend, bases de datos, depuración, auditoría de código y seguridad, pruebas y documentación.',
  instruction: SOFTWARE_INSTRUCTION,
  tools: commonTools,
});

export const rootAgent = new LlmAgent({
  name: 'adrian_ai',
  model: MODELS.standard,
  description: 'ADRIAN AI: coordinador y asistente personal de trabajo de Adrián en BIMCAT S.R.L.',
  instruction: ROOT_INSTRUCTION,
  tools: commonTools,
  subAgents: [marketingAgent, softwareAgent],
});
