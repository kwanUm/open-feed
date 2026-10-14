#!/bin/bash
# Bundles the worker-safe export pipeline (formatter + zip writer) into
# public/export-core.js as the `OpenFeedExport` global.
#
# background.js is a classic service worker, not an ES module, so it cannot
# import from src/. It loads this bundle with importScripts instead. Vite copies
# public/ into dist/ verbatim, so this has to run before the Vite build.
set -euo pipefail

echo 'Bundling export core for the service worker...'
npx esbuild src/utils/exportCore.ts \
  --bundle \
  --format=iife \
  --global-name=OpenFeedExport \
  --target=es2020 \
  --outfile=public/export-core.js \
  --log-level=warning
