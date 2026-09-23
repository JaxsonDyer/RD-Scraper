#!/bin/bash

set -u

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo "Checking MySQL..."
cd backend
if ! uv run python docker_utils.py; then
    echo "MySQL could not be started. Make sure Docker Desktop is running."
    exit 1
fi
cd ..

echo "Starting Backend API (Port 5000)..."
cd backend
uv run flask run &
BACKEND_PID=$!
cd ..

echo "Starting Next.js Frontend (Port 3000)..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

# Handle shutdown gracefully
trap "echo -e '\nShutting down servers...'; kill $BACKEND_PID $FRONTEND_PID; exit" SIGINT SIGTERM

echo "====================================="
echo "Both servers are currently running!"
echo "➡️  Frontend: http://localhost:3000"
echo "➡️  Backend:  http://127.0.0.1:5000"
echo "Press Ctrl+C to stop both."
echo "====================================="

wait
