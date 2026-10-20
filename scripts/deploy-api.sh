#!/usr/bin/env bash
# Deploys the API to the home server (decision D26).
#   scripts/deploy-api.sh            build the current commit here, ship it over SSH, start it
#   scripts/deploy-api.sh rollback   switch back to the previously deployed image
# Needs: Docker here, SSH access as $PYPR_SERVER (default "homeserver"), and ~/pypr-api/api.env
# on the server. Database migrations are a separate, deliberate step (see docs/deployment.md).
set -euo pipefail

SERVER="${PYPR_SERVER:-homeserver}"
DIR="pypr-api"
cd "$(dirname "$0")/.."

if [ "${1:-}" = "rollback" ]; then
  ssh "$SERVER" "set -e; cd $DIR
    prev=\$(grep -s '^PYPR_API_PREVIOUS_TAG=' .env | cut -d= -f2)
    cur=\$(grep -s '^PYPR_API_TAG=' .env | cut -d= -f2)
    [ -n \"\$prev\" ] || { echo 'No previous image to roll back to'; exit 1; }
    printf 'PYPR_API_TAG=%s\nPYPR_API_PREVIOUS_TAG=%s\n' \"\$prev\" \"\$cur\" > .env
    docker compose up -d --wait
    echo \"Rolled back to pypr-api:\$prev\""
  exit 0
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Commit your changes first: the image tag is the commit." >&2
  exit 1
fi
TAG="$(git rev-parse --short=12 HEAD)"

echo "Building pypr-api:$TAG"
docker build --platform linux/amd64 -f apps/api/Dockerfile -t "pypr-api:$TAG" .

echo "Copying the image to $SERVER"
docker save "pypr-api:$TAG" | gzip | ssh "$SERVER" 'gunzip | docker load'

ssh "$SERVER" "mkdir -p $DIR"
scp -q deploy/home-server/compose.yml "$SERVER:$DIR/compose.yml"

ssh "$SERVER" "set -e; cd $DIR
  test -f api.env || { echo 'Missing ~/$DIR/api.env (see deploy/home-server/api.env.example)'; exit 1; }
  cur=\$(grep -s '^PYPR_API_TAG=' .env | cut -d= -f2 || true)
  printf 'PYPR_API_TAG=%s\nPYPR_API_PREVIOUS_TAG=%s\n' '$TAG' \"\$cur\" > .env
  docker compose up -d --wait
  curl -fsS http://127.0.0.1:8081/api/health; echo
  echo 'Deployed pypr-api:$TAG'"
