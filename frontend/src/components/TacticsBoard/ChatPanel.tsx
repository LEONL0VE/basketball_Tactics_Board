import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Drawer, Input, Button, Space, Typography, Avatar, Spin, 
  message, Tag, Tooltip, Collapse, Card, Empty
} from 'antd';
import { 
  SendOutlined, RobotOutlined, UserOutlined, 
  ClearOutlined, BulbOutlined, PlayCircleOutlined,
  ThunderboltOutlined, QuestionCircleOutlined,
  CloseOutlined, ExpandOutlined, CompressOutlined
} from '@ant-design/icons';
import { API_ENDPOINTS } from '../../config/api';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Panel } = Collapse;

// ============== Types ==============

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
}

interface ToolCall {
  name: string;
  params: Record<string, any>;
  result?: any;
}

export interface TacticStep {
  order: number;
  player_number: string;
  action: string;
  start_pos: { x: number; y: number };
  end_pos: { x: number; y: number };
  description: string;
}

export interface GeneratedTactic {
  tactic_name: string;
  name?: string;
  description: string;
  steps: TacticStep[];
  frames?: any[];
}

// ============== Props ==============

interface ChatPanelProps {
  visible: boolean;
  onClose: () => void;
  currentTactic?: any;  // Current board state
  onApplyTactic?: (tactic: GeneratedTactic) => void;
  onExecuteCommand?: (command: ToolCall) => void;
}

// ============== Quick Prompts ==============

const QUICK_PROMPTS = [
  { icon: <ThunderboltOutlined />, text: "Draw a high pick and roll", category: "generate" },
  { icon: <ThunderboltOutlined />, text: "Generate triangle offense", category: "generate" },
  { icon: <ThunderboltOutlined />, text: "Create a fast break play", category: "generate" },
  { icon: <QuestionCircleOutlined />, text: "Explain current tactic", category: "explain" },
  { icon: <BulbOutlined />, text: "What are the weaknesses of this tactic?", category: "analyze" },
  { icon: <BulbOutlined />, text: "How to defend pick and roll?", category: "question" },
];

// ============== Main Component ==============

