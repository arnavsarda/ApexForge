import { useState, useRef, useEffect } from 'react';
import {
  sendRepoChat,
  type ChatMessage,
  type RepoChatResponse,
} from '../api/client';

interface Props {
  repoName: string;
  repoUrl: string;
  overview?: string;
  techStack?: string[];
  files?: string[];
  setupSteps?: string[];
  aiAvailable?: boolean;
  targetModel?: string;
}

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  fallbackUsed?: boolean;
  aiModel?: string | null;
}

const STARTER_QUESTIONS = [
  'How do I run tests for this project?',
  'What are the key architecture files and folders?',
  'How do I set up my local development environment?',
  'What are the prerequisites to contribute?',
];

export default function RepoChat({
  repoName,
  repoUrl,
  overview,
  techStack,
  files,
  setupSteps,
  targetModel = 'qwen3:4b',
}: Props) {
  const [messages, setMessages] = useState<DisplayMessage[]>([
    {
      role: 'assistant',
      content: `Hi! I'm your repository assistant for **${repoName}**. Ask me anything about building, running tests, or navigating the codebase.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (questionToSend?: string) => {
    const q = (questionToSend || input).trim();
    if (!q || loading) return;

    setError(null);
    setInput('');

    // Append user message
    const userMsg: DisplayMessage = { role: 'user', content: q };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      // Build history for context
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
      });

      const assistantMsg: DisplayMessage = {
        role: 'assistant',
        content: response.answer,
        sources: response.sources,
        fallbackUsed: response.fallback_used,
        aiModel: response.ai_model,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to get answer';
      setError(msg);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Sorry, an error occurred while generating a response: ${msg}`,
          fallbackUsed: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="card fade-in fade-in-delay-4" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
        <h2 className="card-title" style={{ margin: 0 }}>
          <svg className="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Repository Assistant
        </h2>
        <span
          className="ai-badge"
          style={{
            background: 'rgba(22, 163, 74, 0.12)',
            color: 'var(--accent-green)',
            border: '1px solid rgba(22, 163, 74, 0.25)',
            fontSize: '11px',
          }}
        >
          {targetModel} / Grounded
        </span>
      </div>

      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)', lineHeight: 1.4 }}>
        Ask specific questions about <strong>{repoName}</strong>. Grounded in actual repository files, dependency manifests, and README documentation.
      </p>

      {/* Suggested Quick Question Starters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        {STARTER_QUESTIONS.map((sq, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSend(sq)}
            disabled={loading}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-full)',
              padding: '3px 10px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent-green)';
              e.currentTarget.style.color = 'var(--accent-green)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-subtle)';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            {sq}
          </button>
        ))}
      </div>

      {/* Chat Messages Box */}
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-4)',
          minHeight: '220px',
          maxHeight: '340px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-3)',
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
                background: isUser ? 'var(--accent-green)' : 'var(--bg-card)',
                color: isUser ? '#ffffff' : 'var(--text-primary)',
                border: isUser ? 'none' : '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-3) var(--space-4)',
                fontSize: 'var(--text-xs)',
                lineHeight: 1.5,
              }}
            >
              <div
                dangerouslySetInnerHTML={{
                  __html: m.content
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/`([^`]+)`/g, '<code style="background: rgba(0,0,0,0.25); padding: 1px 4px; border-radius: 3px;">$1</code>')
                    .replace(/\n/g, '<br/>'),
                }}
              />

              {/* Citations & Evidence Notice */}
              {m.sources && m.sources.length > 0 && (
                <div style={{ marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '10px', color: isUser ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)' }}>
                  <span style={{ fontWeight: 600 }}>Sources: </span>
                  {m.sources.join(', ')}
                </div>
              )}

              {/* Honest Mode indicator */}
              {!isUser && m.fallbackUsed && (
                <div style={{ marginTop: '4px', fontSize: '9px', color: 'var(--text-muted)' }}>
                  Synthesized via evidence rule engine
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div
            style={{
              alignSelf: 'flex-start',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-3) var(--space-4)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
          >
            <div className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }} />
            <span>Consulting repository evidence...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <input
          type="text"
          placeholder="Ask a question about setup, architecture, or tests..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          style={{
            flex: 1,
            background: 'var(--bg-input)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '8px 12px',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
          className="search-btn"
          style={{
            padding: '8px 16px',
            fontSize: 'var(--text-xs)',
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          Send
        </button>
      </div>
      {error && (
        <span style={{ fontSize: '11px', color: 'var(--accent-red)', marginTop: '4px' }}>
          {error}
        </span>
      )}
    </div>
  );
}
