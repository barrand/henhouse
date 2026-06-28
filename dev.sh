#!/usr/bin/env bash
# Clean-start Firebase emulators + Vite dev server.
#
# Usage:
#   npm run dev:local
#   ./dev.sh
#
# This intentionally frees the local emulator/Vite ports before startup. It is
# meant for development only.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ID="${FIREBASE_PROJECT_ID:-flock-together-game}"
FIREBASE_CLI="${FIREBASE_CLI:-npx -y firebase-tools@latest}"

EMULATOR_PORTS=(4000 4400 4500 5001 5050 8080 9000 9099)
VITE_PORTS=(5173 5174 5175 5176 5177 5178 5179)
CHILD_PIDS=()

port_pids() {
  local port="$1"
  lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
}

wait_for_port_to_clear() {
  local port="$1"
  local attempts=20

  while [[ "$attempts" -gt 0 ]]; do
    if [[ -z "$(port_pids "$port")" ]]; then
      return 0
    fi
    attempts=$((attempts - 1))
    sleep 0.2
  done

  return 1
}

free_port() {
  local port="$1"
  local pids
  pids="$(port_pids "$port")"

  if [[ -z "$pids" ]]; then
    return 0
  fi

  echo "Freeing port $port (PID(s): $(echo "$pids" | tr '\n' ' '))"
  kill $pids 2>/dev/null || true

  if wait_for_port_to_clear "$port"; then
    return 0
  fi

  pids="$(port_pids "$port")"
  if [[ -n "$pids" ]]; then
    echo "Port $port is still busy; force-killing PID(s): $(echo "$pids" | tr '\n' ' ')"
    kill -9 $pids 2>/dev/null || true
  fi
}

cleanup() {
  echo ""
  echo "Shutting down local dev processes..."
  for pid in "${CHILD_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
}

wait_for_startup() {
  local name="$1"
  local pid="$2"
  local port="$3"
  local attempts="${4:-60}"

  while [[ "$attempts" -gt 0 ]]; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "$name exited before port $port opened."
      wait "$pid" 2>/dev/null || true
      return 1
    fi

    if [[ -n "$(port_pids "$port")" ]]; then
      sleep 0.5
      if ! kill -0 "$pid" 2>/dev/null; then
        echo "$name exited while opening port $port."
        wait "$pid" 2>/dev/null || true
        return 1
      fi
      return 0
    fi

    attempts=$((attempts - 1))
    sleep 0.5
  done

  echo "$name did not open port $port in time."
  return 1
}

trap cleanup INT TERM EXIT

echo "Cleaning local Firebase emulator ports..."
for port in "${EMULATOR_PORTS[@]}"; do
  free_port "$port"
done

echo "Cleaning common Vite ports..."
for port in "${VITE_PORTS[@]}"; do
  free_port "$port"
done

echo "Building functions..."
(cd "$ROOT/functions" && npm run build)

echo "Starting Firebase emulators for project $PROJECT_ID..."
(cd "$ROOT" && $FIREBASE_CLI emulators:start --project "$PROJECT_ID") &
EMULATOR_PID=$!
CHILD_PIDS+=("$EMULATOR_PID")

wait_for_startup "Firebase emulators" "$EMULATOR_PID" 8080 90
wait_for_startup "Auth emulator" "$EMULATOR_PID" 9099 60
wait_for_startup "Functions emulator" "$EMULATOR_PID" 5001 60
wait_for_startup "Realtime Database emulator" "$EMULATOR_PID" 9000 60
wait_for_startup "Firebase Emulator UI" "$EMULATOR_PID" 4000 60

# The Firebase CLI opens ports before every emulator has finished publishing
# callable definitions. Give the browser a small buffer so anonymous auth and
# callable setup do not race the final emulator initialization logs.
sleep 3

echo "Re-cleaning Vite ports after emulator startup..."
for port in "${VITE_PORTS[@]}"; do
  free_port "$port"
done

echo "Starting Vite dev server..."
(cd "$ROOT" && exec ./node_modules/.bin/vite --host localhost --port 5173 --strictPort) &
VITE_PID=$!
CHILD_PIDS+=("$VITE_PID")

wait_for_startup "Vite" "$VITE_PID" 5173 40

echo ""
echo "Local app: http://localhost:5173/"
echo "Firebase Emulator UI: http://localhost:4000/"
echo "Press Ctrl+C to stop everything."

wait "$VITE_PID" "$EMULATOR_PID"
