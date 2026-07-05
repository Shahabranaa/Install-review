---
name: Expo web apps and the runTest/Playwright testing tool
description: runTest's browser can resolve an Expo app's dev-domain URL to the wrong artifact; screenshot tool works, runTest may not.
---

The `screenshot` tool (type=app_preview) correctly loads an Expo Router web app directly via its dedicated Expo dev domain (`https://<repl-id>.expo.pike.replit.dev/<path>`), bypassing the shared path-based proxy, and reliably shows the right app.

The `runTest` (Playwright-based testing subagent) tool, given that same absolute Expo dev domain URL, has been observed to intermittently land on a completely different artifact's login page (e.g. an unrelated web artifact's login screen) instead of the Expo app — even with a fresh/isolated browser context. Symptoms included unrelated error strings (e.g. "Contact your administrator...", "InstallReview" heading) that don't exist in the target Expo app's source at all.

**Why:** The two tools apparently resolve/proxy the Expo dev domain differently; `runTest` may not special-case Expo apps the way the screenshot tool does, so it can fall through to the shared proxy's default routing instead of hitting the Metro/Expo web dev server directly.

**How to apply:** If browser e2e testing (`runTest`) of an Expo/React Native Web artifact gives bizarre, inconsistent, or clearly-wrong-app results even though `screenshot` confirms the app itself renders correctly on the same URL, suspect this routing mismatch rather than a real app bug. Fall back to: (1) manual `screenshot` verification of UI states, (2) direct API testing via curl/bash against the backend endpoints, and (3) careful code review, and clearly document the tooling limitation instead of endlessly retrying `runTest` against the Expo domain.
