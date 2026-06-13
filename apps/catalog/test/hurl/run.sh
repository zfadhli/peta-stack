#!/bin/bash
set -e

cd "$(dirname "$0")/../.."

HOST="http://localhost:4000"
CATALOG_DB="catalog.db"

# Clean up any previous run
rm -f "$CATALOG_DB"

# Run seed to create users with proper roles
echo "Seeding test data..."
bun run test/hurl/seed.ts
echo "Seed complete."

# Start the server on port 4000
echo "Starting server on port 4000..."
PORT=4000 bun run src/index.ts &
SERVER_PID=$!

# Wait for the server to be ready
sleep 2

# Run all hurl tests
echo "Running Hurl tests..."
hurl --test --no-cookie-store --variable HOST="$HOST" test/hurl/*.hurl || TEST_FAILED=true

# Clean up
echo "Stopping server..."
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true
rm -f "$CATALOG_DB"

if [ "$TEST_FAILED" = true ]; then
  echo "Some tests failed."
  exit 1
fi

echo "All tests passed."
