# Cold Case Detective 🔍

A full-stack RAG (Retrieval-Augmented Generation) application that lets you interrogate evidence files like a veteran detective.

## Project Structure

```
ColdCase/
├── rag-service/         # Python RAG API (FastAPI + LangChain)
│   ├── api.py           # FastAPI REST endpoints
│   ├── main.py          # Original CLI version
│   ├── requirements.txt # Python dependencies
│   └── evidence/        # Evidence text files
│
├── backend/             # Express.js API Server
│   ├── index.js         # Main server + routes
│   └── package.json     # Node dependencies
│
├── frontend/            # Next.js Web Application
│   ├── app/             # Next.js app router
│   │   ├── page.js      # Main chat interface
│   │   ├── layout.js    # Root layout
│   │   └── globals.css  # Noir detective theme
│   └── package.json     # Node dependencies
│
├── .env                 # Environment variables
├── start.sh             # Start all services
└── README.md
```

## Quick Start

### 1. Set up environment

Create a `.env` file in the root:
```bash
GROQ_API_KEY=your-groq-api-key
SERVER_PORT=5001
PYTHON_API_URL=http://localhost:8000
```

Get a free Groq API key at: https://console.groq.com/keys

### 2. Install dependencies

```bash
# Python (in rag-service folder)
cd rag-service
pip install -r requirements.txt

# Express backend
cd ../backend
npm install

# Next.js frontend
cd ../frontend
npm install
```

### 3. Start all services

**Option A: Use the startup script**
```bash
./start.sh
```

**Option B: Start manually (3 terminals)**

Terminal 1 - Python API:
```bash
cd rag-service
python -m uvicorn api:app --host 0.0.0.0 --port 8000
```

Terminal 2 - Express Server:
```bash
cd backend
node index.js
```

Terminal 3 - Next.js Frontend:
```bash
cd frontend
npm run dev
```

### 4. Open the app

Visit **http://localhost:3000** and start investigating!

## Adding Evidence

Place `.txt` files in the `rag-service/evidence/` folder. The system will automatically load and index them on startup.

## Tech Stack

- **Frontend**: Next.js 14, React, CSS (noir theme)
- **Backend**: Express.js, MongoDB (optional)
- **AI Service**: FastAPI, LangChain, FAISS, Groq (Llama 3.1)
- **Embeddings**: HuggingFace all-MiniLM-L6-v2

## License

MIT
