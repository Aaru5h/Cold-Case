'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const API_URL = 'http://localhost:5001/api';

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sources, setSources] = useState([]);
  const [isOnline, setIsOnline] = useState(false);
  const [tips, setTips] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null); // { type: 'success' | 'error', message: string }
  const [isUploading, setIsUploading] = useState(false);
  const [viewingFile, setViewingFile] = useState(null); // { filename, content }
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Check health on mount
  useEffect(() => {
    checkHealth();
    fetchSources();
    fetchTips();
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Clear upload status after 4s
  useEffect(() => {
    if (uploadStatus) {
      const timer = setTimeout(() => setUploadStatus(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [uploadStatus]);

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

  const fetchTips = async () => {
    try {
      const res = await fetch(`${API_URL}/tips`);
      const data = await res.json();
      setTips(data.tips || []);
    } catch {
      setTips([]);
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
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

  // ============================================================
  // FILE UPLOAD
  // ============================================================

  const handleFileUpload = async (file) => {
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['txt', 'pdf'].includes(ext)) {
      setUploadStatus({ type: 'error', message: 'Only .txt and .pdf files are supported' });
      return;
    }

    setIsUploading(true);
    setUploadStatus(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Upload failed');
      }

      const data = await res.json();
      setUploadStatus({ type: 'success', message: `"${file.name}" added to evidence` });
      fetchSources(); // Refresh file list
    } catch (error) {
      setUploadStatus({ type: 'error', message: error.message || 'Upload failed' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, []);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) handleFileUpload(file);
    e.target.value = ''; // Reset so same file can be re-uploaded
  };

  // ============================================================
  // EVIDENCE READER
  // ============================================================

  const openEvidence = async (filename) => {
    setIsLoadingFile(true);
    setViewingFile({ filename, content: '' });

    try {
      const res = await fetch(`${API_URL}/evidence/${encodeURIComponent(filename)}`);
      if (!res.ok) throw new Error('Failed to load file');
      const data = await res.json();
      setViewingFile({ filename: data.filename, content: data.content });
    } catch (error) {
      setViewingFile({ filename, content: '⚠️ Could not load this file.' });
    } finally {
      setIsLoadingFile(false);
    }
  };

  const closeModal = () => setViewingFile(null);

  // ============================================================
  // TIP CLICK → AUTO-SUBMIT
  // ============================================================

  const handleTipClick = (query) => {
    if (isLoading) return;
    setInput(query);
    // Use setTimeout to let state update, then submit
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'user', content: query }]);
      setIsLoading(true);
      fetch(`${API_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query })
      })
        .then(res => {
          if (!res.ok) throw new Error('Failed');
          return res.json();
        })
        .then(data => {
          setMessages(prev => [...prev, {
            role: 'detective',
            content: data.answer,
            sources: data.sources
          }]);
        })
        .catch(() => {
          setMessages(prev => [...prev, {
            role: 'detective',
            content: 'I seem to be having trouble accessing the case files.',
            error: true
          }]);
        })
        .finally(() => {
          setIsLoading(false);
          setInput('');
        });
    }, 100);
  };

  // ============================================================
  // RENDER
  // ============================================================

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
          {/* Case Files */}
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
                  <div 
                    key={idx} 
                    className="evidence-item clickable"
                    onClick={() => openEvidence(file)}
                    title="Click to read this file"
                  >
                    <span className="evidence-icon">📄</span>
                    <span>{file}</span>
                    <span className="evidence-read-icon">👁️</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* File Upload */}
          <div className="evidence-card">
            <div className="evidence-header">
              <span>📤</span>
              <h3>Upload Evidence</h3>
            </div>
            <div className="evidence-list">
              <div
                className={`upload-area ${isDragging ? 'dragging' : ''} ${isUploading ? 'uploading' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.pdf"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                {isUploading ? (
                  <>
                    <span className="upload-icon spinning">⏳</span>
                    <span className="upload-text">Processing evidence...</span>
                  </>
                ) : (
                  <>
                    <span className="upload-icon">📎</span>
                    <span className="upload-text">Drop .txt or .pdf here</span>
                    <span className="upload-subtext">or click to browse</span>
                  </>
                )}
              </div>
              {uploadStatus && (
                <div className={`upload-status ${uploadStatus.type}`}>
                  <span>{uploadStatus.type === 'success' ? '✅' : '❌'}</span>
                  <span>{uploadStatus.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* Investigation Tips */}
          <div className="evidence-card">
            <div className="evidence-header">
              <span>💡</span>
              <h3>Investigation Tips</h3>
            </div>
            <div className="evidence-list">
              {tips.length === 0 ? (
                <>
                  <div className="evidence-item">
                    <span className="evidence-icon">•</span>
                    <span>Loading tips...</span>
                  </div>
                </>
              ) : (
                tips.map((tip, idx) => (
                  <div
                    key={idx}
                    className="evidence-item tip-button"
                    onClick={() => handleTipClick(tip.query)}
                    title={tip.query}
                  >
                    <span className="evidence-icon">💡</span>
                    <span>{tip.text}</span>
                    <span className="tip-arrow">→</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </main>

      {/* Evidence Reader Modal */}
      {viewingFile && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <span>📄</span>
                <h3>{viewingFile.filename}</h3>
              </div>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-body">
              {isLoadingFile ? (
                <div className="modal-loading">
                  <div className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span>Loading evidence file...</span>
                </div>
              ) : (
                <pre className="modal-text">{viewingFile.content}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
