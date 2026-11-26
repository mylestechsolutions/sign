#!/bin/sh
# assets/core.js is the only source of the shared rules; Apps Script gets an exact copy.
set -eu
cd "$(dirname "$0")/.."
mkdir -p apps-script
cp assets/core.js apps-script/core.js
echo "apps-script/core.js copied from assets/core.js"
