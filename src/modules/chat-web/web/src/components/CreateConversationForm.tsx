import { useState } from 'react';
import Input from '../sacred/components/Input';
import Button from '../sacred/components/Button';
import type { Agent, Conversation } from '../types';

interface CreateConversationFormProps {
  agents: Agent[];
  onSubmit: (name: string, participantIds: string[]) => Promise<Conversation>;
  onCancel: () => void;
}

/**
 * Inline form for creating a new multi-agent conversation
 */
export function CreateConversationForm({ agents, onSubmit, onCancel }: CreateConversationFormProps) {
  const [newConversationName, setNewConversationName] = useState('');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newConversationName.trim()) {
      setError('Conversation name is required');
      return;
    }

    if (selectedAgentIds.length === 0) {
      setError('Select at least one agent');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onSubmit(newConversationName, selectedAgentIds);
      setNewConversationName('');
      setSelectedAgentIds([]);
    } catch (err) {
      console.error('Failed to create conversation:', err);
      setError(err instanceof Error ? err.message : 'Failed to create conversation');
    } finally {
      setLoading(false);
    }
  };

  const toggleAgentSelection = (agentId: string) => {
    setSelectedAgentIds(prev =>
      prev.includes(agentId)
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    );
  };

  return (
    <div style={{
      padding: '0.5rem',
      marginBottom: '0.5rem',
      border: '1px solid var(--theme-border)',
      background: 'var(--theme-background-modal)',
      fontSize: '11px'
    }}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '0.5rem' }}>
          <Input
            type="text"
            placeholder="Conversation name"
            value={newConversationName}
            onChange={(e) => setNewConversationName(e.target.value)}
            required
            autoFocus
            style={{ fontSize: '11px', padding: '0.25rem 0.5rem' }}
          />
        </div>
        <div style={{ marginBottom: '0.5rem', maxHeight: '150px', overflowY: 'auto' }}>
          {agents.filter(a => a.has_letta).map(agent => (
            <label
              key={agent.agent_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                cursor: 'pointer',
                fontSize: '10px',
                marginBottom: '0.25rem'
              }}
            >
              <input
                type="checkbox"
                checked={selectedAgentIds.includes(agent.agent_id)}
                onChange={() => toggleAgentSelection(agent.agent_id)}
                style={{ cursor: 'pointer' }}
              />
              {agent.agent_name}
            </label>
          ))}
        </div>
        {error && (
          <div style={{ color: 'var(--theme-error)', fontSize: '10px', marginBottom: '0.5rem' }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
          <Button
            type="button"
            onClick={onCancel}
            style={{ fontSize: '10px', padding: '0.25rem 0.5rem' }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading}
            style={{ fontSize: '10px', padding: '0.25rem 0.5rem' }}
          >
            {loading ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </form>
    </div>
  );
}
