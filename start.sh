#!/bin/bash

echo "==================================================="
echo "      MEMORY PALACE 3D - STARTUP SCRIPT"
echo "==================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}ERROR: Python3 is not installed${NC}"
    echo "Please install Python3: sudo apt install python3 python3-pip"
    exit 1
fi

# Function to kill processes on specific ports
kill_port() {
    local port=$1
    local pid=$(lsof -t -i:$port)
    if [ ! -z "$pid" ]; then
        echo -e "${YELLOW}Killing process on port $port (PID: $pid)${NC}"
        kill -9 $pid
        sleep 1
    fi
}

# Kill any existing processes on our ports
echo -e "${YELLOW}[0/3] Checking for existing processes...${NC}"
kill_port 8000
kill_port 3000

# Start backend
echo -e "${GREEN}[1/3] Starting Backend Server...${NC}"
echo "--------------------------------"
cd backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"
cd ..

# Wait for backend to start
echo "Waiting for backend to initialize..."
sleep 5

# Start frontend
echo -e "${GREEN}[2/3] Starting Frontend Server...${NC}"
echo "--------------------------------"
cd frontend
python3 -m http.server 3000 &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"
cd ..

# Wait for frontend to start
sleep 3

# Open browser (works on WSL and Linux)
echo -e "${GREEN}[3/3] Opening Browser...${NC}"
echo "--------------------------------"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if grep -q Microsoft /proc/version; then
        # WSL
        cmd.exe /c start http://localhost:3000 2>/dev/null
    else
        # Native Linux
        xdg-open http://localhost:3000 2>/dev/null || open http://localhost:3000 2>/dev/null
    fi
fi

echo ""
echo "==================================================="
echo -e "${GREEN}    ALL SERVICES STARTED SUCCESSFULLY!${NC}"
echo "==================================================="
echo ""
echo "Backend API:  http://localhost:8000"
echo "Frontend UI:  http://localhost:3000"
echo "API Docs:     http://localhost:8000/docs"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all servers${NC}"
echo ""

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Stopping servers...${NC}"
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    kill_port 8000
    kill_port 3000
    echo -e "${GREEN}Servers stopped. Goodbye!${NC}"
    exit 0
}

# Trap Ctrl+C and cleanup
trap cleanup INT

# Keep script running
while true; do
    sleep 1
done