/**
 * Admin API client for Ampelos dashboard
 *
 * New architecture:
 * - Agent definitions store only id, name, enabled, module list
 * - Module configs are passed at creation time via module_configs
 * - Module state is stored separately
 */

import { apiFetch } from '../../utils/apiFetch';
import type {
  AgentDefinition,
  CreateAgentRequest,
  CreateAgentFromTemplateRequest,
  UpdateAgentRequest,
  AvailableModule,
  AddModuleRequest,
  ModuleInitConfig,
  AgentTemplate,
  TemplateInfo,
  CreateAgentTemplateRequest,
  HealthStatus,
  APIResponse,
  MemoryBlockDetail,
  CreateMemoryBlockRequest,
} from '../types/admin';

const API_BASE = '/api/admin';

// =============================================================================
// Helper Functions
// =============================================================================

async function handleResponse<T>(response: Response): Promise<T> {
  const data: APIResponse<T> = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || `API error: ${response.status}`);
  }

  return data.data as T;
}

// =============================================================================
// Agent APIs
// =============================================================================

export async function fetchAgents(): Promise<{ agents: AgentDefinition[] }> {
  const response = await apiFetch(`${API_BASE}/agents`);
  return handleResponse(response);
}

export async function fetchAgent(agentId: string): Promise<{ agent: AgentDefinition; state?: Record<string, unknown> }> {
  const response = await apiFetch(`${API_BASE}/agents/${encodeURIComponent(agentId)}`);
  return handleResponse(response);
}

export async function createAgent(data: CreateAgentRequest): Promise<{ agent: AgentDefinition }> {
  const response = await apiFetch(`${API_BASE}/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

export async function createAgentFromTemplate(
  templateId: string,
  variables: Record<string, unknown>
): Promise<{ agent: AgentDefinition }> {
  const request: CreateAgentFromTemplateRequest = {
    template: templateId,
    variables: variables as CreateAgentFromTemplateRequest['variables'],
  };
  const response = await apiFetch(`${API_BASE}/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse(response);
}

export async function updateAgent(
  agentId: string,
  data: UpdateAgentRequest
): Promise<{ agent: AgentDefinition }> {
  const response = await apiFetch(`${API_BASE}/agents/${encodeURIComponent(agentId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

export async function deleteAgent(agentId: string, deleteLetta = false): Promise<void> {
  const url = deleteLetta
    ? `${API_BASE}/agents/${encodeURIComponent(agentId)}?deleteLetta=true`
    : `${API_BASE}/agents/${encodeURIComponent(agentId)}`;
  const response = await apiFetch(url, { method: 'DELETE' });
  await handleResponse(response);
}

export async function enableAgent(agentId: string): Promise<{ agent: AgentDefinition }> {
  const response = await apiFetch(`${API_BASE}/agents/${encodeURIComponent(agentId)}/enable`, {
    method: 'POST',
  });
  return handleResponse(response);
}

export async function disableAgent(agentId: string): Promise<{ agent: AgentDefinition }> {
  const response = await apiFetch(`${API_BASE}/agents/${encodeURIComponent(agentId)}/disable`, {
    method: 'POST',
  });
  return handleResponse(response);
}

export async function createLettaAgent(agentId: string): Promise<{ letta_agent_id: string }> {
  const response = await apiFetch(`${API_BASE}/agents/${encodeURIComponent(agentId)}/create-letta`, {
    method: 'POST',
  });
  return handleResponse(response);
}

// =============================================================================
// Module APIs
// =============================================================================

export async function fetchAvailableModules(): Promise<{ modules: AvailableModule[] }> {
  const response = await apiFetch(`${API_BASE}/modules`);
  return handleResponse(response);
}

export async function fetchModuleSchema(
  moduleName: string
): Promise<{ name: string; version: string; schema: Record<string, unknown> }> {
  const response = await apiFetch(`${API_BASE}/modules/${encodeURIComponent(moduleName)}/schema`);
  return handleResponse(response);
}

export async function fetchAgentModules(
  agentId: string
): Promise<{ modules: string[] }> {
  const response = await apiFetch(`${API_BASE}/agents/${encodeURIComponent(agentId)}/modules`);
  return handleResponse(response);
}

export async function addModuleToAgent(
  agentId: string,
  moduleName: string,
  config?: AddModuleRequest
): Promise<{ modules: string[] }> {
  const response = await apiFetch(
    `${API_BASE}/agents/${encodeURIComponent(agentId)}/modules/${encodeURIComponent(moduleName)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config ?? {}),
    }
  );
  return handleResponse(response);
}

