"""
Cold Case Detective - FastAPI RAG Service
==========================================
REST API wrapper around the RAG system for web integration.

Endpoints:
    POST /query - Send a question, get detective response
    GET /health - Health check
    GET /sources - List loaded evidence files
"""

import os
import shutil
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# LangChain imports
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_core.embeddings import Embeddings
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

from huggingface_hub import InferenceClient

# Load environment variables
load_dotenv()

# =============================================================================
# CONFIGURATION
# =============================================================================

EVIDENCE_FOLDER = Path(__file__).parent / "evidence"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
TOP_K_RESULTS = 3
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
LLM_MODEL = "llama-3.1-8b-instant"

DETECTIVE_SYSTEM_PROMPT = """You are a veteran Cold Case Detective with decades of experience solving complex mysteries.

Your guidelines:
1. Use ONLY the provided context (evidence) to answer questions
2. If the answer is not found in the evidence, say: "I don't have that information in the evidence yet, Detective. We need more leads."
3. Always cite your source by including the filename in parentheses at the end of each relevant sentence
4. Think methodically and connect evidence logically
5. Maintain a professional but gritty detective persona

Context from the evidence files:
{context}

Question: {question}
"""

# =============================================================================
# GLOBAL STATE
# =============================================================================

class RAGSystem:
    def __init__(self):
        self.chain = None
        self.retriever = None
        self.evidence_files = []
        self.is_ready = False

rag = RAGSystem()

# =============================================================================
# RAG SETUP FUNCTIONS
# =============================================================================

def format_docs(docs):
    """Format retrieved documents with source info."""
    formatted = []
    for doc in docs:
        source = Path(doc.metadata.get('source', 'unknown')).name
        formatted.append(f"[Source: {source}]\n{doc.page_content}")
    return "\n\n---\n\n".join(formatted)


# =============================================================================
# LIGHTWEIGHT EMBEDDINGS (no torch needed)
# =============================================================================

class HFAPIEmbeddings(Embeddings):
    """HuggingFace Inference API embeddings using the official huggingface_hub client."""
    
    def __init__(self, model_name: str, api_key: str):
        if not api_key:
            raise RuntimeError("HF_API_TOKEN is not set. Get a free token at https://huggingface.co/settings/tokens")
        self.model_name = model_name
        self.client = InferenceClient(token=api_key)
    
    def _get_embedding(self, text: str) -> list[float]:
        """Get embedding for a single text using the official client."""
        result = self.client.feature_extraction(text, model=self.model_name)
        # result is a numpy array — may be 2D (tokens x dim), mean pool to 1D
        import numpy as np
        arr = np.array(result)
        if arr.ndim == 2:
            arr = arr.mean(axis=0)
        return arr.tolist()
    
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed a list of documents."""
        return [self._get_embedding(text) for text in texts]
    
    def embed_query(self, text: str) -> list[float]:
        """Embed a single query."""
        return self._get_embedding(text)


def initialize_rag():
    """Initialize (or re-initialize) the RAG system."""
    print("🚀 Initializing RAG system...")
    
    # Check for API key
    if not os.getenv("GROQ_API_KEY"):
        raise RuntimeError("GROQ_API_KEY not found in environment")
    
    # Load documents
    if not EVIDENCE_FOLDER.exists():
        EVIDENCE_FOLDER.mkdir(parents=True, exist_ok=True)
    
    txt_files = list(EVIDENCE_FOLDER.glob("*.txt"))
    if not txt_files:
        raise RuntimeError(f"No evidence files in {EVIDENCE_FOLDER}")
    
    rag.evidence_files = [f.name for f in txt_files]
    print(f"📁 Found {len(txt_files)} evidence files")
    
    # Load and chunk documents
    loader = DirectoryLoader(
        str(EVIDENCE_FOLDER),
        glob="*.txt",
        loader_cls=TextLoader,
        show_progress=False
    )
    documents = loader.load()
    
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""]
    )
    chunks = text_splitter.split_documents(documents)
    print(f"🔪 Created {len(chunks)} chunks")
    
    # Create vector store (using HuggingFace Inference API - no torch needed)
    hf_token = os.getenv("HF_API_TOKEN", "")
    embeddings = HFAPIEmbeddings(model_name=EMBEDDING_MODEL, api_key=hf_token)
    vector_store = FAISS.from_documents(documents=chunks, embedding=embeddings)
    print("✅ Vector store created")
    
    # Create retriever
    rag.retriever = vector_store.as_retriever(
        search_type="similarity",
        search_kwargs={"k": TOP_K_RESULTS}
    )
    
    # Create chain
    llm = ChatGroq(model=LLM_MODEL, temperature=0.7)
    prompt = ChatPromptTemplate.from_template(DETECTIVE_SYSTEM_PROMPT)
    
    rag.chain = (
        {"context": rag.retriever | format_docs, "question": RunnablePassthrough()}
        | prompt
        | llm
        | StrOutputParser()
    )
    
    rag.is_ready = True
    print("🤖 RAG system ready!")


def extract_pdf_text(pdf_path: Path) -> str:
    """Extract text content from a PDF file."""
    from PyPDF2 import PdfReader
    reader = PdfReader(str(pdf_path))
    text_parts = []
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text_parts.append(page_text)
    return "\n\n".join(text_parts)


# =============================================================================
# FASTAPI APP
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize RAG on startup."""
    initialize_rag()
    yield


