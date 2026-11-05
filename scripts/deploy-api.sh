#!/usr/bin/env bash
# Builds the Go API image on the home server and restarts it.
# Needs: ssh host "homeserver", and ~/pypr-go-api/api.env on the server.
set -euo pipefail
cd "$(dirname "$0")/.."

host=${DEPLOY_HOST:-homeserver}
dir=pypr-go-api
tag=$(git rev-parse --short=12 HEAD)
if [ -n "$(git status --porcelain backend deploy)" ]; then tag="$tag-dirty"; fi

rsync -az --delete --exclude .env --exclude bin/ backend/ "$host:$dir/src/"
rsync -az deploy/homeserver/compose.yml "$host:$dir/compose.yml"
ssh "$host" bash -s -- "$dir" "$tag" <<'REMOTE'
set -euo pipefail
dir=$1 tag=$2
cd ~/"$dir"
test -f api.env || { echo "missing ~/$dir/api.env" >&2; exit 1; }
docker build -q -t "pypr-go-api:$tag" src
echo "PYPR_API_TAG=$tag" > .env
docker compose up -d --remove-orphans
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8081/api/health >/dev/null 2>&1; then echo "healthy: pypr-go-api:$tag"; exit 0; fi
  sleep 2
done
docker compose logs --tail 50 api >&2
exit 1
REMOTE
