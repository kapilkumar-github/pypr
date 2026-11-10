#!/usr/bin/env bash
# Starts the Next.js dev server reachable over Tailscale (bound to all interfaces).
# Backend must already be running on BACKEND_PORT (default 8081); /api is proxied to it.
set -euo pipefail
cd "$(dirname "$0")/../web"

port=${WEB_PORT:-3000}
backend_port=${BACKEND_PORT:-8081}

if ! curl -s -o /dev/null --max-time 2 "http://localhost:$backend_port/"; then
  echo "warning: nothing answering on localhost:$backend_port (backend not running?)" >&2
fi

ts_ip=""
if command -v tailscale >/dev/null 2>&1; then
  ts_ip=$(tailscale ip -4 2>/dev/null | head -n1 || true)
  [ -n "$ts_ip" ] && echo "web: http://$ts_ip:$port (tailscale)"
fi
# Allow dev assets/HMR from the Tailscale IP and this machine's hostname and any Tailscale MagicDNS name (*.ts.net, *.*.ts.net).
export NEXT_DEV_ALLOWED_ORIGINS="${ts_ip:+$ts_ip,}$(hostname),*.ts.net,*.*.ts.net"
echo "web: http://localhost:$port (local), backend proxy -> localhost:$backend_port"

export BACKEND_URL="http://localhost:$backend_port"
exec npx next dev --hostname 0.0.0.0 --port "$port"
