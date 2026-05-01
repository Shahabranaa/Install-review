#!/usr/bin/env bash
set -e

pnpm install
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/image-review run build
BASE_PATH=/workforce/ pnpm --filter @workspace/workforce run build
mkdir -p artifacts/image-review/dist/public/workforce
cp -r artifacts/workforce/dist/public/. artifacts/image-review/dist/public/workforce/
