/**
 * Cold Case Detective - Express Backend
 * ======================================
 * Bridges the Next.js frontend with the Python RAG service.
 * Stores chat sessions in MongoDB.
 */

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: '../.env' });

// Multer config - store uploads temporarily
const upload = multer({ dest: '/tmp/coldcase-uploads/' });

const app = express();
const PORT = process.env.SERVER_PORT || 5000;
const PYTHON_API = process.env.PYTHON_API_URL || 'http://localhost:8000';
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/coldcase';

// Middleware
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map(s => s.trim());

app.use(cors({
  origin: corsOrigins,
  credentials: true
}));
app.use(express.json());

// =============================================================================
// MONGODB CONNECTION
// =============================================================================

mongoose.connect(MONGO_URI)
  .then(() => console.log('📦 Connected to MongoDB'))
  .catch(err => {
    console.log('⚠️  MongoDB not available, using in-memory storage');
    console.log('   To use MongoDB, set MONGODB_URI in .env');
  });

// =============================================================================
// SESSION MODEL (inline for simplicity)
// =============================================================================

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'detective'], required: true },
  content: { type: String, required: true },
  sources: [{ filename: String, content: String }],
  timestamp: { type: Date, default: Date.now }
});

const sessionSchema = new mongoose.Schema({
  title: { type: String, default: 'New Investigation' },
  messages: [messageSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Session = mongoose.model('Session', sessionSchema);

// In-memory fallback when MongoDB is not available
let inMemorySessions = [];

// =============================================================================
// HELPER: Check if MongoDB is connected
// =============================================================================

const isMongoConnected = () => mongoose.connection.readyState === 1;

// =============================================================================
// ROUTES
// =============================================================================

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const pythonHealth = await fetch(`${PYTHON_API}/health`);
    const pythonData = await pythonHealth.json();
    
    res.json({
      status: 'healthy',
      mongodb: isMongoConnected() ? 'connected' : 'disconnected',
      pythonApi: pythonData.status,
      evidenceFiles: pythonData.evidence_files
    });
  } catch (error) {
    res.json({
      status: 'degraded',
      mongodb: isMongoConnected() ? 'connected' : 'disconnected',
      pythonApi: 'unavailable',
      error: error.message
    });
  }
});

// Query the detective
app.post('/api/query', async (req, res) => {
  try {
    const { question, sessionId } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    // Forward to Python API
    const response = await fetch(`${PYTHON_API}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });
    
    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json(error);
    }
    
    const data = await response.json();
    
    // Save to session if sessionId provided
    if (sessionId && isMongoConnected()) {
      try {
        const session = await Session.findById(sessionId);
        if (session) {
          session.messages.push(
            { role: 'user', content: question },
            { role: 'detective', content: data.answer, sources: data.sources }
          );
          session.updatedAt = new Date();
          
          // Update title from first question if it's still default
          if (session.title === 'New Investigation' && session.messages.length === 2) {
            session.title = question.substring(0, 50) + (question.length > 50 ? '...' : '');
          }
          
          await session.save();
        }
      } catch (err) {
        console.error('Error saving to session:', err);
      }
    }
    
    res.json(data);
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ error: 'Failed to query detective', details: error.message });
  }
});

// Get all sessions
app.get('/api/sessions', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.json(inMemorySessions);
    }
    const sessions = await Session.find()
      .select('_id title createdAt updatedAt')
      .sort({ updatedAt: -1 });
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Create new session
app.post('/api/sessions', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      const session = {
        _id: Date.now().toString(),
        title: 'New Investigation',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      inMemorySessions.unshift(session);
      return res.json(session);
    }
    
    const session = new Session({});
    await session.save();
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Get session by ID
app.get('/api/sessions/:id', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      const session = inMemorySessions.find(s => s._id === req.params.id);
      return session ? res.json(session) : res.status(404).json({ error: 'Session not found' });
    }
    
    const session = await Session.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// Get evidence sources
app.get('/api/sources', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_API}/sources`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sources' });
  }
});

// Upload evidence file
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Read the temp file and forward to Python API
    const fileBuffer = fs.readFileSync(req.file.path);
    const blob = new Blob([fileBuffer], { type: req.file.mimetype });
    const formData = new FormData();
    formData.append('file', blob, req.file.originalname);

    const response = await fetch(`${PYTHON_API}/upload`, {
      method: 'POST',
      body: formData
    });

    // Clean up temp file
    fs.unlinkSync(req.file.path);

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json(error);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Upload error:', error);
    // Clean up temp file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to upload file', details: error.message });
  }
});

// Read evidence file content
app.get('/api/evidence/:filename', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_API}/evidence/${encodeURIComponent(req.params.filename)}`);
    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json(error);
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read evidence file' });
  }
});

// Get investigation tips
app.get('/api/tips', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_API}/tips`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tips' });
  }
});

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║         🔍 Cold Case Detective - Express Server 🔍            ║
╠═══════════════════════════════════════════════════════════════╣
║  Server:     http://localhost:${PORT}                           ║
║  Python API: ${PYTHON_API}                        ║
║  MongoDB:    ${MONGO_URI.substring(0, 40)}...  ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});
