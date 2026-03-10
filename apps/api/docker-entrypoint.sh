#!/bin/sh
set -e

echo "[Entrypoint] Running database migrations..."
cd /app
DATABASE_URL="$DATABASE_URL" node apps/api/dist/db/migrate.js || echo "[Entrypoint] Migration failed or already up to date"

echo "[Entrypoint] Starting API server..."
exec "$@"
