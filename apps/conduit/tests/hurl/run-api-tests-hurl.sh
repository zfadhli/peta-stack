#!/usr/bin/env bash
# Run the RealWorld Hurl test suite against a running conduit server.
#
# Usage:
#   HOST=http://localhost:3001 ./tests/hurl/run-api-tests-hurl.sh
#
# Requires: hurl (https://hurl.dev) installed on your machine.
# Install: brew install hurl  OR  see https://hurl.dev/docs/installation.html
#
# Default HOST points to the conduit API running on port 3001.

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
HOST="${HOST:-http://localhost:3001}"
UID_VAL="${UID_VAL:-$(date +%s)$$}"

echo "================================================================="
echo " RealWorld Conduit API Test Suite"
echo " Host: $HOST"
echo " UID:  $UID_VAL"
echo "================================================================="

FILES=("$@")
if [ ${#FILES[@]} -eq 0 ]; then
  FILES=("$DIR"/hurl/*.hurl)
fi

hurl --test \
  --jobs 1 \
  --variable "host=$HOST" \
  --variable "uid=$UID_VAL" \
  "${FILES[@]}"

echo "All tests passed!"
