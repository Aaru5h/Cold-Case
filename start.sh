#!/bin/bash

# Cold Case Detective - Start All Services
# =========================================
# This script starts all three services needed for the application

echo "🔍 Cold Case Detective - Starting Services..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down services..."
    pkill -f "uvicorn api:app" 2>/dev/null
    pkill -f "node backend/index.js" 2>/dev/null
    pkill -f "next dev" 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

echo "Starting services in background..."
echo ""

# Start Python API
echo -e "${YELLOW}[1/3]${NC} Starting Python RAG API on port 8000..."
cd "$SCRIPT_DIR/rag-service"
python3 -m uvicorn api:app --host 0.0.0.0 --port 8000 &
sleep 3

# Start Express Server
echo -e "${YELLOW}[2/3]${NC} Starting Express Server on port 5001..."
cd "$SCRIPT_DIR/backend"
node index.js &
sleep 2

# Start Next.js Frontend
echo -e "${YELLOW}[3/3]${NC} Starting Next.js Frontend on port 3000..."
cd "$SCRIPT_DIR/frontend"
npm run dev &
sleep 3

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}           🔍 All Services Running! 🔍                      ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Frontend:    ${GREEN}http://localhost:3000${NC}"
echo -e "  Express API: ${YELLOW}http://localhost:5001${NC}"
echo -e "  Python API:  ${YELLOW}http://localhost:8000${NC}"
echo ""
echo -e "  Press ${RED}Ctrl+C${NC} to stop all services"
echo ""

# Wait for any child process
wait