const ChatPanel: React.FC<ChatPanelProps> = ({
  visible,
  onClose,
  currentTactic,
  onApplyTactic,
  onExecuteCommand,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [aiStatus, setAiStatus] = useState<{ available: boolean; providers: string[] } | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<any>(null);

  // Check AI service status on mount
  useEffect(() => {
    if (visible) {
      checkAIStatus();
    }
  }, [visible]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (visible && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible]);

  const checkAIStatus = async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.BASE_URL}/api/ai/status`);
      const data = await response.json();
      setAiStatus(data);
      
      if (!data.available) {
        setMessages([{
          id: 'system-1',
          role: 'system',
          content: '⚠️ AI service not configured. Please set GEMINI_API_KEY, OPENAI_API_KEY or DEEPSEEK_API_KEY environment variable in backend.',
          timestamp: new Date(),
        }]);
      }
    } catch (error) {
      console.error('Failed to check AI status:', error);
      setAiStatus({ available: false, providers: [] });
    }
  };

  const generateMessageId = () => `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Parse streaming NDJSON response
  const parseStreamResponse = async (
    response: Response,
    onChunk: (content: string) => void,
    onDone: () => void,
    onError: (error: string) => void
  ) => {
    const reader = response.body?.getReader();
    if (!reader) {
      onError('No response body');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          onDone();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              
              if (data.type === 'text-delta') {
                onChunk(data.content);
              } else if (data.type === 'tool-call') {
                // Handle tool calls
                console.log('Tool call:', data);
              } else if (data.type === 'error') {
                onError(data.content);
              } else if (data.type === 'done') {
                onDone();
              }
            } catch (e) {
              console.error('Failed to parse stream chunk:', line, e);
            }
          }
        }
      }
    } catch (error) {
      onError(String(error));
    }
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;
    
    if (!aiStatus?.available) {
      message.error('AI service unavailable, please check configuration');
      return;
    }

    const userMessage: ChatMessage = {
      id: generateMessageId(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    const assistantMessageId = generateMessageId();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Prepare messages for API
      const apiMessages = messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role, content: m.content }));
      apiMessages.push({ role: 'user', content: content.trim() });

      const response = await fetch(`${API_ENDPOINTS.BASE_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          current_tactic: currentTactic,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      let fullContent = '';

      await parseStreamResponse(
        response,
        (chunk) => {
          fullContent += chunk;
          setMessages(prev => prev.map(m => 
            m.id === assistantMessageId 
              ? { ...m, content: fullContent }
              : m
          ));
        },
        () => {
          setMessages(prev => prev.map(m => 
            m.id === assistantMessageId 
              ? { ...m, isStreaming: false }
              : m
          ));
          
          // Check if response contains a generated tactic
          tryParseGeneratedTactic(fullContent);
        },
        (error) => {
          setMessages(prev => prev.map(m => 
            m.id === assistantMessageId 
              ? { ...m, content: `Error: ${error}`, isStreaming: false }
              : m
          ));
        }
      );

    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => prev.map(m => 
        m.id === assistantMessageId 
          ? { ...m, content: `Failed to send message: ${error}`, isStreaming: false }
          : m
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const tryParseGeneratedTactic = (content: string) => {
    // Try to extract JSON from the response - multiple formats supported
    
    // Format 1: ```json { ... } ```
    let jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    let jsonStr = jsonMatch ? jsonMatch[1] : null;
    
    // Format 2: Direct JSON object in content (tool call format)
    if (!jsonStr) {
      // Try to find a JSON object starting with {"tool": or {"tactic_name": or {"name":
      const directMatch = content.match(/\{[\s\S]*"(?:tool|tactic_name|name)"[\s\S]*\}/);
      if (directMatch) {
        jsonStr = directMatch[0];
      }
    }
    
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        
        // Handle tool call format: {"tool": "generate_tactic", "params": {...}}
        if (parsed.tool === 'generate_tactic' && parsed.params) {
          const tacticData = parsed.params;
          setMessages(prev => [...prev, {
            id: generateMessageId(),
            role: 'system',
            content: `✅ Tactic generated: ${tacticData.name || tacticData.tactic_name || 'Unnamed Tactic'}`,
            timestamp: new Date(),
            toolCalls: [{
              name: 'apply_tactic',
              params: tacticData,
            }],
          }]);
          return;
        }
        
        // Handle direct tactic format: {"tactic_name": "...", "steps": [...]}
        if (parsed.steps && Array.isArray(parsed.steps)) {
          setMessages(prev => [...prev, {
            id: generateMessageId(),
            role: 'system',
            content: `✅ Tactic generated: ${parsed.tactic_name || parsed.name || 'Unnamed Tactic'}`,
            timestamp: new Date(),
            toolCalls: [{
              name: 'apply_tactic',
              params: parsed,
            }],
          }]);
          return;
        }
        
        // Handle frames format: {"name": "...", "frames": [...]}
        if (parsed.frames && Array.isArray(parsed.frames)) {
          setMessages(prev => [...prev, {
            id: generateMessageId(),
            role: 'system',
            content: `✅ Tactic generated: ${parsed.name || parsed.tactic_name || 'Unnamed Tactic'}`,
            timestamp: new Date(),
            toolCalls: [{
              name: 'apply_tactic',
              params: parsed,
            }],
          }]);
          return;
        }
        
      } catch (e) {
        console.log('Could not parse tactic JSON:', e);
      }
    }
  };

  const handleApplyTactic = (tactic: GeneratedTactic) => {
    if (onApplyTactic) {
      onApplyTactic(tactic);
      message.success('Tactic applied to board');
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    sendMessage(prompt);
  };

  const clearChat = () => {
    setMessages([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  // ============== Render Functions ==============

  const renderMessage = (msg: ChatMessage) => {
    const isUser = msg.role === 'user';
    const isSystem = msg.role === 'system';

    return (
      <div
        key={msg.id}
        style={{
          display: 'flex',
          flexDirection: isUser ? 'row-reverse' : 'row',
          marginBottom: 16,
          alignItems: 'flex-start',
        }}
      >
        <Avatar
          icon={isUser ? <UserOutlined /> : <RobotOutlined />}
          style={{
            backgroundColor: isUser ? '#1890ff' : isSystem ? '#faad14' : '#52c41a',
            marginLeft: isUser ? 8 : 0,
            marginRight: isUser ? 0 : 8,
          }}
        />
        <div
          style={{
            maxWidth: '80%',
            padding: '10px 14px',
            borderRadius: 12,
            backgroundColor: isUser ? '#1890ff' : isSystem ? '#fff7e6' : '#f0f0f0',
            color: isUser ? 'white' : '#333',
            wordBreak: 'break-word',
          }}
        >
          {msg.isStreaming && !msg.content && (
            <Spin size="small" />
          )}
          <div style={{ whiteSpace: 'pre-wrap' }}>
            {msg.content}
            {msg.isStreaming && <span className="cursor-blink">|</span>}
          </div>
          
          {/* Tool call results (e.g., Apply Tactic button) */}
          {msg.toolCalls?.map((tool, idx) => (
            <div key={idx} style={{ marginTop: 8 }}>
              {tool.name === 'apply_tactic' && (
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={() => handleApplyTactic(tool.params as GeneratedTactic)}
                >
                  Apply Tactic
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderQuickPrompts = () => (
    <div style={{ padding: '8px 0' }}>
      <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
        Quick Commands:
      </Text>
      <Space wrap size={[8, 8]}>
        {QUICK_PROMPTS.map((prompt, idx) => (
          <Tag
            key={idx}
            icon={prompt.icon}
            style={{ cursor: 'pointer', padding: '4px 8px' }}
            color={
              prompt.category === 'generate' ? 'blue' :
              prompt.category === 'explain' ? 'green' :
              prompt.category === 'analyze' ? 'orange' : 'default'
            }
            onClick={() => handleQuickPrompt(prompt.text)}
          >
            {prompt.text}
          </Tag>
        ))}
      </Space>
    </div>
  );

  const drawerWidth = isExpanded ? 600 : 400;

  return (
    <Drawer
      title={
        <Space>
          <RobotOutlined />
          <span>AI Tactics Assistant</span>
          {aiStatus?.available && (
            <Tag color="green" style={{ marginLeft: 8 }}>
              {aiStatus.providers[0]?.toUpperCase()}
            </Tag>
          )}
        </Space>
      }
      placement="right"
      onClose={onClose}
      open={visible}
      width={drawerWidth}
      extra={
        <Space>
          <Tooltip title={isExpanded ? "Collapse" : "Expand"}>
            <Button 
              type="text" 
              icon={isExpanded ? <CompressOutlined /> : <ExpandOutlined />}
              onClick={() => setIsExpanded(!isExpanded)}
            />
          </Tooltip>
          <Tooltip title="Clear Chat">
            <Button 
              type="text" 
              icon={<ClearOutlined />} 
              onClick={clearChat}
              disabled={messages.length === 0}
            />
          </Tooltip>
        </Space>
      }
      styles={{
        body: {
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }
      }}
    >
      {/* Messages Container */}
      <div 
        style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: 16,
          backgroundColor: '#fafafa',
        }}
      >
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <RobotOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />
            <Paragraph type="secondary" style={{ marginTop: 16 }}>
              Hello! I'm your AI Tactics Assistant.
              <br />
              I can help you generate tactics, explain plays, or answer basketball-related questions.
            </Paragraph>
            {renderQuickPrompts()}
          </div>
        ) : (
          <>
            {messages.map(renderMessage)}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Quick Prompts (when has messages) */}
      {messages.length > 0 && (
        <Collapse 
          ghost 
          style={{ borderTop: '1px solid #f0f0f0' }}
          items={[{
            key: '1',
            label: <Text type="secondary" style={{ fontSize: 12 }}>Quick Commands</Text>,
            children: renderQuickPrompts(),
          }]}
        />
      )}

      {/* Input Area */}
      <div 
        style={{ 
          padding: 16, 
          borderTop: '1px solid #f0f0f0',
          backgroundColor: 'white',
        }}
      >
        <Space.Compact style={{ width: '100%' }}>
          <TextArea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={aiStatus?.available ? "Type a message... (Shift+Enter for new line)" : "AI service unavailable"}
            autoSize={{ minRows: 1, maxRows: 4 }}
            disabled={!aiStatus?.available || isLoading}
            style={{ resize: 'none' }}
          />
          <Button
            type="primary"
            icon={isLoading ? <Spin size="small" /> : <SendOutlined />}
            onClick={() => sendMessage(inputValue)}
            disabled={!inputValue.trim() || isLoading || !aiStatus?.available}
            style={{ height: 'auto' }}
          >
            Send
          </Button>
        </Space.Compact>
      </div>

      {/* Cursor blink animation */}
      <style>{`
        .cursor-blink {
          animation: blink 1s step-end infinite;
        }
        @keyframes blink {
          50% { opacity: 0; }
        }
      `}</style>
    </Drawer>
  );
};

export default ChatPanel;
