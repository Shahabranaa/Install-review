#!/bin/bash
set -e

echo "Building API server..."
pnpm --filter @workspace/api-server run build

echo "Building worker portal..."
pnpm --filter @workspace/worker-portal run build

echo "Preparing static files..."
rm -rf public/worker-portal
mkdir -p public/worker-portal
cp -r artifacts/worker-portal/dist/public/. public/worker-portal/

echo "Build complete!"
