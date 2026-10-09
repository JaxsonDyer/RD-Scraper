#!/bin/bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_PID=""
FRONTEND_PID=""
cleanup() {
  if [ -n "$WORKER_PID" ]; then kill "$WORKER_PID" 2>/dev/null || true; fi
  if [ -n "$FRONTEND_PID" ]; then kill "$FRONTEND_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT
trap 'exit 0' INT TERM
# Local development only. Production uses Vercel plus a separate worker.
(cd "$PROJECT_DIR/backend" && uv run python worker.py --log-file "$PROJECT_DIR/backend/logs/worker.log") &
WORKER_PID=$!
(cd "$PROJECT_DIR/frontend" && npm run dev) &
FRONTEND_PID=$!
wait
