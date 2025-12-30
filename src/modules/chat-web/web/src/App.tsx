import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ChatPage from './pages/ChatPage';
import AdminApp from './admin/AdminApp';

// Re-export types for backward compatibility
export type { Agent, Message, MessageContent, ToolCall, MemoryBlock, Conversation, ConversationMessage } from './types';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<AdminApp />} />
        <Route path="/*" element={<ChatPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
