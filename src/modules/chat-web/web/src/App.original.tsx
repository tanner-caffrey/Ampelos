import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Input from './sacred/components/Input';
import TextArea from './sacred/components/TextArea';
import Button from './sacred/components/Button';
import Card from './sacred/components/Card';
import Message from './sacred/components/Message';
import MessageViewer from './sacred/components/MessageViewer';
import BlockLoader from './sacred/components/BlockLoader';
import BarProgress from './sacred/components/BarProgress';
import Badge from './sacred/components/Badge';
import AlertBanner from './sacred/components/AlertBanner';
import MatrixLoader from './sacred/components/MatrixLoader';
import { Conversation, ConversationMessage } from './components/ConversationList';
import './sacred/global.css';

export interface Agent {
  agent_id: string;
  agent_name: string;
  enabled: boolean;
  modules: string[];
  has_letta: boolean;
  letta_agent_id?: string;
  letta_model?: string;
}

export interface MessageContent {
  type: 'text' | 'image';
  text?: string;
  imageUrl?: string;
  imageData?: string; // base64
  imageMimeType?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments?: string | object;
  result?: string | object;
  status?: 'executing' | 'executed' | 'error';
  duration?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | MessageContent[]; // Support both string and multi-modal
  tool_calls?: ToolCall[];
  created_at: string;
  agent_id?: string; // For conversation messages, indicates which agent sent it
  agent_name?: string; // For conversation messages, human-readable agent name
}

export interface MemoryBlock {
  id: string;
  label: string;
  value: string;
  limit: number;
}

function getDiffParts(oldText: string, newText: string) {
  if (!oldText) return { prefix: '', changed: newText, suffix: '' };
  if (!newText) return { prefix: '', changed: '', suffix: '' };

  let prefixLen = 0;
  while (prefixLen < oldText.length && prefixLen < newText.length && oldText[prefixLen] === newText[prefixLen]) {
    prefixLen++;
  }
  
  let suffixLen = 0;
  while (suffixLen < (oldText.length - prefixLen) && suffixLen < (newText.length - prefixLen) && 
         oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]) {
    suffixLen++;
  }
  
  const prefix = newText.substring(0, prefixLen);
  const changed = newText.substring(prefixLen, newText.length - suffixLen);
  const suffix = newText.substring(newText.length - suffixLen);
  
  return { prefix, changed, suffix };
}

interface CreateConversationFormInlineProps {
  agents: Agent[];
  onSubmit: (name: string, participantIds: string[]) => Promise<Conversation>;
  onCancel: () => void;
}

