import { useState, useRef, useEffect } from 'react';
import {
  sendRepoChat,
  type ChatMessage,
  type RepoChatResponse,
} from '../api/client';

export interface SelectedFileContext {
  path: string;
  name: string;
  content: string | null;
}

interface Props {
  repoName: string;
  repoUrl: string;
  currentView: 'dashboard' | 'graph';
  overview?: string;
  techStack?: string[];
  files?: string[];
  setupSteps?: string[];
  targetModel?: string;
  ollamaAvailable?: boolean;
  selectedFile?: SelectedFileContext | null;
  onClearSelectedFile?: () => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  pendingQuestion?: string | null;
  onClearPendingQuestion?: () => void;
}

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  fallbackUsed?: boolean;
  aiModel?: string | null;
  timestamp: string;
}

const INITIAL_MESSAGE: DisplayMessage = {
  role: 'assistant',
  content:
    'Hi! I can help you understand this repository, your onboarding guide, the repository graph, and individual files. What would you like to know?',
  timestamp: 'Just now',
};

export default function FloatingAiChat({
  repoName,
  repoUrl,
  currentView,
  overview,
  techStack,
  files,
  setupSteps,
  targetModel = 'qwen3:4b',
  ollamaAvailable = false,
  selectedFile,
  onClearSelectedFile,
  isOpen,
  onToggleOpen,
  pendingQuestion,
  onClearPendingQuestion,
}: Props) {
  const [messages, setMessages] = useState<DisplayMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Isolate chat history per repository
  useEffect(() => {
    setMessages([INITIAL_MESSAGE]);
    setError(null);
  }, [repoName]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSend = async (questionText?: string) => {
    const q = (questionText || input).trim();
    if (!q || loading) return;

    setError(null);
    setInput('');

    const userMsg: DisplayMessage = {
      role: 'user',
      content: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const historyPayload: ChatMessage[] = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response: RepoChatResponse = await sendRepoChat({
        repo_name: repoName,
        repository_url: repoUrl,
        question: q,
        history: historyPayload,
        context_overview: overview,
        context_tech_stack: techStack,
        context_files: files,
        context_setup_steps: setupSteps,
        selected_file_path: selectedFile?.path,
        selected_file_content: selectedFile?.content,
        current_view: currentView,
      });

      const assistantMsg: DisplayMessage = {
        role: 'assistant',
        content: response.answer,
        sources: response.sources,
        fallbackUsed: response.fallback_used,
        aiModel: response.ai_model,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to get answer';
      setError(msg);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Sorry, an error occurred while connecting to local AI: ${msg}\n\nMake sure Ollama is running (\`ollama serve\`) and the target model is installed (\`ollama pull ${targetModel}\`).`,
          fallbackUsed: true,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Trigger pending question if requested (e.g. from "Explain this file" in graph drawer)
  useEffect(() => {
    if (pendingQuestion && isOpen && !loading) {
      handleSend(pendingQuestion);
      onClearPendingQuestion?.();
    }
  }, [pendingQuestion, isOpen, loading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickPrompts = [
    'How do I use this dashboard?',
    'How do I read the repository graph?',
    'Explain the selected file.',
    'Where should a new contributor start?',
  ];

  return (
    <>
      {/* Floating Action Button (bottom-right) */}
      <button
        type="button"
        onClick={onToggleOpen}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 100,
          background: 'linear-gradient(135deg, #16a34a, #15803d)',
          color: '#ffffff',
          border: 'none',
          borderRadius: 'var(--radius-full)',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(22, 163, 74, 0.35), 0 2px 6px rgba(0, 0, 0, 0.08)',
          fontWeight: 700,
          fontSize: 'var(--text-sm)',
          transition: 'transform 200ms ease, box-shadow 200ms ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
          e.currentTarget.style.boxShadow = '0 12px 30px rgba(22, 163, 74, 0.45)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0) scale(1)';
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(22, 163, 74, 0.35)';
        }}
        title="Open RepoReady AI Assistant"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/>
          <rect x="4" y="8" width="16" height="12" rx="2"/>
          <circle cx="9" cy="14" r="1"/>
          <circle cx="15" cy="14" r="1"/>
        </svg>
        <span>AI Assistant</span>
        {selectedFile && (
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#bbf7d0',
              boxShadow: '0 0 6px #bbf7d0',
            }}
            title="File context active"
          />
        )}
      </button>

      {/* Floating Chat Panel */}
      {isOpen && (
        <div
          className="fade-in"
          style={{
            position: 'fixed',
            bottom: '84px',
            right: '24px',
            width: '400px',
            maxWidth: 'calc(100vw - 32px)',
            height: '560px',
            maxHeight: 'calc(100vh - 120px)',
            background: '#ffffff',
            border: '1.5px solid #dcf2e3',
            borderRadius: 'var(--radius-xl)',
            boxShadow: '0 16px 40px rgba(15, 41, 30, 0.15)',
            zIndex: 101,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: 'var(--space-3) var(--space-4)',
              background: '#14532d',
              borderBottom: '1px solid #166534',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(255, 255, 255, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/>
                  <rect x="4" y="8" width="16" height="12" rx="2"/>
                  <circle cx="9" cy="14" r="1"/>
                  <circle cx="15" cy="14" r="1"/>
                </svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 700, color: '#ffffff' }}>
                  RepoReady AI Assistant
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'rgba(255, 255, 255, 0.8)' }}>
                  <span>{repoName}</span>
                  <span>&bull;</span>
                  <span style={{ color: '#bbf7d0', textTransform: 'capitalize', fontWeight: 600 }}>
                    {currentView}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                onClick={() => setMessages([INITIAL_MESSAGE])}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.85)',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: 'var(--radius-sm)',
                }}
                title="Reset conversation"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                  <path d="M21 3v5h-5"/>
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                  <path d="M3 21v-5h5"/>
                </svg>
              </button>

              <button
                type="button"
                onClick={onToggleOpen}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.85)',
                  cursor: 'pointer',
                  fontSize: '18px',
                  padding: '2px 6px',
                }}
                title="Close chat"
              >
                &times;
              </button>
            </div>
          </div>

          {/* Context Banner: Active File (if selected in graph/tree) */}
          {selectedFile && (
            <div
              style={{
                background: '#f0fdf4',
                borderBottom: '1px solid #dcf2e3',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                <span style={{ color: '#15803d', fontWeight: 600 }}>Active File:</span>
                <code
                  style={{
                    color: '#0f291e',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '240px',
                    background: 'rgba(22, 163, 74, 0.1)',
                    padding: '1px 6px',
                    borderRadius: '4px',
                  }}
                  title={selectedFile.path}
                >
                  {selectedFile.path}
                </code>
              </div>
              {onClearSelectedFile && (
                <button
                  type="button"
                  onClick={onClearSelectedFile}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#527964',
                    cursor: 'pointer',
                    fontSize: '13px',
                    padding: '0 4px',
                  }}
                  title="Clear file context"
                >
                  &times;
                </button>
              )}
            </div>
          )}

          {/* Model Status Alert if offline */}
          {!ollamaAvailable && (
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.06)',
                borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
                padding: '6px 12px',
                fontSize: '10px',
                color: 'var(--text-muted)',
                lineHeight: 1.3,
              }}
            >
              <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>Local AI Offline:</span>{' '}
              Run <code>ollama pull {targetModel}</code> and <code>ollama serve</code>. Evidence-based synthesis is currently active.
            </div>
          )}

          {/* Quick Prompts Carousel */}
          <div
            style={{
              padding: '8px 12px',
              background: '#f8faf8',
              borderBottom: '1px solid #dcf2e3',
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              scrollbarWidth: 'none',
            }}
          >
            {quickPrompts.map((qp, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSend(qp)}
                disabled={loading}
                style={{
                  background: '#ffffff',
                  border: '1px solid #bbf7d0',
                  borderRadius: 'var(--radius-full)',
                  padding: '4px 11px',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: '#166534',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'all 150ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#16a34a';
                  e.currentTarget.style.background = '#f0fdf4';
                  e.currentTarget.style.color = '#14532d';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#bbf7d0';
                  e.currentTarget.style.background = '#ffffff';
                  e.currentTarget.style.color = '#166534';
                }}
              >
                {qp}
              </button>
            ))}
          </div>

          {/* Chat Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 'var(--space-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              background: '#f8faf8',
            }}
          >
            {messages.map((m, idx) => {
              const isUser = m.role === 'user';
              return (
                <div
                  key={idx}
                  style={{
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    background: isUser
                      ? '#15803d'
                      : '#ffffff',
                    color: isUser ? '#ffffff' : '#0f291e',
                    border: isUser ? 'none' : '1px solid #dcf2e3',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--space-3) var(--space-4)',
                    fontSize: 'var(--text-xs)',
                    lineHeight: 1.5,
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div
                    dangerouslySetInnerHTML={{
                      __html: m.content
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/`([^`]+)`/g, '<code style="background: rgba(22,163,74,0.1); color: #166534; padding: 1px 4px; border-radius: 3px; font-weight: 600;">$1</code>')
                        .replace(/\n/g, '<br/>'),
                    }}
                  />

                  {/* Sources Citations */}
                  {m.sources && m.sources.length > 0 && (
                    <div
                      style={{
                        marginTop: 'var(--space-2)',
                        paddingTop: 'var(--space-2)',
                        borderTop: isUser ? '1px solid rgba(255,255,255,0.2)' : '1px solid #e2ece4',
                        fontSize: '9px',
                        color: isUser ? 'rgba(255,255,255,0.85)' : '#527964',
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>Sources: </span>
                      {m.sources.join(', ')}
                    </div>
                  )}

                  {/* Fallback Notice */}
                  {!isUser && m.fallbackUsed && (
                    <div style={{ marginTop: '3px', fontSize: '9px', color: '#6b7280' }}>
                      Evidence Rule Engine
                    </div>
                  )}

                  <div
                    style={{
                      marginTop: '4px',
                      fontSize: '9px',
                      color: isUser ? 'rgba(255,255,255,0.7)' : '#6b7280',
                      textAlign: isUser ? 'right' : 'left',
                    }}
                  >
                    {m.timestamp}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div
                style={{
                  alignSelf: 'flex-start',
                  background: '#ffffff',
                  border: '1px solid #dcf2e3',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-3) var(--space-4)',
                  fontSize: 'var(--text-xs)',
                  color: '#2d5a43',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                }}
              >
                <div className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px', borderTopColor: '#16a34a' }} />
                <span>Consulting local AI assistant...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Error notice if present */}
          {error && (
            <div style={{ padding: '4px 12px', background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', fontSize: '10px' }}>
              {error}
            </div>
          )}

          {/* Input Footer */}
          <div
            style={{
              padding: 'var(--space-3)',
              background: '#ffffff',
              borderTop: '1px solid #dcf2e3',
              display: 'flex',
              gap: 'var(--space-2)',
            }}
          >
            <input
              ref={inputRef}
              type="text"
              placeholder={
                selectedFile
                  ? `Ask anything about ${selectedFile.name}...`
                  : 'Ask anything about this repo, graph, setup, or files...'
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              style={{
                flex: 1,
                background: '#f8faf8',
                border: '1px solid #dcf2e3',
                borderRadius: 'var(--radius-md)',
                padding: '8px 12px',
                fontSize: 'var(--text-xs)',
                color: '#0f291e',
                fontFamily: 'inherit',
                outline: 'none',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#16a34a'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#dcf2e3'; }}
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="search-btn"
              style={{
                padding: '8px 14px',
                fontSize: 'var(--text-xs)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
