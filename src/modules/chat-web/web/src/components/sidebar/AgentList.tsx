import type { Agent } from '../../types';
import Badge from '../../sacred/components/Badge';
import BlockLoader from '../../sacred/components/BlockLoader';
import './AgentList.scss';

interface AgentListProps {
  agents: Agent[];
  selectedAgent: Agent | null;
  loading: boolean;
  onSelectAgent: (agent: Agent) => void;
}

export function AgentList({ agents, selectedAgent, loading, onSelectAgent }: AgentListProps) {
  if (loading && agents.length === 0) {
    return (
      <div className="agent-list-loading">
        <BlockLoader />
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="agent-list-empty">
        <p>No agents available</p>
      </div>
    );
  }

  return (
    <div className="agent-list">
      <div className="agent-list-header">
        <span>Agents</span>
        <Badge>{agents.length}</Badge>
      </div>

      <div className="agent-list-items">
        {agents.map((agent) => (
          <div
            key={agent.agent_id}
            className={`agent-item ${selectedAgent?.agent_id === agent.agent_id ? 'selected' : ''}`}
            onClick={() => onSelectAgent(agent)}
          >
            <div className="agent-item-header">
              <span className="agent-name">{agent.agent_name}</span>
              {agent.has_letta && (
                <Badge style={{ backgroundColor: 'var(--theme-info)', fontSize: '0.625rem' }}>
                  Letta
                </Badge>
              )}
            </div>
            <div className="agent-item-meta">
              <span className="agent-id">{agent.agent_id}</span>
              {agent.modules.length > 0 && (
                <span className="agent-modules">{agent.modules.length} modules</span>
              )}
            </div>
            {agent.letta_model && (
              <div className="agent-model">
                <span className="model-label">Model:</span>
                <span className="model-value">{agent.letta_model.split('/').pop()}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default AgentList;