function CreateConversationFormInline({ agents, onSubmit, onCancel }: CreateConversationFormInlineProps) {
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

function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [memoryBlocks, setMemoryBlocks] = useState<MemoryBlock[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelFilter, setModelFilter] = useState('');
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(30); // in ch units (for memory sidebar)
  const [leftSidebarWidth, setLeftSidebarWidth] = useState<number>(20); // in ch units (for agents sidebar)
  const [isDragging, setIsDragging] = useState(false);
  const [isMemoryCollapsed, setIsMemoryCollapsed] = useState(false);
  const [isAgentSidebarCollapsed, setIsAgentSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('chat-agent-sidebar-collapsed') === 'true';
  });
  const dragStartRef = useRef<{ startX: number; startWidth: number; side: 'left' | 'right' } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaWrapperRef = useRef<HTMLDivElement>(null);
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set());
  const [expandedMemoryBlocks, setExpandedMemoryBlocks] = useState<Set<string>>(new Set());
  const [previousMemoryBlocks, setPreviousMemoryBlocks] = useState<Map<string, string>>(new Map());
  const [flashingBlocks, setFlashingBlocks] = useState<Set<string>>(new Set());
  const [lastUpdatedBlocks, setLastUpdatedBlocks] = useState<Map<string, number>>(new Map());
  const [diffBaseValues, setDiffBaseValues] = useState<Map<string, string>>(new Map());
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('chat-theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });
  const [tint, setTint] = useState<string>(() => {
    return localStorage.getItem('chat-tint') || 'green';
  });
  const [crtMode, setCrtMode] = useState<boolean>(() => {
    return localStorage.getItem('chat-crt') === 'true';
  });
  const [matrixBg, setMatrixBg] = useState<boolean>(() => {
    return localStorage.getItem('chat-matrix') === 'true';
  });
  const [fontSize, setFontSize] = useState<string>(() => {
    return localStorage.getItem('chat-font-size') || '14px';
  });
  const [sessionDuration, setSessionDuration] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setSessionDuration(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showCreateConversationForm, setShowCreateConversationForm] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Track textarea focus for cursor styling
  useEffect(() => {
    const handleFocus = () => setIsInputFocused(true);
    const handleBlur = () => setIsInputFocused(false);
    
    const checkTextarea = () => {
      if (textareaWrapperRef.current) {
        const textarea = textareaWrapperRef.current.querySelector('textarea');
        if (textarea) {
          textarea.addEventListener('focus', handleFocus);
          textarea.addEventListener('blur', handleBlur);
          // Also check current focus state
          if (document.activeElement === textarea) {
            setIsInputFocused(true);
          }
          return () => {
            textarea.removeEventListener('focus', handleFocus);
            textarea.removeEventListener('blur', handleBlur);
          };
        }
      }
    };
    
    // Check immediately and after a short delay to catch dynamically added elements
    checkTextarea();
    const timeout = setTimeout(checkTextarea, 100);
    
    return () => {
      clearTimeout(timeout);
      if (textareaWrapperRef.current) {
        const textarea = textareaWrapperRef.current.querySelector('textarea');
        if (textarea) {
          textarea.removeEventListener('focus', handleFocus);
          textarea.removeEventListener('blur', handleBlur);
        }
      }
    };
  }, [inputValue, loading, selectedAgent]);

  useEffect(() => {
    loadAgents();
    loadConversations();
  }, []);

  useEffect(() => {
    if (selectedAgent && !selectedConversation) {
      loadMessages();
      loadMemory();
      loadAgentDetails();
      loadAvailableModels();
    } else if (selectedConversation) {
      loadConversationMessages();
    }
  }, [selectedAgent, selectedConversation]);

  // Close model dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showModelDropdown) {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-model-dropdown]')) {
          setShowModelDropdown(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showModelDropdown]);

  // Scroll to bottom on initial load
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  
  useEffect(() => {
    // On initial load, scroll to bottom immediately
    if (messages.length > 0 && !hasScrolledToBottom) {
      const timeoutId = setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
          setHasScrolledToBottom(true);
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [messages.length, hasScrolledToBottom]);

  // Reset scroll flag when agent or conversation changes
  useEffect(() => {
    setHasScrolledToBottom(false);
  }, [selectedAgent, selectedConversation]);

  // Auto-scroll to bottom when new messages arrive (if already at bottom)
  useEffect(() => {
    // Use setTimeout to ensure DOM has updated
    const scrollToBottom = () => {
      if (messagesContainerRef.current && messagesEndRef.current) {
        const container = messagesContainerRef.current;
        const isScrolledToBottom = 
          container.scrollHeight - container.scrollTop <= container.clientHeight + 150; // 150px threshold
        
        if (isScrolledToBottom) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }
    };
    
    // Small delay to ensure DOM is updated
    const timeoutId = setTimeout(scrollToBottom, 50);
    return () => clearTimeout(timeoutId);
  }, [messages]);

  // Handle resize drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;

      const CHARACTER_WIDTH = 9.6; // Approximate: 1ch ≈ 9.6px for monospace
      const minSidebarWidth = 15; // 15ch minimum
      const viewportWidth = window.innerWidth;
      const maxSidebarWidthCh = (viewportWidth * 0.5) / CHARACTER_WIDTH; // 50% max in ch
      
      // Calculate delta from start position
      const deltaX = dragStartRef.current.side === 'right' 
        ? dragStartRef.current.startX - e.clientX // Right sidebar: negative when dragging right (making larger)
        : e.clientX - dragStartRef.current.startX; // Left sidebar: positive when dragging right (making larger)
      const deltaCh = deltaX / CHARACTER_WIDTH;
      
      // Calculate new width
      const newWidthCh = dragStartRef.current.startWidth + deltaCh;
      
      // Apply constraints
      const constrainedWidth = Math.max(minSidebarWidth, Math.min(maxSidebarWidthCh, newWidthCh));
      
      if (dragStartRef.current.side === 'right') {
        setSidebarWidth(constrainedWidth);
      } else {
        setLeftSidebarWidth(constrainedWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  // Format timestamp helper
  const formatTimestamp = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleString(undefined, { 
      month: 'short', 
      day: 'numeric', 
      hour: 'numeric', 
      minute: '2-digit' 
    });
  };

  // Auto-dismiss memory flashes after 1 minute
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      let changed = false;
      const newFlashing = new Set(flashingBlocks);
      const newLastUpdated = new Map(lastUpdatedBlocks);
      const newDiffBaseValues = new Map(diffBaseValues);

      lastUpdatedBlocks.forEach((timestamp, blockId) => {
        // 1 minute expiration
        if (now - timestamp > 60000 && !expandedMemoryBlocks.has(blockId)) {
          newFlashing.delete(blockId);
          newLastUpdated.delete(blockId);
          newDiffBaseValues.delete(blockId);
          changed = true;
        }
      });

      if (changed) {
        setFlashingBlocks(newFlashing);
        setLastUpdatedBlocks(newLastUpdated);
        setDiffBaseValues(newDiffBaseValues);
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [flashingBlocks, lastUpdatedBlocks, expandedMemoryBlocks, diffBaseValues]);

  // Check scroll position for scroll-to-bottom button
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setIsScrolledUp(!isNearBottom);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [messages]);

  // Apply theme to body
  useEffect(() => {
    document.body.className = `theme-${theme} tint-${tint}${crtMode ? ' crt-mode' : ''}`;
    localStorage.setItem('chat-theme', theme);
    localStorage.setItem('chat-tint', tint);
    localStorage.setItem('chat-crt', String(crtMode));
    localStorage.setItem('chat-matrix', String(matrixBg));
    localStorage.setItem('chat-agent-sidebar-collapsed', String(isAgentSidebarCollapsed));
    localStorage.setItem('chat-font-size', fontSize);
  }, [theme, tint, crtMode, matrixBg, isAgentSidebarCollapsed, fontSize]);

  const loadAgents = async () => {
    try {
      console.log('[ChatWeb] Loading agents...');
      const response = await fetch('/api/agents');
      const data = await response.json();
      console.log('[ChatWeb] Agents loaded:', data);
      setAgents(data.agents || []);
      if (data.agents?.length > 0) {
        setSelectedAgent(data.agents[0]);
      }
    } catch (err) {
      console.error('[ChatWeb] Failed to load agents:', err);
    }
  };

  const loadAgentDetails = async () => {
    if (!selectedAgent) return;
    // Skip if we already have the model to avoid unnecessary updates
    if (selectedAgent.letta_model) return;
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(selectedAgent.agent_id)}`);
      const data = await response.json();
      if (data.letta_model && data.letta_model !== selectedAgent.letta_model) {
        // Update the selected agent with the LLM model
        setSelectedAgent(prev => prev ? { ...prev, letta_model: data.letta_model } : null);
      }
    } catch (err) {
      console.error('[ChatWeb] Failed to load agent details:', err);
    }
  };

  const loadAvailableModels = async () => {
    if (!selectedAgent) return;
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(selectedAgent.agent_id)}/models`);
      const data = await response.json();
      if (data.models) {
        setAvailableModels(data.models);
      }
    } catch (err) {
      console.error('[ChatWeb] Failed to load available models:', err);
    }
  };

  const updateAgentModel = async (model: string) => {
    if (!selectedAgent) return;
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(selectedAgent.agent_id)}/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model })
      });
      const data = await response.json();
      if (data.success) {
        // Update the selected agent with the new model
        setSelectedAgent(prev => prev ? { ...prev, letta_model: model } : null);
        setShowModelDropdown(false);
        // Reload agent details to ensure we have the latest
        await loadAgentDetails();
      }
    } catch (err) {
      console.error('[ChatWeb] Failed to update agent model:', err);
    }
  };

  const loadMessages = async () => {
    if (!selectedAgent) return;
    try {
      console.log('[ChatWeb] Loading messages for agent:', selectedAgent.agent_id);
      const response = await fetch(`/api/agents/${encodeURIComponent(selectedAgent.agent_id)}/messages`);
      const data = await response.json();
      console.log('[ChatWeb] Messages loaded:', data);
      setMessages(data.messages || []);
    } catch (err) {
      console.error('[ChatWeb] Failed to load messages:', err);
    }
  };

  const loadConversationMessages = async () => {
    if (!selectedConversation) return;
    try {
      console.log('[ChatWeb] Loading messages for conversation:', selectedConversation.id);
      const response = await fetch(`/api/conversations/${selectedConversation.id}/messages`);
      if (!response.ok) {
        throw new Error('Failed to load messages');
      }
      const data = await response.json();
      console.log('[ChatWeb] Conversation messages loaded:', data);
      
      // Convert conversation messages to Message format
      const convertedMessages: Message[] = (data.messages || []).map((msg: ConversationMessage) => ({
        id: msg.id,
        role: msg.role === 'agent' ? 'assistant' : msg.role,
        content: msg.content,
        created_at: msg.created_at,
        agent_id: msg.agent_id, // Store agent_id for display
        agent_name: (msg as any).agent_name // Store agent_name if available
      }));
      
      setMessages(convertedMessages);
      
      // Also update conversation state - but only if it actually changed to avoid infinite loops
      const convResponse = await fetch(`/api/conversations/${selectedConversation.id}`);
      if (convResponse.ok) {
        const convData = await convResponse.json();
        const updatedConversation = convData.conversation;
        
        // Only update if something actually changed (check key fields)
        const hasChanged = 
          updatedConversation.state.current_turn !== selectedConversation.state.current_turn ||
          updatedConversation.state.waiting_for_approval !== selectedConversation.state.waiting_for_approval ||
          updatedConversation.messages.length !== selectedConversation.messages.length;
        
        if (hasChanged) {
          setSelectedConversation(updatedConversation);
          setConversations(prev => prev.map(c => c.id === updatedConversation.id ? updatedConversation : c));
        }
      }
    } catch (err) {
      console.error('[ChatWeb] Failed to load conversation messages:', err);
    }
  };

  const loadMemory = async () => {
    if (!selectedAgent) return;
    try {
      console.log('[ChatWeb] Loading memory for agent:', selectedAgent.agent_id);
      const response = await fetch(`/api/agents/${encodeURIComponent(selectedAgent.agent_id)}/memory`);
      const data = await response.json();
      console.log('[ChatWeb] Memory loaded:', data);
      
      const newBlocks: MemoryBlock[] = data.blocks || [];
      setMemoryBlocks(newBlocks);

      // Check for changes
      const now = Date.now();
      const newFlashing = new Set(flashingBlocks);
      const newLastUpdated = new Map(lastUpdatedBlocks);
      const newPrevious = new Map(previousMemoryBlocks);
      const newDiffBaseValues = new Map(diffBaseValues);
      let changed = false;

      newBlocks.forEach(block => {
        const prevValue = previousMemoryBlocks.get(block.id);
        // If we have a previous value and it's different
        if (prevValue !== undefined && prevValue !== block.value) {
          newFlashing.add(block.id);
          newLastUpdated.set(block.id, now);
          newDiffBaseValues.set(block.id, prevValue);
          changed = true;
        }
        // If it's a new block entirely (no prev value), we don't flash/diff, just set it
        newPrevious.set(block.id, block.value);
      });

      if (changed) {
        setFlashingBlocks(newFlashing);
        setLastUpdatedBlocks(newLastUpdated);
        setDiffBaseValues(newDiffBaseValues);
      }
      setPreviousMemoryBlocks(newPrevious);

    } catch (err) {
      console.error('[ChatWeb] Failed to load memory:', err);
    }
  };

  const loadConversations = async () => {
    try {
      console.log('[ChatWeb] Loading conversations...');
      const response = await fetch('/api/conversations');
      if (!response.ok) {
        throw new Error('Failed to load conversations');
      }
      const data = await response.json();
      console.log('[ChatWeb] Conversations loaded:', data);
      setConversations(data.conversations || []);
    } catch (err) {
      console.error('[ChatWeb] Failed to load conversations:', err);
    }
  };

  const handleCreateConversation = async (name: string, participantIds: string[]) => {
    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          participants: participantIds
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create conversation');
      }

      const data = await response.json();
      const newConversation = data.conversation;
      setConversations(prev => [newConversation, ...prev]);
      setSelectedConversation(newConversation);
      setSelectedAgent(null); // Clear agent selection when selecting conversation
      setShowCreateConversationForm(false);
      return newConversation;
    } catch (err) {
      console.error('Failed to create conversation:', err);
      throw err;
    }
  };

  const handleSelectAgent = (agent: Agent) => {
    setSelectedAgent(agent);
    setSelectedConversation(null); // Clear conversation selection when selecting agent
  };

  const handleSelectConversation = (conversation: Conversation) => {
    // Toggle: if clicking the same conversation, deselect it
    if (selectedConversation?.id === conversation.id) {
      setSelectedConversation(null);
    } else {
      setSelectedConversation(conversation);
      setSelectedAgent(null); // Clear agent selection when selecting conversation
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Check file sizes (warn if > 10MB, but we'll compress them)
    const maxFileSize = 50 * 1024 * 1024; // 50MB warning threshold
    const oversizedFiles = files.filter(f => f.size > maxFileSize);
    if (oversizedFiles.length > 0) {
      console.warn(`[ChatWeb] Large files detected (will be compressed):`, oversizedFiles.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`));
    }

    const newFiles = [...selectedImages, ...files];
    setSelectedImages(newFiles);

    // Create previews
    const newPreviews: string[] = [];
    newFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          newPreviews.push(e.target.result as string);
          if (newPreviews.length === newFiles.length) {
            setImagePreviews(newPreviews);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    const newFiles = selectedImages.filter((_, i) => i !== index);
    const newPreviews = imagePreviews.filter((_, i) => i !== index);
    setSelectedImages(newFiles);
    setImagePreviews(newPreviews);
  };

  const handleDropFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    // Filter to only image files
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    // Check file sizes (warn if > 10MB, but we'll compress them)
    const maxFileSize = 50 * 1024 * 1024; // 50MB warning threshold
    const oversizedFiles = imageFiles.filter(f => f.size > maxFileSize);
    if (oversizedFiles.length > 0) {
      console.warn(`[ChatWeb] Large files detected (will be compressed):`, oversizedFiles.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`));
    }

    const newFiles = [...selectedImages, ...imageFiles];
    setSelectedImages(newFiles);

    // Create previews
    const newPreviews: string[] = [];
    newFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          newPreviews.push(e.target.result as string);
          if (newPreviews.length === newFiles.length) {
            setImagePreviews(newPreviews);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!loading && selectedAgent) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    
    if (loading || !selectedAgent) return;
    
    const files = e.dataTransfer.files;
    handleDropFiles(files);
  };

  // Compress and resize image to reduce size
  const compressImage = (file: File, maxWidth: number = 1024, maxHeight: number = 1024, quality: number = 0.85): Promise<{ data: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Calculate new dimensions
          let width = img.width;
          let height = img.height;
          
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = width * ratio;
            height = height * ratio;
          }

          // Create canvas and draw resized image
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // Convert to JPEG (more efficient than PNG for photos)
          // Try different quality levels if still too large
          const tryCompress = (q: number): void => {
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(new Error('Failed to compress image'));
                  return;
                }

                // Check size - max ~4MB base64 (roughly 3MB binary)
                const maxSize = 3 * 1024 * 1024; // 3MB
                if (blob.size > maxSize && q > 0.5) {
                  // Try lower quality
                  tryCompress(q - 0.1);
                } else {
                  // Convert to base64
                  const reader2 = new FileReader();
                  reader2.onload = () => {
                    const result = reader2.result as string;
                    const base64Data = result.split(',')[1];
                    resolve({
                      data: base64Data,
                      mimeType: 'image/jpeg'
                    });
                  };
                  reader2.onerror = reject;
                  reader2.readAsDataURL(blob);
                }
              },
              'image/jpeg',
              q
            );
          };

          tryCompress(quality);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!inputValue.trim() && selectedImages.length === 0) || (!selectedAgent && !selectedConversation) || loading) return;

    const userMessage = inputValue.trim();
    const currentImages = [...selectedImages];
    const currentPreviews = [...imagePreviews];
    const tempUserMsgId = `temp-user-${Date.now()}`;
    
    // Clear input and images immediately for better UX
    setInputValue('');
    setSelectedImages([]);
    setImagePreviews([]);
    setLoading(true);
    
    // Refocus textarea after clearing (textarea is no longer disabled)
    requestAnimationFrame(() => {
      if (textareaWrapperRef.current) {
        const textarea = textareaWrapperRef.current.querySelector('textarea');
        if (textarea) {
          textarea.focus();
        }
      }
    });

    // Track streaming message state
    let streamingAssistantId: string | null = null;
    let streamingContent = '';
    const toolCallsMap = new Map<string, ToolCall>();
    const addedToolCallIds = new Set<string>(); // Track tool calls we've already added messages for

    try {
      // Compress and convert images to base64
      const imagePromises = currentImages.map(file => compressImage(file));
      const imageData = await Promise.all(imagePromises);

      // Build user message content for display
      const userMessageContent: MessageContent[] = [];
      if (userMessage) {
        userMessageContent.push({ type: 'text', text: userMessage });
      }
      for (let i = 0; i < currentPreviews.length; i++) {
        const preview = currentPreviews[i];
        // Extract base64 data from data URL
        const base64Match = preview.match(/^data:([^;]+);base64,(.+)$/);
        if (base64Match) {
          userMessageContent.push({
            type: 'image',
            imageData: base64Match[2],
            imageMimeType: base64Match[1]
          });
        }
      }

      // Add user message to chat immediately (optimistic update)
      const tempUserMsg: Message = {
        id: tempUserMsgId,
        role: 'user',
        content: userMessageContent.length > 0 ? userMessageContent : (userMessage || ''),
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, tempUserMsg]);
      
      // Scroll to bottom immediately when user sends
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);

      // Build request body
      const requestBody: any = {};
      if (userMessage) {
        requestBody.text = userMessage;
      }
      if (imageData.length > 0) {
        requestBody.images = imageData.map(img => ({
          type: 'base64',
          data: img.data,
          mimeType: img.mimeType
        }));
      }

      // Handle conversations vs single-agent chats
      let response: Response;
      if (selectedConversation) {
        // Send to conversation endpoint (non-streaming for now)
        response = await fetch(`/api/conversations/${selectedConversation.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP error ${response.status}`);
        }
        
        const data = await response.json();
        
        // Replace temp message and add new messages
        setMessages(prev => {
          const withoutTemp = prev.filter(m => m.id !== tempUserMsgId);
          const newMessages = (data.messages || []).map((msg: ConversationMessage) => ({
            id: msg.id,
            role: msg.role === 'agent' ? 'assistant' : msg.role,
            content: msg.content,
            created_at: msg.created_at,
            agent_id: msg.agent_id,
            agent_name: (msg as any).agent_name // Include agent_name if available
          }));
          return [...withoutTemp, ...newMessages];
        });
        
        // Reload conversation to get updated state
        await loadConversationMessages();
        setLoading(false);
        return;
      } else {
        // Use streaming endpoint for single-agent chats
        response = await fetch(`/api/agents/${encodeURIComponent(selectedAgent!.agent_id)}/messages/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      // Process SSE stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Parse SSE events (data: {...}\n\n)
        const lines = buffer.split('\n');
        buffer = ''; // Reset buffer, we'll add back incomplete lines

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          // If this is a partial line at the end, save it for next iteration
          if (i === lines.length - 1 && !line.endsWith('\n') && line !== '') {
            buffer = line;
            continue;
          }

          // Skip empty lines and comments (ping)
          if (!line.trim() || line.startsWith(':')) continue;

          // Parse data: events
          if (line.startsWith('data: ')) {
            try {
              const eventData = JSON.parse(line.slice(6));
              
              // Handle different event types
              if (eventData.type === 'tool_call') {
                // Add tool call message - but only if we haven't seen this tool call ID
                const toolMsg = eventData.message as Message;
                const toolCallId = toolMsg.tool_calls?.[0]?.id;
                
                if (toolCallId && !addedToolCallIds.has(toolCallId)) {
                  addedToolCallIds.add(toolCallId);
                  toolCallsMap.set(toolCallId, toolMsg.tool_calls![0]);
                  setMessages(prev => [...prev, toolMsg]);
                  setLoading(false); // Hide loading when first content arrives
                  setTimeout(() => {
                    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                  }, 50);
                }
              } else if (eventData.type === 'tool_return') {
                // Update existing tool call with result
                const toolCallId = eventData.tool_call_id;
                const updatedToolCall = eventData.tool_call as ToolCall;
                toolCallsMap.set(toolCallId, updatedToolCall);
                
                setMessages(prev => prev.map(msg => {
                  if (msg.tool_calls?.some(tc => tc.id === toolCallId)) {
                    return {
                      ...msg,
                      tool_calls: msg.tool_calls?.map(tc => 
                        tc.id === toolCallId ? updatedToolCall : tc
                      )
                    };
                  }
                  return msg;
                }));
              } else if (eventData.type === 'assistant_message') {
                // Add or update assistant message
                const assistantMsg = eventData.message as Message;
                const msgContent = typeof assistantMsg.content === 'string' 
                  ? assistantMsg.content 
                  : '';
                
                if (!streamingAssistantId) {
                  // First assistant message chunk - create new message
                  streamingAssistantId = assistantMsg.id;
                  streamingContent = msgContent;
                  setMessages(prev => [...prev, {
                    ...assistantMsg,
                    content: streamingContent
                  }]);
                  setLoading(false); // Hide loading when first content arrives
                  setIsStreaming(true);
                  setStreamingMessageId(assistantMsg.id);
                } else {
                  // Subsequent chunks - check if same message or new one
                  if (assistantMsg.id !== streamingAssistantId) {
                    // New message, add it (this happens if agent sends multiple messages)
                    streamingAssistantId = assistantMsg.id;
                    streamingContent = msgContent;
                    setMessages(prev => [...prev, {
                      ...assistantMsg,
                      content: streamingContent
                    }]);
                    setStreamingMessageId(assistantMsg.id);
                  } else {
                    // Same message - APPEND the new token content
                    streamingContent += msgContent;
                    setMessages(prev => prev.map(msg => 
                      msg.id === streamingAssistantId 
                        ? { ...msg, content: streamingContent }
                        : msg
                    ));
                  }
                }
                setTimeout(() => {
                  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                }, 50);
              } else if (eventData.type === 'reasoning') {
                // Internal reasoning - optionally display or skip
                // For now, we skip reasoning messages
              } else if (eventData.type === 'done') {
                // Stream complete
                console.log('[Chat] Stream completed');
                setIsStreaming(false);
                setStreamingMessageId(null);
              } else if (eventData.type === 'error') {
                console.error('[Chat] Stream error:', eventData.error);
                throw new Error(eventData.error);
              }
            } catch (parseErr) {
              // Skip malformed events
              console.warn('[Chat] Failed to parse SSE event:', line, parseErr);
            }
          }
        }
      }
      
      loadMemory(); // Refresh memory after interaction
    } catch (err: any) {
      console.error('Failed to send message:', err);
      
      // Restore images on error
      setSelectedImages(currentImages);
      setImagePreviews(currentPreviews);
      
      // Show user-friendly error message
      const errorMessage = err?.message || 'Failed to send message';
      let userErrorMessage = 'Failed to send message.';
      
      if (errorMessage.includes('413') || errorMessage.includes('length limit exceeded') || errorMessage.includes('too large')) {
        userErrorMessage = 'Image(s) are too large. Please try smaller images or fewer images at once.';
      } else if (errorMessage.includes('compression') || errorMessage.includes('Failed to compress')) {
        userErrorMessage = 'Failed to process image(s). Please try different images.';
      }
      
      // Remove temp message on error
      setMessages(prev => prev.filter(m => m.id !== tempUserMsgId));
      
      // Optionally show error to user (you could add a toast/notification here)
      alert(userErrorMessage);
    } finally {
      setLoading(false);
      setIsStreaming(false);
      setStreamingMessageId(null);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Enter to send (without shift), Shift+Enter for newline
      if (e.key === 'Enter' && !e.shiftKey) {
        const activeElement = document.activeElement as HTMLElement;
        if (activeElement?.tagName === 'TEXTAREA') {
          e.preventDefault();
          sendMessage();
        }
      }
      
      // Cmd/Ctrl+Enter also sends (alternative)
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
      }
      
      // Esc to clear input or blur
      if (e.key === 'Escape') {
        const activeElement = document.activeElement as HTMLElement;
        if (activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') {
          if (!inputValue.trim()) {
            activeElement.blur();
          } else {
            setInputValue('');
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inputValue, selectedAgent, selectedConversation, loading, selectedImages.length]);

  return (
    <>
      {/* Image Lightbox */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            cursor: 'pointer'
          }}
        >
          <img
            src={lightboxImage}
            alt="Full size"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain'
            }}
          />
        </div>
      )}
      
    <div className="chat-main-layout" style={{
      display: 'flex',
      height: '100vh',
      fontFamily: 'var(--font-mono)',
      fontSize: fontSize,
      background: 'var(--theme-background)',
      color: 'var(--theme-text)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Matrix Background Effect */}
      {matrixBg && (
        <div style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.03,
          pointerEvents: 'none',
          zIndex: 0,
          overflow: 'hidden'
        }}>
          <MatrixLoader rows={50} mode="katakana" direction="top-to-bottom" />
        </div>
      )}
      {/* Left Sidebar - Agents and Conversations */}
      <div style={{ display: 'flex', flexShrink: 0 }}>
        <div className="chat-left-sidebar" style={{
          width: isAgentSidebarCollapsed ? '3ch' : `${leftSidebarWidth}ch`,
          flexShrink: 0,
          padding: isAgentSidebarCollapsed ? '0' : '1rem',
          borderRight: '1px solid var(--theme-border)',
          overflowY: isAgentSidebarCollapsed ? 'hidden' : 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: isAgentSidebarCollapsed ? '0' : '1rem',
          transition: 'width 0.2s ease, padding 0.2s ease',
          position: 'relative'
        }}>
        {isAgentSidebarCollapsed ? (
          <button
            onClick={() => setIsAgentSidebarCollapsed(false)}
            style={{
              width: '100%',
              flex: 1,
              border: 'none',
              background: 'var(--theme-background-input)',
              color: 'var(--theme-text)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              transition: 'background 0.2s ease',
              letterSpacing: '0.1em',
              padding: '1rem 0'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--theme-button-background)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--theme-background-input)';
            }}
            title="Expand agent sidebar"
          >
            AGENTS
          </button>
        ) : (
          <>
        {/* Agents Section */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 'bold', letterSpacing: '0.05em', margin: 0 }}>
              AGENTS
            </h2>
             <button
                onClick={() => setIsAgentSidebarCollapsed(true)}
                style={{
                  padding: '0.25rem 0.5rem',
                  border: '1px solid var(--theme-border)',
                  background: 'var(--theme-background-input)',
                  color: 'var(--theme-text)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  minWidth: '44px',
                  minHeight: '22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: '0.5rem',
                  transition: 'background 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--theme-button-background)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--theme-background-input)';
                }}
                title="Collapse agent sidebar"
              >
                ▶
              </button>
          </div>
          {agents.map(agent => {
            const initials = agent.agent_name.split(/[\s_-]/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
            const isSelected = selectedAgent?.agent_id === agent.agent_id && !selectedConversation;
            return (
              <div
                key={agent.agent_id}
                onClick={() => handleSelectAgent(agent)}
                className="agent-item"
                style={{
                  padding: '0.5rem',
                  marginBottom: '0.25rem',
                  background: isSelected ? 'var(--theme-button-background)' : 'transparent',
                  border: '1px solid var(--theme-border)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.15s ease',
                  position: 'relative'
                }}
              >
                <div style={{ 
                  flex: 1, 
                  minWidth: 0, 
                  overflow: 'hidden',
                  fontWeight: isSelected ? 'bold' : 'normal',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis'
                }}>
                  {agent.agent_name}
                </div>
              </div>
            );
          })}
        </div>

        {/* Multi-Agent Conversations Section */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 'bold', letterSpacing: '0.05em', margin: 0 }}>
              CONVERSATIONS
            </h2>
            <button
              onClick={() => setShowCreateConversationForm(!showCreateConversationForm)}
              style={{
                padding: '0.125rem 0.375rem',
                border: '1px solid var(--theme-border)',
                background: showCreateConversationForm ? 'var(--theme-focused-foreground)' : 'var(--theme-background-input)',
                color: showCreateConversationForm ? 'var(--theme-background)' : 'var(--theme-text)',
                cursor: 'pointer',
                fontSize: '10px',
                width: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s ease',
                fontFamily: 'var(--font-family-mono)',
                lineHeight: '1',
                marginLeft: '0.5rem'
              }}
              onMouseEnter={(e) => {
                if (!showCreateConversationForm) {
                  e.currentTarget.style.background = 'var(--theme-button-background)';
                }
              }}
              onMouseLeave={(e) => {
                if (!showCreateConversationForm) {
                  e.currentTarget.style.background = 'var(--theme-background-input)';
                }
              }}
              title="Create new multi-agent conversation"
            >
              +
            </button>
          </div>
          
          {showCreateConversationForm && (
            <CreateConversationFormInline
              agents={agents}
              onSubmit={handleCreateConversation}
              onCancel={() => setShowCreateConversationForm(false)}
            />
          )}

          {conversations.map(conversation => {
            const isSelected = selectedConversation?.id === conversation.id;
            return (
              <div
                key={conversation.id}
                className="conversation-item"
                style={{
                  padding: '0.5rem',
                  marginBottom: '0.25rem',
                  background: isSelected ? 'var(--theme-button-background)' : 'transparent',
                  border: '1px solid var(--theme-border)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.15s ease',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  const deleteBtn = e.currentTarget.querySelector('.delete-conversation-btn') as HTMLElement;
                  if (deleteBtn) deleteBtn.style.opacity = '1';
                }}
                onMouseLeave={(e) => {
                  const deleteBtn = e.currentTarget.querySelector('.delete-conversation-btn') as HTMLElement;
                  if (deleteBtn) deleteBtn.style.opacity = '0';
                }}
              >
                <div
                  onClick={() => handleSelectConversation(conversation)}
                  style={{ 
                    flex: 1, 
                    minWidth: 0, 
                    overflow: 'hidden',
                    fontWeight: isSelected ? 'bold' : 'normal',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {conversation.name}
                  </span>
                  <span style={{ 
                    fontSize: '9px', 
                    opacity: 0.6,
                    flexShrink: 0
                  }}>
                    {conversation.participants.length} agent{conversation.participants.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <button
                  className="delete-conversation-btn"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (confirm(`Delete conversation "${conversation.name}"?`)) {
                      try {
                        const response = await fetch(`/api/conversations/${conversation.id}`, {
                          method: 'DELETE'
                        });
                        if (!response.ok) {
                          throw new Error('Failed to delete conversation');
                        }
                        // Remove from local state
                        setConversations(prev => prev.filter(c => c.id !== conversation.id));
                        // If this was the selected conversation, clear selection
                        if (selectedConversation?.id === conversation.id) {
                          setSelectedConversation(null);
                        }
                      } catch (err) {
                        console.error('Failed to delete conversation:', err);
                        alert('Failed to delete conversation');
                      }
                    }
                  }}
                  style={{
                    padding: '0.125rem 0.25rem',
                    border: '1px solid var(--theme-border)',
                    background: 'var(--theme-background-input)',
                    color: 'var(--theme-error, #ff4444)',
                    cursor: 'pointer',
                    fontSize: '9px',
                    fontFamily: 'var(--font-family-mono)',
                    opacity: 0,
                    transition: 'opacity 0.15s ease',
                    flexShrink: 0,
                    borderRadius: '2px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--theme-error, #ff4444)';
                    e.currentTarget.style.color = 'var(--theme-background)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--theme-background-input)';
                    e.currentTarget.style.color = 'var(--theme-error, #ff4444)';
                  }}
                  title="Delete conversation"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
          </>
        )}
        </div>
        {!isAgentSidebarCollapsed && (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              dragStartRef.current = {
                startX: e.clientX,
                startWidth: leftSidebarWidth,
                side: 'left'
              };
              setIsDragging(true);
            }}
            style={{
              width: '3px',
              flexShrink: 0,
              cursor: 'col-resize',
              background: isDragging && dragStartRef.current?.side === 'left' ? 'var(--theme-focused-foreground)' : 'var(--theme-border)',
              position: 'relative',
              userSelect: 'none',
              transition: isDragging ? 'none' : 'background 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (!isDragging || dragStartRef.current?.side !== 'left') {
                e.currentTarget.style.background = 'var(--theme-focused-foreground)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isDragging || dragStartRef.current?.side !== 'left') {
                e.currentTarget.style.background = 'var(--theme-border)';
              }
            }}
          />
        )}
      </div>

      {/* Main Content - Chat or Conversations */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0
      }}>
        {(selectedConversation || selectedAgent) ? (
          /* Single Agent Chat View */
          <>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
            <div className="chat-header" style={{ 
              padding: '0.25rem 0.5rem', 
              borderBottom: '1px solid var(--theme-border)', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              flexShrink: 0,
              background: 'var(--theme-background)',
              gap: '0.5rem',
              fontFamily: 'var(--font-family-mono)',
              fontSize: '9px',
              borderTop: '2px solid var(--theme-border)',
              borderLeft: '2px solid var(--theme-border)',
              borderRight: '2px solid var(--theme-border)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)'
            }}>
              {/* Terminal-style title */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem',
                opacity: 0.7,
                letterSpacing: '0.1em'
              }}>
                <span style={{ color: 'var(--theme-focused-foreground)' }}>┌─</span>
                <span style={{ textTransform: 'uppercase' }}>SYSTEM CONTROL</span>
                <span style={{ color: 'var(--theme-focused-foreground)' }}>─┐</span>
              </div>
              
              {/* Approve Next Turn button for conversations */}
              {selectedConversation?.state.waiting_for_approval && (
                <button
                  onClick={async () => {
                    try {
                      setLoading(true);
                      const response = await fetch(`/api/conversations/${selectedConversation.id}/approve`, {
                        method: 'POST'
                      });
                      if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Failed to approve turn');
                      }
                      await response.json();
                      // Reload conversation messages
                      await loadConversationMessages();
                    } catch (err) {
                      console.error('Failed to approve turn:', err);
                      alert(err instanceof Error ? err.message : 'Failed to approve turn');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  style={{ 
                    fontSize: '9px', 
                    padding: '0.125rem 0.375rem', 
                    height: '20px',
                    border: '1px solid var(--theme-border)',
                    background: 'var(--theme-focused-foreground)',
                    color: 'var(--theme-background)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-family-mono)',
                    textTransform: 'uppercase',
                    borderRadius: '0'
                  }}
                >
                  APPROVE TURN
                </button>
              )}

              {/* Clear Messages button for single-agent chats */}
              {selectedAgent && selectedAgent.has_letta && !selectedConversation && (
                <button
                  onClick={async () => {
                    if (confirm(`Clear all messages for ${selectedAgent.agent_name}? This cannot be undone.`)) {
                      try {
                        setLoading(true);
                        const response = await fetch(`/api/agents/${encodeURIComponent(selectedAgent.agent_id)}/messages/clear`, {
                          method: 'POST'
                        });
                        if (!response.ok) {
                          const errorData = await response.json();
                          throw new Error(errorData.error || 'Failed to clear messages');
                        }
                        // Reload messages to show empty state
                        await loadMessages();
                      } catch (err) {
                        console.error('Failed to clear messages:', err);
                        alert(err instanceof Error ? err.message : 'Failed to clear messages');
                      } finally {
                        setLoading(false);
                      }
                    }
                  }}
                  style={{ 
                    fontSize: '9px', 
                    padding: '0.125rem 0.375rem', 
                    height: '20px',
                    border: '1px solid var(--theme-border)',
                    background: 'var(--theme-background-input)',
                    color: 'var(--theme-error, #ff4444)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-family-mono)',
                    textTransform: 'uppercase',
                    borderRadius: '0'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--theme-error, #ff4444)';
                    e.currentTarget.style.color = 'var(--theme-background)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--theme-background-input)';
                    e.currentTarget.style.color = 'var(--theme-error, #ff4444)';
                  }}
                  title="Clear all messages"
                >
                  CLEAR MSGS
                </button>
              )}

              {/* Control Panel */}
              <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                {/* Font Size Controls */}
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--theme-border)', background: 'var(--theme-background-input)', borderRadius: '0' }}>
                  <button
                    onClick={() => {
                      const sizes = ['12px', '14px', '16px'];
                      const currentIndex = sizes.indexOf(fontSize);
                      if (currentIndex > 0) setFontSize(sizes[currentIndex - 1]);
                    }}
                    style={{ 
                      padding: '0.125rem 0.375rem', 
                      border: 'none', 
                      borderRight: '1px solid var(--theme-border)', 
                      background: 'transparent', 
                      color: 'var(--theme-text)', 
                      cursor: 'pointer', 
                      opacity: fontSize === '12px' ? 0.5 : 1,
                      fontSize: '9px',
                      fontFamily: 'var(--font-family-mono)',
                      lineHeight: '1'
                    }}
                    disabled={fontSize === '12px'}
                    title="Decrease font size"
                  >-</button>
                  <span style={{ padding: '0.125rem 0.375rem', fontSize: '9px', minWidth: '1.5ch', textAlign: 'center', opacity: 0.7 }}>A</span>
                  <button
                    onClick={() => {
                      const sizes = ['12px', '14px', '16px'];
                      const currentIndex = sizes.indexOf(fontSize);
                      if (currentIndex < sizes.length - 1) setFontSize(sizes[currentIndex + 1]);
                    }}
                    style={{ 
                      padding: '0.125rem 0.375rem', 
                      border: 'none', 
                      borderLeft: '1px solid var(--theme-border)', 
                      background: 'transparent', 
                      color: 'var(--theme-text)', 
                      cursor: 'pointer', 
                      opacity: fontSize === '16px' ? 0.5 : 1,
                      fontSize: '9px',
                      fontFamily: 'var(--font-family-mono)',
                      lineHeight: '1'
                    }}
                    disabled={fontSize === '16px'}
                    title="Increase font size"
                  >+</button>
                </div>

                <span style={{ opacity: 0.3, margin: '0 0.125rem' }}>│</span>

                <select
                  value={tint}
                  onChange={(e) => setTint(e.target.value)}
                  style={{
                    padding: '0.125rem 0.375rem',
                    border: '1px solid var(--theme-border)',
                    background: 'var(--theme-background-input)',
                    color: 'var(--theme-text)',
                    cursor: 'pointer',
                    fontSize: '9px',
                    height: '20px',
                    fontFamily: 'var(--font-family-mono)',
                    textTransform: 'uppercase',
                    borderRadius: '0'
                  }}
                  title="Select color tint"
                >
                  <option value="green">Green</option>
                  <option value="blue">Blue</option>
                  <option value="red">Red</option>
                  <option value="yellow">Yellow</option>
                  <option value="purple">Purple</option>
                  <option value="orange">Orange</option>
                  <option value="pink">Pink</option>
                  <option value="amber">Amber</option>
                </select>
                
                <span style={{ opacity: 0.3, margin: '0 0.125rem' }}>│</span>
                
                <button
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  style={{
                    padding: '0.125rem 0.375rem',
                    border: '1px solid var(--theme-border)',
                    background: 'var(--theme-background-input)',
                    color: 'var(--theme-text)',
                    cursor: 'pointer',
                    fontSize: '9px',
                    height: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    fontFamily: 'var(--font-family-mono)',
                    textTransform: 'uppercase',
                    borderRadius: '0'
                  }}
                  title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                >
                  {theme === 'dark' ? '☀' : '🌙'}
                </button>
                
                <span style={{ opacity: 0.3, margin: '0 0.125rem' }}>│</span>
                
                <button
                  onClick={() => setCrtMode(!crtMode)}
                  style={{
                    padding: '0.125rem 0.375rem',
                    border: '1px solid var(--theme-border)',
                    background: crtMode ? 'var(--theme-focused-foreground)' : 'var(--theme-background-input)',
                    color: crtMode ? 'var(--theme-background)' : 'var(--theme-text)',
                    cursor: 'pointer',
                    fontSize: '9px',
                    height: '20px',
                    fontFamily: 'var(--font-family-mono)',
                    textTransform: 'uppercase',
                    borderRadius: '0',
                    fontWeight: crtMode ? 'bold' : 'normal'
                  }}
                  title="Toggle CRT scanline effect"
                >
                  CRT
                </button>
                
                <button
                  onClick={() => setMatrixBg(!matrixBg)}
                  style={{
                    padding: '0.125rem 0.375rem',
                    border: '1px solid var(--theme-border)',
                    background: matrixBg ? 'var(--theme-focused-foreground)' : 'var(--theme-background-input)',
                    color: matrixBg ? 'var(--theme-background)' : 'var(--theme-text)',
                    cursor: 'pointer',
                    fontSize: '9px',
                    height: '20px',
                    fontFamily: 'var(--font-family-mono)',
                    textTransform: 'uppercase',
                    borderRadius: '0',
                    fontWeight: matrixBg ? 'bold' : 'normal'
                  }}
                  title="Toggle Matrix background effect"
                >
                  MATRIX
                </button>
              </div>
            </div>

        <div 
          ref={messagesContainerRef}
          style={{ flex: 1, overflowY: 'auto', padding: '1rem', position: 'relative' }}
        >
          {messages.length === 0 && (
            <div style={{ opacity: 0.5, fontSize: '12px', textAlign: 'center', marginTop: '2rem' }}>
              No messages yet. Start a conversation!
            </div>
          )}
          {messages.map(msg => {
            // Helper function to render message content
            const isStreamingThisMessage = isStreaming && streamingMessageId === msg.id;
            
            const renderMessageContent = () => {
              if (!msg.content) {
                return <div>No content</div>;
              }
              
              if (typeof msg.content === 'string') {
                return (
                  <div style={{ 
                    lineHeight: '1.5',
                    '& p': { margin: '0.5rem 0' },
                    '& code': { 
                      background: 'var(--theme-background-input)', 
                      padding: '0.125rem 0.25rem',
                      borderRadius: '2px',
                      fontSize: '11px',
                      fontFamily: 'monospace'
                    },
                    '& pre': {
                      background: 'var(--theme-background-input)',
                      padding: '0.5rem',
                      borderRadius: '4px',
                      overflow: 'auto',
                      fontSize: '11px',
                      border: '1px solid var(--theme-border)',
                      margin: '0.5rem 0'
                    },
                    '& pre code': {
                      background: 'transparent',
                      padding: 0
                    },
                    '& a': {
                      color: 'var(--theme-focused-foreground)',
                      textDecoration: 'underline'
                    },
                    '& ul, & ol': {
                      margin: '0.5rem 0',
                      paddingLeft: '1.5rem'
                    },
                    '& li': {
                      margin: '0.25rem 0'
                    }
                  } as React.CSSProperties}>
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                    {isStreamingThisMessage && (
                      <span 
                        className="streaming-cursor"
                        style={{ 
                          display: 'inline-block',
                          animation: 'blink 0.7s step-end infinite',
                          color: 'var(--theme-focused-foreground)',
                          marginLeft: '2px'
                        }}
                      >▌</span>
                    )}
                  </div>
                );
              } else {
                return (
                  <div>
                    {msg.content.map((item, idx) => (
                      <div key={idx} style={{ marginBottom: '0.5rem' }}>
                        {item.type === 'text' && item.text && (
                          <div style={{ 
                            lineHeight: '1.5',
                            '& p': { margin: '0.5rem 0' },
                            '& code': { 
                              background: 'var(--theme-background-input)', 
                              padding: '0.125rem 0.25rem',
                              borderRadius: '2px',
                              fontSize: '11px',
                              fontFamily: 'monospace'
                            },
                            '& pre': {
                              background: 'var(--theme-background-input)',
                              padding: '0.5rem',
                              borderRadius: '4px',
                              overflow: 'auto',
                              fontSize: '11px',
                              border: '1px solid var(--theme-border)',
                              margin: '0.5rem 0'
                            },
                            '& pre code': {
                              background: 'transparent',
                              padding: 0
                            },
                            '& a': {
                              color: 'var(--theme-focused-foreground)',
                              textDecoration: 'underline'
                            },
                            '& ul, & ol': {
                              margin: '0.5rem 0',
                              paddingLeft: '1.5rem'
                            },
                            '& li': {
                              margin: '0.25rem 0'
                            }
                          } as React.CSSProperties}>
                            <ReactMarkdown>{item.text}</ReactMarkdown>
                          </div>
                        )}
                        {item.type === 'image' && (
                          <div>
                            {item.imageUrl ? (
                              <img 
                                src={item.imageUrl} 
                                alt="Message image" 
                                onClick={() => setLightboxImage(item.imageUrl!)}
                                style={{ 
                                  maxWidth: '100%', 
                                  maxHeight: '400px', 
                                  borderRadius: '4px',
                                  border: '1px solid var(--theme-border)',
                                  cursor: 'pointer'
                                }} 
                              />
                            ) : item.imageData ? (
                              <img 
                                src={`data:${item.imageMimeType || 'image/jpeg'};base64,${item.imageData}`} 
                                alt="Message image" 
                                onClick={() => setLightboxImage(`data:${item.imageMimeType || 'image/jpeg'};base64,${item.imageData}`)}
                                style={{ 
                                  maxWidth: '100%', 
                                  maxHeight: '400px', 
                                  borderRadius: '4px',
                                  border: '1px solid var(--theme-border)',
                                  cursor: 'pointer'
                                }} 
                              />
                            ) : null}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              }
            };

            // Calculate animation delay based on message index (for staggered effect on new messages)
            const msgIndex = messages.indexOf(msg);
            const isRecentMessage = msgIndex >= messages.length - 5; // Only animate last 5 messages
            
            return (
              <div 
                key={msg.id} 
                className="message-item"
                style={{ 
                  marginBottom: '1rem',
                  animation: isRecentMessage ? `fadeIn 0.3s ease-out ${(msgIndex % 5) * 0.05}s both` : 'none'
                }}
              >
                {/* Metadata header */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  marginBottom: '0.5rem',
                  fontSize: '11px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Badge style={{ 
                      textTransform: 'uppercase',
                      fontSize: '9px',
                      letterSpacing: '0.05em',
                      background: msg.role === 'user' ? 'var(--theme-focused-foreground)' : 'var(--theme-background-modal)',
                      color: msg.role === 'user' ? 'var(--theme-background)' : 'var(--theme-text)',
                      padding: '2px 6px'
                    }}>
                      {msg.role === 'user' ? 'YOU' : msg.role === 'tool' ? 'TOOL' : (() => {
                        // For conversation messages, prefer agent_name from message, then look up by agent_id
                        if ((msg as any).agent_name) {
                          return (msg as any).agent_name.toUpperCase();
                        }
                        if (msg.agent_id) {
                          const agent = agents.find(a => a.agent_id === msg.agent_id);
                          return (agent?.agent_name || msg.agent_id).toUpperCase();
                        }
                        // For single-agent chats, show selected agent name
                        return (selectedAgent?.agent_name || 'AGENT').toUpperCase();
                      })()}
                    </Badge>
                    {isStreamingThisMessage && (
                      <Badge style={{
                        fontSize: '8px',
                        letterSpacing: '0.05em',
                        background: 'var(--theme-focused-foreground)',
                        color: 'var(--theme-background)',
                        padding: '2px 6px',
                        animation: 'pulse 1.5s ease-in-out infinite'
                      }}>
                        STREAMING
                      </Badge>
                    )}
                  </div>
                  <span style={{ fontSize: '10px', opacity: 0.6 }}>
                    {formatTimestamp(msg.created_at)}
                  </span>
                </div>

                {/* Tool Calls - show before content for tool-only messages */}
                {msg.role === 'tool' && msg.tool_calls && msg.tool_calls.length > 0 && (
                <div style={{ marginBottom: '0.5rem' }}>
                  {msg.tool_calls.map((toolCall) => {
                    const isExpanded = expandedToolCalls.has(toolCall.id);
                    const isExecuting = toolCall.status === 'executing';
                    const isExecuted = toolCall.status === 'executed';
                    const isError = toolCall.status === 'error';
                    
                    return (
                      <div
                        key={toolCall.id}
                        className="tool-call-item"
                        style={{
                          marginBottom: '0.5rem',
                          border: '1px solid var(--theme-border)',
                          background: 'var(--theme-background-input)',
                          fontSize: '11px',
                          overflow: 'hidden',
                          transition: 'border-color 0.2s ease'
                        }}
                      >
                        <div
                          onClick={() => {
                            const newExpanded = new Set(expandedToolCalls);
                            if (isExpanded) {
                              newExpanded.delete(toolCall.id);
                            } else {
                              newExpanded.add(toolCall.id);
                            }
                            setExpandedToolCalls(newExpanded);
                          }}
                          style={{
                            padding: '0.5rem 0.75rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            userSelect: 'none',
                            transition: 'background 0.15s ease'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--theme-background-modal)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{ width: '1.5ch', display: 'inline-flex', justifyContent: 'center' }}>
                            {isExecuting ? (
                              <BlockLoader mode={1} />
                            ) : isExecuted ? (
                              <span style={{ color: 'var(--theme-focused-foreground)' }}>✓</span>
                            ) : (
                              <span style={{ color: 'var(--theme-error, #ff4444)' }}>✗</span>
                            )}
                          </span>
                          <span style={{ opacity: 0.7, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {isExecuting ? 'RUNNING' : isError ? 'FAILED' : 'DONE'}
                          </span>
                          <Badge>{toolCall.name}</Badge>
                          {toolCall.duration && (
                            <span style={{ opacity: 0.6, marginLeft: 'auto', fontFamily: 'var(--font-family-mono)', fontSize: '10px' }}>
                              {toolCall.duration.toFixed(2)}s
                            </span>
                          )}
                          <span style={{ 
                            opacity: 0.6, 
                            fontSize: '10px', 
                            transition: 'transform 0.2s ease', 
                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' 
                          }}>
                            ▶
                          </span>
                        </div>
                        {isExecuting && (
                          <div style={{ padding: '0 0.75rem 0.5rem' }}>
                            <BarProgress intervalRate={100} fillChar="▓" />
                          </div>
                        )}
                        
                        {isExpanded && (
                          <div style={{ 
                            padding: '0.75rem', 
                            borderTop: '1px solid var(--theme-border)',
                            animation: 'slideDown 0.2s ease-out'
                          }}>
                            {isError && (
                              <AlertBanner style={{ marginBottom: '0.75rem', padding: '0.5rem', fontSize: '10px' }}>
                                Tool execution failed
                              </AlertBanner>
                            )}
                            {toolCall.arguments && (
                              <div style={{ marginBottom: '0.75rem' }}>
                                <div style={{ 
                                  opacity: 0.7, 
                                  marginBottom: '0.25rem', 
                                  fontSize: '10px',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em'
                                }}>
                                  Input
                                </div>
                                <pre style={{
                                  background: 'var(--theme-background)',
                                  padding: '0.75rem',
                                  fontSize: '11px',
                                  fontFamily: 'var(--font-family-mono)',
                                  overflow: 'auto',
                                  maxHeight: '200px',
                                  border: '1px solid var(--theme-border)',
                                  borderRadius: '4px',
                                  margin: 0,
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                  lineHeight: '1.5',
                                  color: 'var(--theme-text)'
                                }}>
                                  {(() => {
                                    if (typeof toolCall.arguments === 'string') {
                                      // Try to parse as JSON first
                                      try {
                                        const parsed = JSON.parse(toolCall.arguments);
                                        // If parsed result is still a string, return it (JSON.parse handles escapes)
                                        if (typeof parsed === 'string') {
                                          return parsed;
                                        }
                                        return JSON.stringify(parsed, null, 2);
                                      } catch {
                                        // If not JSON, the string might contain literal escape sequences
                                        // Replace literal backslash-n, backslash-t, backslash-r with actual characters
                                        // Use a regex that matches backslash followed by the escape character
                                        return toolCall.arguments
                                          .replace(/\\([ntr])/g, (match, char) => {
                                            const escapes: Record<string, string> = { n: '\n', t: '\t', r: '\r' };
                                            return escapes[char] || match;
                                          });
                                      }
                                    } else {
                                      // Already an object, stringify it
                                      return JSON.stringify(toolCall.arguments, null, 2);
                                    }
                                  })()}
                                </pre>
                              </div>
                            )}
                            {toolCall.result && (
                              <div>
                                <div style={{ 
                                  opacity: 0.7, 
                                  marginBottom: '0.25rem', 
                                  fontSize: '10px',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em'
                                }}>
                                  Output
                                </div>
                                <pre style={{
                                  background: 'var(--theme-background)',
                                  padding: '0.5rem',
                                  fontSize: '10px',
                                  overflow: 'auto',
                                  maxHeight: '200px',
                                  border: '1px solid var(--theme-border)',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                  margin: 0
                                }}>
                                  {typeof toolCall.result === 'string' 
                                    ? toolCall.result 
                                    : JSON.stringify(toolCall.result, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

                {/* Render message content with Sacred Message components */}
                {/* Swapped: MessageViewer for user (left, brighter), Message for agent (right, darker) */}
                {/* Skip content rendering for tool messages that only have tool_calls and no text content */}
                {!(msg.role === 'tool' && msg.tool_calls && msg.tool_calls.length > 0 && !msg.content) && (
                  msg.role === 'user' ? (
                    <MessageViewer>
                      {renderMessageContent()}
                    </MessageViewer>
                  ) : (
                    <Message>
                      {renderMessageContent()}
                    </Message>
                  )
                )}

                {/* Tool Calls attached to assistant messages */}
                {msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                  {msg.tool_calls.map((toolCall) => {
                    const isExpanded = expandedToolCalls.has(toolCall.id);
                    const isExecuting = toolCall.status === 'executing';
                    const isExecuted = toolCall.status === 'executed';
                    const isError = toolCall.status === 'error';
                    
                    return (
                      <div
                        key={toolCall.id}
                        className="tool-call-item"
                        style={{
                          marginBottom: '0.5rem',
                          border: '1px solid var(--theme-border)',
                          background: 'var(--theme-background-input)',
                          fontSize: '11px',
                          overflow: 'hidden',
                          transition: 'border-color 0.2s ease'
                        }}
                      >
                        <div
                          onClick={() => {
                            const newExpanded = new Set(expandedToolCalls);
                            if (isExpanded) {
                              newExpanded.delete(toolCall.id);
                            } else {
                              newExpanded.add(toolCall.id);
                            }
                            setExpandedToolCalls(newExpanded);
                          }}
                          style={{
                            padding: '0.5rem 0.75rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            userSelect: 'none',
                            transition: 'background 0.15s ease'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--theme-background-modal)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{ width: '1.5ch', display: 'inline-flex', justifyContent: 'center' }}>
                            {isExecuting ? (
                              <BlockLoader mode={1} />
                            ) : isExecuted ? (
                              <span style={{ color: 'var(--theme-focused-foreground)' }}>✓</span>
                            ) : (
                              <span style={{ color: 'var(--theme-error, #ff4444)' }}>✗</span>
                            )}
                          </span>
                          <span style={{ opacity: 0.7, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {isExecuting ? 'RUNNING' : isError ? 'FAILED' : 'DONE'}
                          </span>
                          <Badge>{toolCall.name}</Badge>
                          {toolCall.duration && (
                            <span style={{ opacity: 0.6, marginLeft: 'auto', fontFamily: 'var(--font-family-mono)', fontSize: '10px' }}>
                              {toolCall.duration.toFixed(2)}s
                            </span>
                          )}
                          <span style={{ 
                            opacity: 0.6, 
                            fontSize: '10px', 
                            transition: 'transform 0.2s ease', 
                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' 
                          }}>
                            ▶
                          </span>
                        </div>
                        {isExecuting && (
                          <div style={{ padding: '0 0.75rem 0.5rem' }}>
                            <BarProgress intervalRate={100} fillChar="▓" />
                          </div>
                        )}
                        
                        {isExpanded && (
                          <div style={{ 
                            padding: '0.75rem', 
                            borderTop: '1px solid var(--theme-border)',
                            animation: 'slideDown 0.2s ease-out'
                          }}>
                            {isError && (
                              <AlertBanner style={{ marginBottom: '0.75rem', padding: '0.5rem', fontSize: '10px' }}>
                                Tool execution failed
                              </AlertBanner>
                            )}
                            {toolCall.arguments && (
                              <div style={{ marginBottom: '0.75rem' }}>
                                <div style={{ 
                                  opacity: 0.7, 
                                  marginBottom: '0.25rem', 
                                  fontSize: '10px',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em'
                                }}>
                                  Input
                                </div>
                                <pre style={{
                                  background: 'var(--theme-background)',
                                  padding: '0.75rem',
                                  fontSize: '11px',
                                  fontFamily: 'var(--font-family-mono)',
                                  overflow: 'auto',
                                  maxHeight: '200px',
                                  border: '1px solid var(--theme-border)',
                                  borderRadius: '4px',
                                  margin: 0,
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                  lineHeight: '1.5',
                                  color: 'var(--theme-text)'
                                }}>
                                  {(() => {
                                    if (typeof toolCall.arguments === 'string') {
                                      // Try to parse as JSON first
                                      try {
                                        const parsed = JSON.parse(toolCall.arguments);
                                        // If parsed result is still a string, return it (JSON.parse handles escapes)
                                        if (typeof parsed === 'string') {
                                          return parsed;
                                        }
                                        return JSON.stringify(parsed, null, 2);
                                      } catch {
                                        // If not JSON, the string might contain literal escape sequences
                                        // Replace literal backslash-n, backslash-t, backslash-r with actual characters
                                        // Use a regex that matches backslash followed by the escape character
                                        return toolCall.arguments
                                          .replace(/\\([ntr])/g, (match, char) => {
                                            const escapes: Record<string, string> = { n: '\n', t: '\t', r: '\r' };
                                            return escapes[char] || match;
                                          });
                                      }
                                    } else {
                                      // Already an object, stringify it
                                      return JSON.stringify(toolCall.arguments, null, 2);
                                    }
                                  })()}
                                </pre>
                              </div>
                            )}
                            {toolCall.result && (
                              <div>
                                <div style={{ 
                                  opacity: 0.7, 
                                  marginBottom: '0.25rem', 
                                  fontSize: '10px',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em'
                                }}>
                                  Output
                                </div>
                                <pre style={{
                                  background: 'var(--theme-background)',
                                  padding: '0.5rem',
                                  fontSize: '10px',
                                  overflow: 'auto',
                                  maxHeight: '200px',
                                  border: '1px solid var(--theme-border)',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                  margin: 0
                                }}>
                                  {typeof toolCall.result === 'string' 
                                    ? toolCall.result 
                                    : JSON.stringify(toolCall.result, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })}
          
          {/* Typing Indicator */}
          {loading && (
            <div style={{
              marginBottom: '1rem',
              fontSize: '12px',
              padding: '0.75rem 1rem',
              border: '1px solid var(--theme-border)',
              background: 'var(--theme-background-modal)',
              animation: 'fadeIn 0.3s ease-out'
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.75rem',
                marginBottom: '0.5rem'
              }}>
                <BlockLoader mode={1} />
                <span style={{ 
                  fontSize: '11px', 
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  {(selectedAgent?.agent_name || 'AGENT').toUpperCase()} is processing
                </span>
              </div>
              <div style={{ opacity: 0.6 }}>
                <BarProgress intervalRate={150} fillChar="█" />
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
          
          {/* Scroll to bottom button */}
          {isScrolledUp && (
            <button
              onClick={() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{
                position: 'absolute',
                bottom: '1rem',
                right: '1rem',
                padding: '0.5rem',
                border: '1px solid var(--theme-border)',
                background: 'var(--theme-background-modal)',
                color: 'var(--theme-text)',
                cursor: 'pointer',
                fontSize: '12px',
                zIndex: 10,
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                minWidth: '44px',
                minHeight: '44px'
              }}
            >
              ↓
            </button>
          )}
        </div>

        <form 
          onSubmit={sendMessage} 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            flexShrink: 0, 
            padding: '0.75rem 1rem', 
            borderTop: isDraggingOver ? '2px dashed var(--theme-focused-foreground)' : '1px solid var(--theme-border)',
            background: isDraggingOver ? 'var(--theme-focused-foreground-subdued)' : 'transparent',
            transition: 'all 0.2s ease'
          }}
        >
          {/* Image Previews */}
          {imagePreviews.length > 0 && (
            <div style={{ 
              display: 'flex', 
              gap: '0.5rem', 
              marginBottom: '0.5rem', 
              flexWrap: 'wrap',
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              {imagePreviews.map((preview, idx) => (
                <div key={idx} style={{ position: 'relative', display: 'inline-block' }}>
                  <img 
                    src={preview} 
                    alt={`Preview ${idx + 1}`}
                    style={{ 
                      width: '60px', 
                      height: '60px', 
                      objectFit: 'cover',
                      border: '1px solid var(--theme-border)'
                    }} 
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      width: '16px',
                      height: '16px',
                      background: 'var(--theme-error, #ff4444)',
                      color: 'var(--theme-background)',
                      border: '1px solid var(--theme-border)',
                      cursor: 'pointer',
                      fontSize: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      fontFamily: 'var(--font-family-mono)',
                      fontWeight: 'bold'
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Drag indicator */}
          {isDraggingOver && (
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--theme-focused-foreground-subdued)',
              border: '2px dashed var(--theme-focused-foreground)',
              zIndex: 10,
              pointerEvents: 'none'
            }}>
              <div style={{ 
                fontSize: '12px', 
                fontWeight: 'bold',
                color: 'var(--theme-focused-foreground)',
                fontFamily: 'var(--font-family-mono)'
              }}>
                [DROP FILES]
              </div>
            </div>
          )}
          
          {/* Terminal-style input */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'stretch', 
            gap: '0.5rem', 
            width: '100%',
            fontFamily: 'var(--font-family-mono)',
            fontSize: '12px',
            lineHeight: '1.5'
          }}>
            {/* Terminal prompt - aligned with textarea first line */}
            <div style={{ 
              flexShrink: 0,
              paddingTop: '0.5rem',
              lineHeight: '1.5',
              fontSize: '12px',
              fontFamily: 'var(--font-family-mono)',
              display: 'flex',
              alignItems: 'baseline',
              height: 'calc(1.5em + 0.5rem)'
            }}>
              <span style={{ 
                color: isInputFocused ? 'var(--theme-focused-foreground)' : 'var(--theme-border)',
                lineHeight: '1.5',
                fontSize: '12px',
                fontFamily: 'var(--font-family-mono)',
                userSelect: 'none',
                transition: 'color 0.2s ease',
                opacity: isInputFocused ? 1 : 0.6,
                display: 'inline-block',
                verticalAlign: 'baseline',
                transform: 'translateY(0.05em)'
              }}>
                {'>'}
              </span>
            </div>
            
              {/* Input area */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                <style>{`
                  .terminal-textarea,
                  .terminal-textarea * {
                    outline: none !important;
                    box-shadow: none !important;
                  }
                  .terminal-textarea {
                    cursor: ${isInputFocused ? 'text' : 'pointer'} !important;
                    width: 100%;
                    min-height: 1.5rem;
                  }
                  .terminal-textarea > div {
                    outline: none !important;
                    border: none !important;
                    box-shadow: none !important;
                    cursor: ${isInputFocused ? 'text' : 'pointer'} !important;
                    width: 100%;
                  }
                  .terminal-textarea > div:focus,
                  .terminal-textarea > div:focus-within,
                  .terminal-textarea > div:focus-visible,
                  .terminal-textarea > div:active {
                    outline: none !important;
                    border: none !important;
                    box-shadow: none !important;
                  }
                  .terminal-textarea .displayed {
                    background: transparent !important;
                    box-shadow: none !important;
                    padding: 0.5rem 0 !important;
                    font-family: var(--font-family-mono) !important;
                    font-size: 12px !important;
                    line-height: 1.5 !important;
                    color: var(--theme-text) !important;
                    min-height: 1.5rem !important;
                    display: inline-block;
                    vertical-align: baseline;
                  }
                  .terminal-textarea .hiddenElement,
                  .terminal-textarea textarea {
                    font-family: var(--font-family-mono) !important;
                    font-size: 12px !important;
                    line-height: 1.5 !important;
                    outline: none !important;
                    border: none !important;
                    box-shadow: none !important;
                    cursor: ${isInputFocused ? 'text' : 'pointer'} !important;
                    width: 100% !important;
                    min-height: 1.5rem !important;
                  }
                  .terminal-textarea .hiddenElement:focus,
                  .terminal-textarea textarea:focus {
                    outline: none !important;
                    border: none !important;
                    box-shadow: none !important;
                    cursor: text !important;
                  }
                  .terminal-textarea.focused,
                  .terminal-textarea.focused textarea,
                  .terminal-textarea.focused .hiddenElement,
                  .terminal-textarea.focused > div {
                    cursor: text !important;
                  }
                  .terminal-textarea:not(.focused) {
                    cursor: pointer !important;
                  }
                  .terminal-textarea:not(.focused) > div,
                  .terminal-textarea:not(.focused) textarea,
                  .terminal-textarea:not(.focused) .hiddenElement {
                    cursor: pointer !important;
                  }
                  .terminal-textarea .hiddenElement:focus-visible,
                  .terminal-textarea textarea:focus-visible,
                  .terminal-textarea .hiddenElement:active,
                  .terminal-textarea textarea:active {
                    outline: none !important;
                    border: none !important;
                    box-shadow: none !important;
                  }
                  .terminal-textarea .hiddenElement::selection,
                  .terminal-textarea textarea::selection {
                    background: var(--theme-focused-foreground-subdued) !important;
                    color: var(--theme-text) !important;
                  }
                  .terminal-textarea .hiddenElement::-moz-selection,
                  .terminal-textarea textarea::-moz-selection {
                    background: var(--theme-focused-foreground-subdued) !important;
                    color: var(--theme-text) !important;
                  }
                  @keyframes blink { 50% { opacity: 0; } }
                `}</style>
                <div 
                  ref={textareaWrapperRef}
                  className={`terminal-textarea ${isInputFocused ? 'focused' : ''}`}
                  style={{ position: 'relative' }}
                  onClick={() => {
                    // Ensure textarea gets focus when clicking anywhere in the wrapper
                    if (textareaWrapperRef.current) {
                      const textarea = textareaWrapperRef.current.querySelector('textarea');
                      if (textarea && !textarea.disabled) {
                        textarea.focus();
                      }
                    }
                  }}
                >
                  {loading && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'var(--theme-background)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      paddingTop: '0.5rem',
                      zIndex: 10,
                      color: 'var(--theme-focused-foreground)',
                      fontFamily: 'var(--font-family-mono)',
                      fontSize: '12px'
                    }}>
                      <span style={{ animation: 'blink 1s step-end infinite' }}>█</span>
                    </div>
                  )}
                  <TextArea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder=""
                    disabled={!selectedAgent && !selectedConversation}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    isBlink={true}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                  />
                </div>
              
              {/* Character count and controls */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                fontSize: '9px',
                opacity: 0.4,
                gap: '0.5rem',
                marginTop: '0.125rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {inputValue.length > 0 && (
                    <>
                      <span style={{ fontFamily: 'var(--font-family-mono)' }}>
                        {inputValue.length} chars
                      </span>
                      {inputValue.length > 500 && (
                        <BarProgress 
                          progress={Math.min((inputValue.length / 2000) * 100, 100)} 
                          fillChar={inputValue.length > 1500 ? '█' : '░'}
                        />
                      )}
                    </>
                  )}
                </div>
                
                {/* Terminal-style buttons - inline with text */}
                <div style={{ 
                  display: 'flex', 
                  gap: '0.5rem', 
                  alignItems: 'center',
                  fontFamily: 'var(--font-family-mono)',
                  fontSize: '9px'
                }}>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageSelect}
                    style={{ display: 'none' }}
                    id="image-upload"
                    disabled={loading || (!selectedAgent && !selectedConversation)}
                  />
                  <label
                    htmlFor="image-upload"
                    style={{
                      cursor: (loading || (!selectedAgent && !selectedConversation)) ? 'not-allowed' : 'pointer',
                      color: (loading || (!selectedAgent && !selectedConversation)) ? 'var(--theme-border)' : 'var(--theme-text)',
                      opacity: (loading || (!selectedAgent && !selectedConversation)) ? 0.2 : 0.5,
                      transition: 'opacity 0.15s ease',
                      userSelect: 'none',
                      textDecoration: 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (!loading && (selectedAgent || selectedConversation)) {
                        e.currentTarget.style.opacity = '0.8';
                        e.currentTarget.style.color = 'var(--theme-focused-foreground)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!loading && (selectedAgent || selectedConversation)) {
                        e.currentTarget.style.opacity = '0.5';
                        e.currentTarget.style.color = 'var(--theme-text)';
                      }
                    }}
                  >
                    img
                  </label>
                  
                  <button
                    type="submit"
                    disabled={loading || (!selectedAgent && !selectedConversation) || (!inputValue.trim() && selectedImages.length === 0) || (selectedConversation?.state.waiting_for_approval)}
                    style={{
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      color: (loading || !selectedAgent || (!inputValue.trim() && selectedImages.length === 0))
                        ? 'var(--theme-border)'
                        : 'var(--theme-focused-foreground)',
                      cursor: (loading || !selectedAgent || (!inputValue.trim() && selectedImages.length === 0)) 
                        ? 'not-allowed' 
                        : 'pointer',
                      fontSize: '9px',
                      fontFamily: 'var(--font-family-mono)',
                      opacity: (loading || !selectedAgent || (!inputValue.trim() && selectedImages.length === 0)) ? 0.2 : 0.7,
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.25rem',
                      minHeight: 'auto',
                      outline: 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (!loading && selectedAgent && (inputValue.trim() || selectedImages.length > 0)) {
                        e.currentTarget.style.opacity = '1';
                        e.currentTarget.style.color = 'var(--theme-focused-foreground)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!loading && selectedAgent && (inputValue.trim() || selectedImages.length > 0)) {
                        e.currentTarget.style.opacity = '0.7';
                      }
                    }}
                    onFocus={(e) => e.currentTarget.style.outline = 'none'}
                  >
                    {loading ? (
                      <>
                        <BlockLoader mode={1} />
                        <span>send</span>
                      </>
                    ) : (
                      'send'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>
        {/* Status Footer */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          padding: '0.25rem 0.5rem',
          background: 'var(--theme-background-modal-footer)',
          borderTop: '1px solid var(--theme-border)',
          fontSize: '9px',
          fontFamily: 'var(--font-family-mono)',
          color: 'var(--theme-text)',
          opacity: 0.8,
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--theme-focused-foreground)' }}></div>
              <span>ONLINE</span>
            </div>
            <span>
              {selectedConversation 
                ? `${selectedConversation.name} (${selectedConversation.participants.map(id => {
                    const agent = agents.find(a => a.agent_id === id);
                    return agent?.agent_name || id;
                  }).join(', ')})`
                : selectedAgent?.agent_name}
            </span>
            <span style={{ opacity: 0.5 }}>|</span>
            <div style={{ position: 'relative', display: 'inline-block' }} data-model-dropdown>
              {selectedAgent?.letta_model ? (
                <button
                  onClick={() => {
                    if (selectedAgent?.has_letta) {
                      setShowModelDropdown(!showModelDropdown);
                      setModelFilter('');
                      if (!showModelDropdown && availableModels.length === 0) {
                        loadAvailableModels();
                      }
                    }
                  }}
                  style={{
                    cursor: (selectedAgent?.has_letta && !selectedConversation) ? 'pointer' : 'default',
                    userSelect: 'none',
                    background: 'transparent',
                    border: '1px solid var(--theme-border)',
                    borderRadius: '2px',
                    padding: '0.125rem 0.375rem',
                    fontSize: '9px',
                    fontFamily: 'var(--font-family-mono)',
                    color: 'var(--theme-text)',
                    margin: 0,
                    lineHeight: '1.2'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedAgent?.has_letta) {
                      e.currentTarget.style.borderColor = 'var(--theme-focused-foreground)';
                      e.currentTarget.style.color = 'var(--theme-focused-foreground)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedAgent?.has_letta) {
                      e.currentTarget.style.borderColor = 'var(--theme-border)';
                      e.currentTarget.style.color = 'var(--theme-text)';
                    }
                  }}
                >
                  {selectedConversation ? 'N/A' : selectedAgent?.letta_model}
                </button>
              ) : (
                <span style={{ opacity: 0.5 }}>loading...</span>
              )}
              {showModelDropdown && selectedAgent?.has_letta && !selectedConversation && (
                <div
                  data-model-dropdown
                  style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '-0.5rem', // Align with the separator
                  marginBottom: '0.25rem',
                  background: 'var(--theme-background-modal)',
                  border: '1px solid var(--theme-border)',
                  borderRadius: '4px',
                  padding: '0.25rem',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  zIndex: 1000,
                  minWidth: '300px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                }}>
                  {/* Filter input */}
                  <input
                    type="text"
                    value={modelFilter}
                    onChange={(e) => setModelFilter(e.target.value)}
                    placeholder="Filter models..."
                    style={{
                      width: '100%',
                      padding: '0.25rem 0.5rem',
                      marginBottom: '0.25rem',
                      background: 'var(--theme-background-input)',
                      border: '1px solid var(--theme-border)',
                      borderRadius: '2px',
                      fontSize: '9px',
                      fontFamily: 'var(--font-family-mono)',
                      color: 'var(--theme-text)',
                      outline: 'none'
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setShowModelDropdown(false);
                        setModelFilter('');
                      }
                    }}
                    autoFocus
                  />
                  {/* Model list */}
                  {availableModels.length > 0 ? (
                    (() => {
                      const filteredModels = availableModels.filter(model =>
                        model.toLowerCase().includes(modelFilter.toLowerCase())
                      );
                      return filteredModels.length > 0 ? (
                        filteredModels.map((model) => (
                          <div
                            key={model}
                            onClick={() => updateAgentModel(model)}
                            style={{
                              padding: '0.25rem 0.5rem',
                              cursor: 'pointer',
                              fontSize: '9px',
                              fontFamily: 'var(--font-family-mono)',
                              background: model === selectedAgent?.letta_model ? 'var(--theme-focused-foreground)' : 'transparent',
                              color: model === selectedAgent?.letta_model ? 'var(--theme-background)' : 'var(--theme-text)',
                              borderRadius: '2px',
                              marginBottom: '0.125rem'
                            }}
                            onMouseEnter={(e) => {
                              if (model !== selectedAgent?.letta_model) {
                                e.currentTarget.style.background = 'var(--theme-background-input)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (model !== selectedAgent?.letta_model) {
                                e.currentTarget.style.background = 'transparent';
                              }
                            }}
                          >
                            {model}
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: '0.25rem 0.5rem', fontSize: '9px', opacity: 0.7 }}>
                          No models match "{modelFilter}"
                        </div>
                      );
                    })()
                  ) : (
                    <div style={{ padding: '0.25rem 0.5rem', fontSize: '9px', opacity: 0.7 }}>
                      Loading models...
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
             <span>MEM: {selectedConversation ? 'N/A' : memoryBlocks.reduce((acc, b) => acc + b.value.length, 0) + ' chars'}</span>
             <span style={{ opacity: 0.5 }}>|</span>
             <span>T+{new Date(sessionDuration * 1000).toISOString().substr(11, 8)}</span>
          </div>
        </div>
            </div>
          </>
        ) : (
          /* No Selection - Empty State */
          <div style={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center', 
            opacity: 0.5,
            padding: '2rem',
            textAlign: 'center'
          }}>
            <p style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>No agent or conversation selected</p>
            <p style={{ fontSize: '0.875rem', opacity: 0.7 }}>Select an agent from the sidebar to start a single-agent chat, or create a multi-agent conversation</p>
          </div>
        )}
      </div>


      {/* Right Sidebar - Memory (only for single agent mode) */}
      {selectedAgent && !selectedConversation && (
        <>
          {!isMemoryCollapsed && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                dragStartRef.current = {
                  startX: e.clientX,
                  startWidth: sidebarWidth,
                  side: 'right'
                };
                setIsDragging(true);
              }}
              style={{
                width: '3px',
                flexShrink: 0,
                cursor: 'col-resize',
                background: isDragging ? 'var(--theme-focused-foreground)' : 'var(--theme-border)',
                position: 'relative',
                userSelect: 'none',
                transition: isDragging ? 'none' : 'background 0.2s ease'
              }}
              onMouseEnter={(e) => {
                if (!isDragging) {
                  e.currentTarget.style.background = 'var(--theme-focused-foreground)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isDragging) {
                  e.currentTarget.style.background = 'var(--theme-border)';
                }
              }}
            />
          )}
          <div className="chat-right-sidebar" style={{
            width: isMemoryCollapsed ? '3ch' : `${sidebarWidth}ch`,
            flexShrink: 0,
            padding: isMemoryCollapsed ? '0' : '1rem',
            borderLeft: '1px solid var(--theme-border)',
            overflowY: isMemoryCollapsed ? 'hidden' : 'auto',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            transition: 'width 0.2s ease, padding 0.2s ease',
            position: 'relative'
          }}>
            {isMemoryCollapsed ? (
              <button
                onClick={() => setIsMemoryCollapsed(!isMemoryCollapsed)}
                style={{
                  width: '100%',
                  flex: 1,
                  minHeight: '200px',
                  padding: '0.5rem 0',
                  border: 'none',
                  borderLeft: '1px solid var(--theme-border)',
                  background: 'var(--theme-background-input)',
                  color: 'var(--theme-text)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                  transition: 'background 0.2s ease',
                  letterSpacing: '0.1em'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--theme-button-background)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--theme-background-input)';
                }}
                title="Expand memory sidebar"
              >
                MEMORY
              </button>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '14px', fontWeight: 'bold', margin: 0 }}>
                    CORE MEMORY
                  </h2>
                  <button
                    onClick={() => setIsMemoryCollapsed(!isMemoryCollapsed)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      border: '1px solid var(--theme-border)',
                      background: 'var(--theme-background-input)',
                      color: 'var(--theme-text)',
                      cursor: 'pointer',
                      fontSize: '11px',
                      minWidth: '44px',
                      minHeight: '22px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginLeft: '0.5rem',
                      transition: 'background 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--theme-button-background)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--theme-background-input)';
                    }}
                    title="Collapse memory sidebar"
                  >
                    ◀
                  </button>
                </div>
                {memoryBlocks.length === 0 && selectedAgent && (
                  <div style={{ opacity: 0.5, fontSize: '12px', textAlign: 'center', padding: '1rem' }}>
                    <BlockLoader mode={7} />
                    <div style={{ marginTop: '0.5rem' }}>No memory blocks available</div>
                  </div>
                )}
                {memoryBlocks.map((block, index) => {
                  const usagePercent = block.limit > 0 ? (block.value.length / block.limit) * 100 : 0;
                  const getCapacityColor = (percent: number) => {
                    if (percent >= 90) return 'var(--theme-error, #ff4444)';
                    if (percent >= 70) return 'var(--color-gold-30, #f1c21b)';
                    return 'var(--theme-focused-foreground)';
                  };
                  const capacityColor = getCapacityColor(usagePercent);
                  const isExpanded = expandedMemoryBlocks.has(block.id);
                  const isFlashing = flashingBlocks.has(block.id);
                  const diffParts = isFlashing ? getDiffParts(diffBaseValues.get(block.id) || '', block.value) : null;
                  
                  // Manual dismiss handler
                  const handleDismiss = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    const newFlashing = new Set(flashingBlocks);
                    const newLastUpdated = new Map(lastUpdatedBlocks);
                    const newDiffBaseValues = new Map(diffBaseValues);
                    
                    newFlashing.delete(block.id);
                    newLastUpdated.delete(block.id);
                    newDiffBaseValues.delete(block.id);
                    
                    setFlashingBlocks(newFlashing);
                    setLastUpdatedBlocks(newLastUpdated);
                    setDiffBaseValues(newDiffBaseValues);
                  };
                  
                  return (
                    <div key={block.id}>
                      {index > 0 && (
                        <div style={{ 
                          height: '1px', 
                          background: 'repeating-linear-gradient(90deg, var(--theme-border) 0, var(--theme-border) 2px, transparent 2px, transparent 4px)',
                          margin: '0.75rem 0',
                          opacity: 0.5
                        }} />
                      )}
                      <Card 
                        className={isFlashing ? 'memory-flash-active' : ''}
                        style={{ 
                          padding: '0.5rem',
                          transition: 'border-color 0.3s ease, box-shadow 0.3s ease'
                        }}
                      >
                        <div
                          onClick={() => {
                            const newExpanded = new Set(expandedMemoryBlocks);
                            if (isExpanded) {
                              newExpanded.delete(block.id);
                            } else {
                              newExpanded.add(block.id);
                            }
                            setExpandedMemoryBlocks(newExpanded);
                          }}
                          style={{
                            cursor: 'pointer',
                            userSelect: 'none'
                          }}
                        >
                          <div style={{ width: '100%' }}>
                            <div style={{ 
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              marginBottom: '0.25rem'
                            }}>
                              <span style={{ fontSize: '10px', opacity: 0.6 }}>
                                {isExpanded ? '▾' : '▸'}
                              </span>
                              <div style={{ 
                                fontWeight: 'bold', 
                                fontSize: '11px',
                                flex: 1,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                              }}>
                                {block.label}
                                {isFlashing && (
                                  <span 
                                    onClick={handleDismiss}
                                    style={{ 
                                      fontSize: '8px', 
                                      background: 'var(--theme-focused-foreground)',
                                      color: 'var(--theme-background)',
                                      padding: '1px 3px',
                                      borderRadius: '2px',
                                      cursor: 'pointer',
                                      animation: 'pulse 1s infinite',
                                      zIndex: 10
                                    }}
                                    title="Click to dismiss"
                                  >
                                    UPDATED
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.5rem',
                              fontSize: '9px'
                            }}>
                              <div style={{ flex: 1, opacity: 0.7 }}>
                                <BarProgress 
                                  progress={usagePercent} 
                                  fillChar={usagePercent >= 90 ? '█' : usagePercent >= 70 ? '▓' : '░'}
                                />
                              </div>
                              <span style={{ 
                                color: capacityColor,
                                fontFamily: 'var(--font-family-mono)',
                                whiteSpace: 'nowrap',
                                fontWeight: usagePercent >= 90 ? 'bold' : 'normal'
                              }}>
                                {Math.round(usagePercent)}%
                              </span>
                            </div>
                          </div>
                        </div>
                        {isExpanded && (
                          <div style={{ 
                            fontSize: '10px', 
                            lineHeight: '1.4', 
                            whiteSpace: 'pre-wrap', 
                            paddingTop: '0.5rem',
                            borderTop: '1px solid var(--theme-border)',
                            marginTop: '0.25rem',
                            maxHeight: '200px',
                            overflowY: 'auto'
                          }}>
                            <div style={{ 
                              fontSize: '8px', 
                              opacity: 0.5, 
                              marginBottom: '0.25rem',
                              fontFamily: 'var(--font-family-mono)'
                            }}>
                              {block.value.length} / {block.limit} chars
                            </div>
                            {isFlashing && diffParts ? (
                              <span>
                                <span style={{ opacity: 0.5 }}>{diffParts.prefix}</span>
                                <span className="memory-diff-highlight">{diffParts.changed}</span>
                                <span>{diffParts.suffix}</span>
                              </span>
                            ) : (
                              block.value || <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Empty</span>
                            )}
                          </div>
                        )}
                      </Card>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </>
      )}
      
      <style>{`
        @keyframes memoryFlash {
          0% { box-shadow: 0 0 0 0 var(--theme-focused-foreground); border-color: var(--theme-focused-foreground); }
          50% { box-shadow: 0 0 10px 0 var(--theme-focused-foreground); border-color: var(--theme-focused-foreground); }
          100% { box-shadow: 0 0 0 0 transparent; border-color: var(--theme-border); }
        }
        .memory-flash-active {
          animation: memoryFlash 2s infinite;
        }
        .memory-diff-highlight {
          background-color: var(--theme-focused-foreground-subdued);
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes typing {
          0%, 100% { opacity: 0; }
          50% { opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; max-height: 0; }
          to { opacity: 1; max-height: 500px; }
        }
        @keyframes glitch {
          0%, 100% { transform: translate(0); }
          20% { transform: translate(-2px, 2px); }
          40% { transform: translate(-2px, -2px); }
          60% { transform: translate(2px, 2px); }
          80% { transform: translate(2px, -2px); }
        }
        .tool-call-item:hover {
          border-color: var(--theme-focused-foreground) !important;
        }
        .agent-item:hover {
          border-color: var(--theme-focused-foreground) !important;
          background: var(--theme-background-modal) !important;
        }
        .conversation-item:hover {
          border-color: var(--theme-focused-foreground) !important;
          background: var(--theme-background-modal) !important;
        }
        .upload-button:hover:not([disabled]) {
          border-color: var(--theme-focused-foreground) !important;
          background: var(--theme-background-modal) !important;
        }
        .message-item {
          transition: opacity 0.2s ease;
        }
        
        /* CRT Scanline Effect */
        body.crt-mode .chat-main-layout::before {
          content: '';
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: repeating-linear-gradient(
            0deg,
            rgba(0, 0, 0, 0.15) 0px,
            rgba(0, 0, 0, 0.15) 1px,
            transparent 1px,
            transparent 2px
          );
          pointer-events: none;
          z-index: 9999;
          animation: scanlines 0.1s linear infinite;
        }
        
        body.crt-mode .chat-main-layout::after {
          content: '';
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.3) 100%);
          pointer-events: none;
          z-index: 9998;
        }
        
        @keyframes scanlines {
          0% { transform: translateY(0); }
          100% { transform: translateY(2px); }
        }
        
        body.crt-mode * {
          text-shadow: 0 0 2px currentColor;
        }
        @media (max-width: 768px) {
          .chat-main-layout {
            flex-direction: column !important;
            height: 100vh !important;
            overflow: hidden !important;
          }
          .chat-left-sidebar {
            width: 100% !important;
            max-height: 200px !important;
            overflow-y: auto !important;
            border-right: none !important;
            border-bottom: 1px solid var(--theme-border) !important;
            flex-shrink: 0 !important;
          }
          .chat-right-sidebar {
            width: 100% !important;
            max-height: 300px !important;
            overflow-y: auto !important;
            border-left: none !important;
            border-top: 1px solid var(--theme-border) !important;
            flex-shrink: 0 !important;
          }
          .chat-content-area {
            flex: 1 !important;
            min-height: 0 !important;
            overflow: hidden !important;
          }
          
          /* Multi-agent mobile layout */
          .multi-agent-view {
            flex-direction: column !important;
            height: 100% !important;
            overflow: hidden !important;
          }
          
          .multi-agent-conversation-list {
            width: 100% !important;
            max-height: 40vh !important;
            overflow-y: auto !important;
            border-right: none !important;
            border-bottom: 1px solid var(--theme-border) !important;
            flex-shrink: 0 !important;
          }
          
          .multi-agent-chat-area {
            flex: 1 !important;
            min-height: 0 !important;
            overflow: hidden !important;
          }
          
          .multi-agent-resize-handle {
            display: none !important;
          }
          
          /* Hide conversation list on mobile when conversation is selected */
          .multi-agent-view .multi-agent-chat-area ~ .multi-agent-conversation-list,
          .multi-agent-view:has(.multi-agent-chat-area) .multi-agent-conversation-list {
            display: none !important;
          }
          
          /* Show back button prominently on mobile */
          .multi-agent-chat .chat-header button[title="Back to conversations"] {
            font-size: 1rem !important;
            padding: 0.75rem 1rem !important;
            min-width: auto !important;
          }
          
          /* Ensure proper scrolling on mobile */
          .multi-agent-view {
            height: 100% !important;
            max-height: 100vh !important;
          }
          
          .conversation-list {
            height: 100% !important;
            max-height: 100% !important;
          }
          
          /* Left sidebar (agents) - horizontal scroll on mobile */
          .chat-main-layout > div:first-child {
            width: 100% !important;
            max-height: 120px !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            border-right: none !important;
            border-bottom: 1px solid var(--theme-border) !important;
            flex-shrink: 0 !important;
            padding: 0.75rem !important;
            display: flex !important;
            flex-direction: row !important;
            gap: 0.5rem !important;
            align-items: flex-start !important;
          }
          
          .chat-main-layout > div:first-child h2 {
            display: none !important;
          }
          
          .chat-main-layout > div:first-child > div {
            min-width: 80px !important;
            padding: 0.5rem !important;
            margin-bottom: 0 !important;
            font-size: 11px !important;
            white-space: nowrap !important;
          }
          
          /* Main content area */
          .chat-main-layout > div:nth-child(2) {
            flex: 1 !important;
            min-height: 0 !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
          }
          
          /* Right sidebar (memory) - hide on mobile */
          .chat-right-sidebar,
          .chat-resize-handle {
            display: none !important;
          }
          
          /* Messages container - ensure scrolling works */
          .messages-container,
          [class*="messages-container"],
          [ref*="messagesContainer"] {
            -webkit-overflow-scrolling: touch !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
          }
          
          /* Input forms - ensure they don't get cut off */
          .chat-input-form,
          [class*="chat-input-form"] {
            flex-shrink: 0 !important;
            padding: 0.75rem !important;
          }
          
          /* Headers - make them more compact */
          .chat-header,
          [class*="chat-header"] {
            padding: 0.75rem !important;
            flex-wrap: wrap !important;
          }
        }
        
        /* Portrait orientation specific */
        @media (max-width: 768px) and (orientation: portrait) {
          .chat-main-layout {
            height: 100vh !important;
            height: 100dvh !important;
          }
          
          /* Ensure touch scrolling works */
          * {
            -webkit-overflow-scrolling: touch;
          }
        }
      `}</style>
    </div>
    </>
  );
}

export default App;
