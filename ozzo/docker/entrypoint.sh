#!/bin/sh
set -eu

# Apply pending migrations, then start the server (exec so SIGTERM reaches node).
npx prisma migrate deploy
exec node dist/index.js
