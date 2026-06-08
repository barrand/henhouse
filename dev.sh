#!/bin/bash
# Start Firebase emulators + Vite dev server together.
# Usage: ./dev.sh
# Stop: Ctrl+C (kills both processes)

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Build functions before starting emulators
echo "🔨 Building functions..."
(cd "$ROOT/functions" && npm run build)

# Start Firebase emulators in background
echo "🔥 Starting Firebase emulators..."
firebase emulators:start --project flock-together-game &
EMULATOR_PID=$!

# Give emulators a moment to initialize
sleep 5

# Start Vite dev server in foreground
echo "⚡ Starting Vite dev server..."
(cd "$ROOT" && npm run dev) &
VITE_PID=$!

# Handle Ctrl+C — kill both processes cleanly
trap "echo ''; echo 'Shutting down...'; kill $EMULATOR_PID $VITE_PID 2>/dev/null; exit 0" INT TERM

# Wait for either process to exit
wait $VITE_PID $EMULATOR_PID