export async function removeModuleFromAgent(agentId: string, moduleName: string): Promise<void> {
  const response = await apiFetch(
    `${API_BASE}/agents/${encodeURIComponent(agentId)}/modules/${encodeURIComponent(moduleName)}`,
    { method: 'DELETE' }
  );
  await handleResponse(response);
}

// =============================================================================
// Template APIs
// =============================================================================

export async function fetchMemoryBlockTemplates(): Promise<{ templates: TemplateInfo[] }> {
  const response = await apiFetch(`${API_BASE}/templates/memory-blocks`);
  return handleResponse(response);
}

export async function fetchSystemPromptTemplates(): Promise<{ templates: TemplateInfo[] }> {
  const response = await apiFetch(`${API_BASE}/templates/system-prompts`);
  return handleResponse(response);
}

export async function fetchAgentTemplates(): Promise<{ templates: AgentTemplate[] }> {
  const response = await apiFetch(`${API_BASE}/templates/agents`);
  return handleResponse(response);
}

export async function fetchAgentTemplate(templateId: string): Promise<{ template: AgentTemplate }> {
  const response = await apiFetch(`${API_BASE}/templates/agents/${encodeURIComponent(templateId)}`);
  return handleResponse(response);
}

export async function createAgentTemplate(
  data: CreateAgentTemplateRequest
): Promise<{ template: AgentTemplate }> {
  const response = await apiFetch(`${API_BASE}/templates/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

export async function deleteAgentTemplate(templateId: string): Promise<void> {
  const response = await apiFetch(`${API_BASE}/templates/agents/${encodeURIComponent(templateId)}`, {
    method: 'DELETE',
  });
  await handleResponse(response);
}

export async function refreshTemplates(): Promise<{ memoryBlocks: number; systemPrompts: number }> {
  const response = await apiFetch(`${API_BASE}/templates/refresh`, { method: 'POST' });
  return handleResponse(response);
}

// =============================================================================
// Health APIs
// =============================================================================

export async function fetchHealth(): Promise<HealthStatus> {
  const response = await apiFetch(`${API_BASE}/health`);
  return handleResponse(response);
}

// =============================================================================
// Memory Block APIs (uses chat-web endpoints)
// =============================================================================

const CHAT_API_BASE = '/api';

export async function fetchMemoryBlocks(agentId: string): Promise<{ blocks: MemoryBlockDetail[] }> {
  const response = await apiFetch(`${CHAT_API_BASE}/agents/${encodeURIComponent(agentId)}/memory`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `API error: ${response.status}`);
  }
  return response.json();
}

export async function createMemoryBlock(
  agentId: string,
  data: CreateMemoryBlockRequest
): Promise<{ success: boolean; blockId: string }> {
  const response = await apiFetch(`${CHAT_API_BASE}/agents/${encodeURIComponent(agentId)}/memory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `API error: ${response.status}`);
  }
  return response.json();
}

export async function updateMemoryBlock(
  agentId: string,
  blockLabel: string,
  value: string
): Promise<{ success: boolean }> {
  const response = await apiFetch(
    `${CHAT_API_BASE}/agents/${encodeURIComponent(agentId)}/memory/${encodeURIComponent(blockLabel)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    }
  );
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `API error: ${response.status}`);
  }
  return response.json();
}

export async function deleteMemoryBlock(
  agentId: string,
  blockId: string
): Promise<{ success: boolean }> {
  const response = await apiFetch(
    `${CHAT_API_BASE}/agents/${encodeURIComponent(agentId)}/memory/${encodeURIComponent(blockId)}`,
    { method: 'DELETE' }
  );
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `API error: ${response.status}`);
  }
  return response.json();
}
