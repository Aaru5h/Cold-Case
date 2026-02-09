"""
Cold Case Detective - RAG Application
=====================================
A Retrieval-Augmented Generation application that uses LangChain to 
analyze evidence files and answer questions like a veteran detective.

Usage:
    1. Place evidence .txt files in the /evidence folder
    2. Set your GROQ_API_KEY in a .env file (free at console.groq.com)
    3. Run: python main.py
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# LangChain imports
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

# Load environment variables from .env file
load_dotenv()


# =============================================================================
# CONFIGURATION
# =============================================================================

# Path to the evidence folder (relative to this script)
EVIDENCE_FOLDER = Path(__file__).parent / "evidence"

# Chunking parameters
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50

# Retriever settings
TOP_K_RESULTS = 3

# Model settings (Groq = FREE cloud LLM, HuggingFace = FREE local embeddings)
EMBEDDING_MODEL = "all-MiniLM-L6-v2"  # Fast, runs locally, no API needed
LLM_MODEL = "llama-3.1-8b-instant"  # Fast Groq model (free tier)

# Detective system prompt
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
# DATA INGESTION
# =============================================================================

def load_evidence_files(evidence_folder: Path) -> list:
    """
    Load all .txt files from the evidence folder.
    
    Args:
        evidence_folder: Path to the folder containing evidence .txt files
        
    Returns:
        List of Document objects with file content and metadata
    """
    if not evidence_folder.exists():
        print(f"⚠️  Creating evidence folder at: {evidence_folder}")
        evidence_folder.mkdir(parents=True, exist_ok=True)
        return []
    
    # Check for .txt files
    txt_files = list(evidence_folder.glob("*.txt"))
    if not txt_files:
        print(f"⚠️  No .txt files found in {evidence_folder}")
        return []
    
    print(f"📁 Found {len(txt_files)} evidence file(s):")
    for f in txt_files:
        print(f"   - {f.name}")
    
    # Load all .txt files from the evidence folder
    loader = DirectoryLoader(
        str(evidence_folder),
        glob="*.txt",
        loader_cls=TextLoader,
        show_progress=True
    )
    
    documents = loader.load()
    print(f"✅ Loaded {len(documents)} document(s) into memory")
    
    return documents


# =============================================================================
# CHUNKING
# =============================================================================

def chunk_documents(documents: list) -> list:
    """
    Split documents into smaller chunks for efficient retrieval.
    
    Uses RecursiveCharacterTextSplitter which tries to split on:
    - Paragraphs (\\n\\n)
    - Lines (\\n)
    - Sentences (. ! ?)
    - Words (spaces)
    
    Args:
        documents: List of Document objects
        
    Returns:
        List of chunked Document objects
    """
    if not documents:
        return []
    
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""]
    )
    
    chunks = text_splitter.split_documents(documents)
    print(f"🔪 Split into {len(chunks)} chunks (size={CHUNK_SIZE}, overlap={CHUNK_OVERLAP})")
    
    return chunks


# =============================================================================
# VECTOR STORE
# =============================================================================

def create_vector_store(chunks: list) -> FAISS:
    """
    Create a FAISS vector store from document chunks.
    
    Uses HuggingFace's all-MiniLM-L6-v2 model for generating embeddings.
    
    Args:
        chunks: List of chunked Document objects
        
    Returns:
        FAISS vector store instance
    """
    if not chunks:
        raise ValueError("No chunks provided to create vector store")
    
    # Initialize HuggingFace embeddings (runs locally, no API needed)
    embeddings = HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL,
    )
    
    print(f"🧠 Creating vector store with {EMBEDDING_MODEL} (local)...")
    
    # Create FAISS vector store from documents
    vector_store = FAISS.from_documents(
        documents=chunks,
        embedding=embeddings
    )
    
    print(f"✅ Vector store created with {len(chunks)} vectors")
    
    return vector_store


# =============================================================================
# RETRIEVER & RAG CHAIN
# =============================================================================

def format_docs(docs):
    """Format retrieved documents with source info for context."""
    formatted = []
    for doc in docs:
        source = Path(doc.metadata.get('source', 'unknown')).name
        formatted.append(f"[Source: {source}]\n{doc.page_content}")
    return "\n\n---\n\n".join(formatted)


def create_detective_chain(vector_store: FAISS):
    """
    Create the complete RAG chain with detective persona using LCEL.
    
    Sets up:
    - Retriever (top 3 most relevant chunks)
    - LLM (Groq llama-3.1-8b-instant)
    - Detective system prompt
    - Full retrieval chain
    
    Args:
        vector_store: FAISS vector store instance
        
    Returns:
        Tuple of (chain, retriever) for Q&A
    """
    # Create retriever that fetches top 3 relevant chunks
    retriever = vector_store.as_retriever(
        search_type="similarity",
        search_kwargs={"k": TOP_K_RESULTS}
    )
    
    print(f"🔍 Retriever configured to fetch top {TOP_K_RESULTS} relevant chunks")
    
    # Initialize Groq LLM (free cloud API)
    llm = ChatGroq(
        model=LLM_MODEL,
        temperature=0.7,  # Some creativity for detective personality
    )
    
    # Create the prompt template
    prompt = ChatPromptTemplate.from_template(DETECTIVE_SYSTEM_PROMPT)
    
    # Create the RAG chain using LCEL (LangChain Expression Language)
    rag_chain = (
        {"context": retriever | format_docs, "question": RunnablePassthrough()}
        | prompt
        | llm
        | StrOutputParser()
    )
    
    print(f"🤖 Detective chain ready with {LLM_MODEL}")
    
    return rag_chain, retriever


# =============================================================================
# CLI INTERFACE
# =============================================================================

def print_banner():
    """Print the Cold Case Detective banner."""
    banner = """
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║                     🔍  COLD CASE DETECTIVE  🔍                               ║
║                    ─────────────────────────────                              ║
║                  Retrieval-Augmented Generation System                        ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
    """
    print(banner)


def run_cli(chain, retriever):
    """
    Run the interactive CLI loop for querying the detective.
    
    Args:
        chain: The RAG chain for processing queries
        retriever: The retriever for fetching source documents
    """
    print("\n" + "="*80)
    print("Type your questions to interrogate the evidence.")
    print("Commands: 'quit' or 'exit' to leave | 'help' for tips")
    print("="*80 + "\n")
    
    while True:
        try:
            # Get user input
            user_input = input("🕵️  Detective > ").strip()
            
            # Handle empty input
            if not user_input:
                continue
            
            # Handle exit commands
            if user_input.lower() in ['quit', 'exit', 'q']:
                print("\n📁 Case files secured. Until next time, Detective.\n")
                break
            
            # Handle help command
            if user_input.lower() == 'help':
                print("\n💡 Tips for interrogating the evidence:")
                print("   - Ask specific questions about events, people, or locations")
                print("   - Reference specific evidence if you remember filenames")
                print("   - Ask for connections between pieces of evidence")
                print("   - Request a summary of what we know so far\n")
                continue
            
            # Query the chain
            print("\n🔍 Analyzing evidence...\n")
            response = chain.invoke(user_input)
            
            # Display the detective's response
            print("═" * 80)
            print(f"\n{response}\n")
            print("═" * 80)
            
            # Fetch and show source documents
            docs = retriever.invoke(user_input)
            if docs:
                print(f"\n📎 Sources consulted: {len(docs)} evidence chunk(s)")
                for i, doc in enumerate(docs, 1):
                    source = Path(doc.metadata.get('source', 'unknown')).name
                    print(f"   [{i}] {source}")
            print()
            
        except KeyboardInterrupt:
            print("\n\n📁 Case files secured. Until next time, Detective.\n")
            break
        except Exception as e:
            print(f"\n❌ Error: {e}\n")


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

def main():
    """Main function to initialize and run the Cold Case Detective."""
    
    print_banner()
    
    # Check for Groq API key
    if not os.getenv("GROQ_API_KEY"):
        print("❌ Error: GROQ_API_KEY not found!")
        print("   Get your FREE API key from: https://console.groq.com/keys")
        print("   Then add it to a .env file:")
        print("   GROQ_API_KEY=your-api-key-here")
        return
    
    print("🚀 Initializing Cold Case Detective System...\n")
    
    # Step 1: Load evidence files
    print("📂 Step 1/4: Loading evidence files...")
    documents = load_evidence_files(EVIDENCE_FOLDER)
    
    if not documents:
        print("\n⚠️  No evidence files found!")
        print(f"   Add .txt files to: {EVIDENCE_FOLDER}")
        print("   Then restart the application.\n")
        return
    
    # Step 2: Chunk documents
    print("\n📄 Step 2/4: Chunking documents...")
    chunks = chunk_documents(documents)
    
    # Step 3: Create vector store
    print("\n🗄️  Step 3/4: Creating vector store...")
    vector_store = create_vector_store(chunks)
    
    # Step 4: Create detective chain
    print("\n🔗 Step 4/4: Setting up detective chain...")
    chain, retriever = create_detective_chain(vector_store)
    
    print("\n✅ System ready! The Cold Case Detective is at your service.")
    
    # Run the CLI
    run_cli(chain, retriever)


if __name__ == "__main__":
    main()

