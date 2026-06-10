#!/bin/sh
set -e
cd ../..
BASE_PATH=/ pnpm --filter @workspace/workforce run build
pnpm --filter @workspace/worker-portal run build
mkdir -p artifacts/workforce/dist/public/worker-portal
cp -r artifacts/worker-portal/dist/public/. artifacts/workforce/dist/public/worker-portal/
