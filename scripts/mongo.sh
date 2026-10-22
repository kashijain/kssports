#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if lsof -iTCP:27017 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "MongoDB is already listening on 27017"
  exit 0
fi

BIN="$ROOT/.tools/mongodb/bin/mongod"
if [[ ! -x "$BIN" ]]; then
  BIN="$(command -v mongod || true)"
fi
if [[ -z "${BIN}" ]]; then
  echo "MongoDB is not installed. Start your own server or set MONGODB_URI."
  exit 1
fi

mkdir -p "$ROOT/.data/mongo"
"$BIN" --dbpath "$ROOT/.data/mongo" --bind_ip 127.0.0.1 --port 27017 --fork --logpath "$ROOT/.data/mongo/mongod.log"
echo "MongoDB started on 127.0.0.1:27017"
