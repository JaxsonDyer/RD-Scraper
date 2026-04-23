#!/bin/bash

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
