---
name: Standalone Expo apps outside the monorepo
description: How to add a second native mobile app when the project's one Expo artifact slot is already taken.
---

Replit only allows one registered native mobile (Expo) artifact per project. If a
second admin/companion mobile app is requested and an Expo artifact already
exists, do not try to register a second one — it will conflict.

**Why:** the artifacts system enforces a single native-mobile-artifact slot; a
second `artifact.toml` of kind `mobile` is not supported.

**How to apply:** scaffold the new app as a fully independent Expo project under
`standalone/<name>/` with its own `package.json` (pinned versions matching the
existing artifact's resolved versions, not `catalog:`/`workspace:*` refs since it
is meant to be copied out and run on its own), `app.json`, `babel.config.js`,
`metro.config.js`, `tsconfig.json`, and `eas.json`. Mirror the working artifact's
config patterns exactly (e.g. `babel-preset-expo` alone is enough to resolve
`@/*` tsconfig path aliases — no extra module-resolver plugin needed). It is not
a registered artifact, has no workflow, and isn't run inside this workspace; ship
a README with copy-out/install/run/EAS-build instructions since the user runs it
elsewhere.
