import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Agent, Message as AppMessage } from '../App';
import { Conversation, ConversationMessage } from './ConversationList';
import Button from '../sacred/components/Button';
import Card from '../sacred/components/Card';
import Input from '../sacred/components/Input';
import './MultiAgentChat.css';

interface MultiAgentChatProps {
  conversation: Conversation;
  agents: Agent[];
  onConversationUpdate: (conversation: Conversation) => void;
  onBack?: () => void;
}

function MultiAgentChat({ conversation, agents, onConversationUpdate, onBack }: MultiAgentChatProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>(conversation.messages);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(conversation.messages);
  }, [conversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessages = async () => {
    try {
      const response = await fetch(`/api/conversations/${conversation.id}/messages`);
      if (!response.ok) {
        throw new Error('Failed to load messages');
      }
      const data = await response.json();
      setMessages(data.messages || []);
      
      // Update conversation
      const convResponse = await fetch(`/api/conversations/${conversation.id}`);
      if (convResponse.ok) {
        const convData = await convResponse.json();
        onConversationUpdate(convData.conversation);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputValue.trim() || loading) {
      return;
    }

    const userMessage = inputValue.trim();
    setInputValue('');
    setLoading(true);
    setError(null);

    // Add user message immediately
    const tempUserMsg: ConversationMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const response = await fetch(`/api/conversations/${conversation.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userMessage })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send message');
      }

      const data = await response.json();
      
      // Replace temp message and add new messages
      setMessages(prev => {
        const withoutTemp = prev.filter(m => m.id !== tempUserMsg.id);
        return [...withoutTemp, ...(data.messages || [])];
      });

      // Reload conversation to get updated state
      await loadMessages();
    } catch (err) {
      console.error('Failed to send message:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
    } finally {
      setLoading(false);
    }
  };

  const approveNextTurn = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/conversations/${conversation.id}/approve`, {
        method: 'POST'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to approve turn');
      }

      const data = await response.json();
      setMessages(prev => [...prev, ...(data.messages || [])]);
      await loadMessages();
    } catch (err) {
      console.error('Failed to approve turn:', err);
      setError(err instanceof Error ? err.message : 'Failed to approve turn');
    } finally {
      setLoading(false);
    }
  };

  const getAgentName = (agentId?: string) => {
    if (!agentId) return 'Unknown';
    const agent = agents.find(a => a.agent_id === agentId);
    return agent?.agent_name || agentId;
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div className="multi-agent-chat">
      <div className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
          <div>
            <h2>{conversation.name}</h2>
            <div className="conversation-info">
              <span>Participants: {conversation.participants.map(id => getAgentName(id)).join(', ')}</span>
              <span>Turn: {conversation.state.current_turn}/{conversation.settings.max_turns}</span>
            </div>
          </div>
        </div>
        {conversation.state.waiting_for_approval && (
          <Button onClick={approveNextTurn} variant="primary">
            Approve Next Turn
          </Button>
        )}
      </div>

      {error && (
        <div className="error">{error}</div>
      )}

      <div className="messages-container" ref={messagesContainerRef}>
        {messages.map(message => (
          <div
            key={message.id}
            className={`message message-${message.role}`}
          >
            <div className="message-header">
              <span className="message-sender">
                {message.role === 'user' ? 'You' : getAgentName(message.agent_id)}
              </span>
              <span className="message-time">
                {formatTimestamp(message.created_at)}
              </span>
            </div>
            <div className="message-content">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="chat-input-form">
        <Input
          type="text"
          placeholder="Type a message..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={loading}
        />
        <Button type="submit" variant="primary" disabled={loading || !inputValue.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}

export default MultiAgentChat;

