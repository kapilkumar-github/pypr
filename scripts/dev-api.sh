#!/usr/bin/env bash
# Runs the Go API and rebuilds/restarts it when a .go, go.mod or go.sum file changes.
# Reads backend/.env (ADDR etc). No extra tools: polls file mtimes every second.
set -uo pipefail
cd "$(dirname "$0")/../backend"

bin=$(mktemp -u /tmp/pypr-api.XXXXXX)
pid=""
stamp=$(mktemp)
trap 'kill "$pid" 2>/dev/null; rm -f "$bin" "$stamp"' EXIT

start() {
  [ -n "$pid" ] && { kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null; }
  touch "$stamp"
  if go build -o "$bin" ./cmd/api; then
    echo "[dev-api] $(date +%T) started"
    "$bin" &
    pid=$!
  else
    echo "[dev-api] $(date +%T) build failed, waiting for next change" >&2
    pid=""
  fi
}

changed() {
  [ -n "$(find . \( -name '*.go' -o -name go.mod -o -name go.sum -o -name '*.sql' \) -newer "$stamp" -print -quit)" ]
}

start
while sleep 1; do
  if changed; then
    echo "[dev-api] change detected, rebuilding"
    start
  fi
done
