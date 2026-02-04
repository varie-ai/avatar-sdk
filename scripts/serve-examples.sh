#!/bin/bash
# serve-examples.sh - Serve browser examples for testing
#
# Usage: ./scripts/serve-examples.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Ensure dist is built
if [[ ! -f "dist/index.js" ]]; then
  echo "Building SDK first..."
  npm run build
fi

PORT=${1:-3000}

echo ""
echo "Starting local server..."
echo ""
echo "  Browser example: http://localhost:$PORT/examples/browser/"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Use Python's built-in server (available on macOS)
python3 -m http.server $PORT
