#!/bin/bash
set -e
pnpm install --frozen-lockfile
node lib/db/migrate.mjs
