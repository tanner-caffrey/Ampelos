import { useState, useEffect } from 'react';
import type { Agent } from '../types';
import Button from '../sacred/components/Button';
import Card from '../sacred/components/Card';
import Input from '../sacred/components/Input';
import './ConversationList.css';

export interface Conversation {
  id: string;
  name: string;
  created_at: string;
  created_by: string;
  participants: string[];
  messages: ConversationMessage[];
  settings: {
    max_turns: number;
    max_duration_ms: number;
    require_user_approval: boolean;
  };
  state: {
    current_turn: number;
    started_at: string;
    last_activity: string;
    waiting_for_approval: boolean;
    last_agent_id?: string;
    is_active: boolean;
  };
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'agent';
  agent_id?: string;
  content: string;
  created_at: string;
}

interface ConversationListProps {
  agents: Agent[];
  selectedConversationId?: string;
  onSelectConversation: (conversation: Conversation) => void;
  onCreateConversation: (conversation: Conversation) => void;
}

function ConversationList({ agents, selectedConversationId, onSelectConversation, onCreateConversation }: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newConversationName, setNewConversationName] = useState('');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/conversations');
      if (!response.ok) {
        throw new Error('Failed to load conversations');
      }
      const data = await response.json();
      setConversations(data.conversations || []);
    } catch (err) {
      console.error('Failed to load conversations:', err);
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateConversation = async (e: React.FormEvent) => {
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
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newConversationName,
          participants: selectedAgentIds
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create conversation');
      }

      const data = await response.json();
      const newConversation = data.conversation;
      setConversations(prev => [newConversation, ...prev]);
      onCreateConversation(newConversation);
      setShowCreateForm(false);
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

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getAgentName = (agentId: string) => {
    const agent = agents.find(a => a.agent_id === agentId);
    return agent?.agent_name || agentId;
  };

  return (
    <div className="conversation-list">
      <div className="conversation-list-header">
        <h2>Conversations</h2>
        <Button
          onClick={() => setShowCreateForm(!showCreateForm)}
          variant="primary"
        >
          {showCreateForm ? 'Cancel' : 'New Conversation'}
        </Button>
      </div>

      {showCreateForm && (
        <>
          <div 
            className="create-conversation-form-overlay"
            onClick={() => {
              setShowCreateForm(false);
              setError(null);
              setNewConversationName('');
              setSelectedAgentIds([]);
            }}
          />
          <Card className="create-conversation-form">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Create Conversation</h3>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setError(null);
                  setNewConversationName('');
                  setSelectedAgentIds([]);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--theme-text)',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  padding: '0.25rem 0.5rem',
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateConversation}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', opacity: 0.8 }}>
                  Conversation name
                </label>
                <Input
                  type="text"
                  placeholder="Enter conversation name"
                  value={newConversationName}
                  onChange={(e) => setNewConversationName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="agent-selection">
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', opacity: 0.8 }}>
                  Select Agents:
                </label>
                <div className="agent-checkboxes">
                  {agents.filter(a => a.has_letta).map(agent => (
                    <label key={agent.agent_id} className="agent-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedAgentIds.includes(agent.agent_id)}
                        onChange={() => toggleAgentSelection(agent.agent_id)}
                      />
                      {agent.agent_name}
                    </label>
                  ))}
                </div>
              </div>
              {error && <div className="error" style={{ marginTop: '1rem' }}>{error}</div>}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                <Button 
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowCreateForm(false);
                    setError(null);
                    setNewConversationName('');
                    setSelectedAgentIds([]);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={loading}>
                  {loading ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </form>
          </Card>
        </>
      )}

      {error && !showCreateForm && (
        <div className="error">{error}</div>
      )}

      {loading && !showCreateForm && (
        <div className="loading">Loading conversations...</div>
      )}

      <div className="conversations">
        {conversations.map(conversation => (
          <Card
            key={conversation.id}
            className={`conversation-item ${selectedConversationId === conversation.id ? 'selected' : ''}`}
            onClick={() => {
              console.log('Selecting conversation:', conversation.id);
              onSelectConversation(conversation);
            }}
            style={{ cursor: 'pointer' }}
          >
            <div className="conversation-header">
              <h3>{conversation.name}</h3>
              <span className="conversation-meta">
                {formatTimestamp(conversation.created_at)}
              </span>
            </div>
            <div className="conversation-participants">
              Participants: {conversation.participants.map(id => getAgentName(id)).join(', ')}
            </div>
            <div className="conversation-stats">
              <span>Messages: {conversation.messages.length}</span>
              <span>Turn: {conversation.state.current_turn}/{conversation.settings.max_turns}</span>
              {conversation.state.waiting_for_approval && (
                <span className="waiting-approval">Waiting for approval</span>
              )}
            </div>
          </Card>
        ))}
      </div>

      {conversations.length === 0 && !loading && (
        <div className="empty-state">
          <p>No conversations yet. Create one to get started!</p>
        </div>
      )}
    </div>
  );
}

export default ConversationList;