app = FastAPI(
    title="Cold Case Detective API",
    description="RAG-powered detective assistant for analyzing evidence",
    version="1.0.0",
    lifespan=lifespan
)

# CORS for frontend
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class QueryRequest(BaseModel):
    question: str


class SourceDocument(BaseModel):
    filename: str
    content: str


class QueryResponse(BaseModel):
    answer: str
    sources: list[SourceDocument]


class HealthResponse(BaseModel):
    status: str
    evidence_files: int
    is_ready: bool


# =============================================================================
# ENDPOINTS
# =============================================================================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Check if the service is healthy and ready."""
    return HealthResponse(
        status="healthy" if rag.is_ready else "initializing",
        evidence_files=len(rag.evidence_files),
        is_ready=rag.is_ready
    )


@app.get("/sources")
async def get_sources():
    """Get list of loaded evidence files."""
    return {"files": rag.evidence_files}


@app.post("/query", response_model=QueryResponse)
async def query_detective(request: QueryRequest):
    """Ask the detective a question about the evidence."""
    if not rag.is_ready:
        raise HTTPException(status_code=503, detail="RAG system not ready")
    
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    
    try:
        # Get response from chain
        answer = rag.chain.invoke(request.question)
        
        # Get source documents
        docs = rag.retriever.invoke(request.question)
        sources = [
            SourceDocument(
                filename=Path(doc.metadata.get('source', 'unknown')).name,
                content=doc.page_content[:200] + "..." if len(doc.page_content) > 200 else doc.page_content
            )
            for doc in docs
        ]
        
        return QueryResponse(answer=answer, sources=sources)
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# FILE UPLOAD
# =============================================================================

@app.post("/upload")
async def upload_evidence(file: UploadFile = File(...)):
    """Upload a PDF or TXT evidence file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    # Validate file type
    ext = Path(file.filename).suffix.lower()
    if ext not in [".txt", ".pdf"]:
        raise HTTPException(status_code=400, detail="Only .txt and .pdf files are supported")
    
    try:
        # Save the uploaded file
        save_path = EVIDENCE_FOLDER / file.filename
        with open(save_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        # If PDF, extract text and save as .txt
        txt_filename = file.filename
        if ext == ".pdf":
            text_content = extract_pdf_text(save_path)
            if not text_content.strip():
                save_path.unlink()  # Remove empty PDF
                raise HTTPException(status_code=400, detail="Could not extract text from PDF")
            txt_filename = Path(file.filename).stem + ".txt"
            txt_path = EVIDENCE_FOLDER / txt_filename
            with open(txt_path, "w", encoding="utf-8") as f:
                f.write(text_content)
        
        # Re-index the vector store
        initialize_rag()
        
        return {
            "message": f"Evidence file '{file.filename}' uploaded successfully",
            "filename": txt_filename,
            "files": rag.evidence_files
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


# =============================================================================
# EVIDENCE READER
# =============================================================================

@app.get("/evidence/{filename}")
async def read_evidence(filename: str):
    """Read the full content of an evidence file."""
    file_path = EVIDENCE_FOLDER / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Evidence file '{filename}' not found")
    
    if not file_path.suffix == ".txt":
        raise HTTPException(status_code=400, detail="Only .txt files can be read")
    
    try:
        content = file_path.read_text(encoding="utf-8")
        return {"filename": filename, "content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")


# =============================================================================
# INVESTIGATION TIPS
# =============================================================================

@app.get("/tips")
async def get_tips():
    """Get investigation tips with suggested queries."""
    tips = [
        {"text": "Ask about specific suspects", "query": "Who are the main suspects in this case and what are their motives?"},
        {"text": "Query timeline of events", "query": "What is the complete timeline of events on the night of the crime?"},
        {"text": "Look for connections", "query": "Are there any connections or contradictions between the witness statements?"},
        {"text": "Request evidence summary", "query": "Give me a complete summary of all physical evidence found at the crime scene."},
        {"text": "Check financial motives", "query": "Is there any financial evidence or motive related to this case?"},
        {"text": "Analyze witness credibility", "query": "How credible are the witness statements? Are there any inconsistencies?"},
    ]
    return {"tips": tips}


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
