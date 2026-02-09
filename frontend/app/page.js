'use client';

import { useState, useEffect, useRef } from 'react';

const API_URL = 'http://localhost:5001/api';

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sources, setSources] = useState([]);
  const [isOnline, setIsOnline] = useState(false);
  const messagesEndRef = useRef(null);

  // Check health on mount
  useEffect(() => {
    checkHealth();
    fetchSources();
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const checkHealth = async () => {
    try {
      const res = await fetch(`${API_URL}/health`);
      const data = await res.json();
      setIsOnline(data.pythonApi === 'healthy');
    } catch {
      setIsOnline(false);
    }
  };

  const fetchSources = async () => {
    try {
      const res = await fetch(`${API_URL}/sources`);
      const data = await res.json();
      setSources(data.files || []);
    } catch {
      setSources([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const question = input.trim();
    setInput('');
    
    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question })
      });

      if (!res.ok) {
        throw new Error('Failed to get response');
      }

      const data = await res.json();
      
      // Add detective message
      setMessages(prev => [...prev, {
        role: 'detective',
        content: data.answer,
        sources: data.sources
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'detective',
        content: 'I seem to be having trouble accessing the case files. Make sure the Python API is running.',
        error: true
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <span className="logo-icon">🔍</span>
            <div className="logo-text">
              <h1 className="logo-title">Cold Case Detective</h1>
              <span className="logo-subtitle">RAG Investigation System</span>
            </div>
          </div>
          <div className="status-badge">
            <span className={`status-dot ${!isOnline ? 'offline' : ''}`}></span>
            {isOnline ? 'System Active' : 'System Offline'}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Chat Panel */}
        <div className="chat-panel">
          <div className="chat-header">
            <h2>🕵️ Investigation Room</h2>
          </div>

          <div className="messages-container">
            {messages.length === 0 ? (
              <div className="welcome-message">
                <div className="welcome-icon">🔍</div>
                <h2>Welcome, Detective</h2>
                <p>
                  I've analyzed the evidence files in this case. 
                  Ask me anything about the suspects, timeline, or evidence 
                  and I'll dig through the case files for you.
                </p>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} className={`message ${msg.role}`}>
                  <span className="message-label">
                    {msg.role === 'user' ? 'You' : 'Detective'}
                  </span>
                  <div className="message-content">
                    {msg.content}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="message-sources">
                        <div className="message-sources-title">📎 Sources</div>
                        {msg.sources.map((src, i) => (
                          <span key={i} className="source-tag">{src.filename}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {isLoading && (
              <div className="message detective">
                <span className="message-label">Detective</span>
                <div className="loading-indicator">
                  <span>Analyzing evidence</span>
                  <div className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form className="input-area" onSubmit={handleSubmit}>
            <div className="input-wrapper">
              <input
                type="text"
                className="message-input"
                placeholder="Ask about the evidence..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
              />
              <button 
                type="submit" 
                className="send-button"
                disabled={isLoading || !input.trim()}
              >
                <span>Investigate</span>
                <span>→</span>
              </button>
            </div>
          </form>
        </div>

        {/* Evidence Panel */}
        <aside className="evidence-panel">
          <div className="evidence-card">
            <div className="evidence-header">
              <span>📁</span>
              <h3>Case Files</h3>
            </div>
            <div className="evidence-list">
              {sources.length === 0 ? (
                <div className="evidence-item">
                  <span className="evidence-icon">⏳</span>
                  <span>Loading evidence...</span>
                </div>
              ) : (
                sources.map((file, idx) => (
                  <div key={idx} className="evidence-item">
                    <span className="evidence-icon">📄</span>
                    <span>{file}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="evidence-card">
            <div className="evidence-header">
              <span>💡</span>
              <h3>Investigation Tips</h3>
            </div>
            <div className="evidence-list">
              <div className="evidence-item">
                <span className="evidence-icon">•</span>
                <span>Ask about specific suspects</span>
              </div>
              <div className="evidence-item">
                <span className="evidence-icon">•</span>
                <span>Query timeline of events</span>
              </div>
              <div className="evidence-item">
                <span className="evidence-icon">•</span>
                <span>Look for connections</span>
              </div>
              <div className="evidence-item">
                <span className="evidence-icon">•</span>
                <span>Request evidence summary</span>
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
