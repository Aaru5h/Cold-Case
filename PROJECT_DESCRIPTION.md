# Project Breakdown

**Description:**
A context-driven chatbot application, "Cold Case Detective", that dynamically spins up a dedicated investigative chat interface based on uploaded context (evidence files). The system uses Retrieval-Augmented Generation (RAG) to allow users to interrogate case files through a specialized "Detective" persona, with all interactions persists for long-term case management.

**TechStack:**
- **Frontend:** Next.js 14, Tailwind CSS (Noir Theme)
- **Database:** MongoDB
- **Backend:** Express.js (API Layer), Python (RAG Service, LangChain, FAISS)
- **AI Model:** Groq (Llama 3) via LangChain

**Features:**
- **Dynamic Context Loading:** Creates a unique chat environment based on the specific set of evidence files provided by the user.
- **Persistent Investigations:** Automatically saves all chat logs, user queries, and bot responses to MongoDB, allowing users to pause and resume investigations.
- **Evidence-Based Responses:** The bot answers questions strictly based on the provided context, citing specific files and excerpts to maintain accuracy.
- **Interactive Evidence Board:** Users can upload and manage text-based evidence files that instantly update the bot's knowledge base.
- **Thematic Persona:** The AI embodies a "Veteran Detective" persona to guide the user through the investigative process with immersive dialogue.
