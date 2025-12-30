import { Agent } from '../App';
import './AgentSelector.css';

interface AgentSelectorProps {
  agents: Agent[];
  selectedAgent: Agent | null;
  onSelectAgent: (agent: Agent) => void;
  loading: boolean;
  error: string | null;
}

function AgentSelector({ agents, selectedAgent, onSelectAgent, loading, error }: AgentSelectorProps) {
  if (loading) {
    return (
      <div className="agent-selector">
        <div className="loading-state">
          <div className="spinner"></div>
          <span>Loading agents...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="agent-selector">
        <div className="error-state">
          <span className="error-icon">⚠</span>
          <span className="error-message">{error}</span>
        </div>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="agent-selector">
        <div className="empty-agents">
          <span>No agents configured</span>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-selector">
      <div className="agent-list">
        {agents.map((agent) => (
          <button
            key={agent.agent_id}
            className={`agent-item ${selectedAgent?.agent_id === agent.agent_id ? 'active' : ''}`}
            onClick={() => onSelectAgent(agent)}
          >
            <div className="agent-item-header">
              <span className="agent-name">{agent.agent_name}</span>
              {agent.has_letta && (
                <span className="agent-badge letta">Letta</span>
              )}
            </div>
            {agent.description && (
              <p className="agent-description">{agent.description}</p>
            )}
            <div className="agent-modules">
              {agent.modules.slice(0, 3).map((module) => (
                <span key={module} className="module-tag">{module}</span>
              ))}
              {agent.modules.length > 3 && (
                <span className="module-tag more">+{agent.modules.length - 3}</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default AgentSelector;
