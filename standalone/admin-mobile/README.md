# Admin Mobile App

A standalone Expo app for admins of the Workforce Compliance system: sign in,
view the compliance dashboard, review pending certification submissions,
message workers, and look up worker profiles.

This project is **not** part of the pnpm monorepo/workspace and is not
registered as a Replit artifact (Replit only allows one native mobile
artifact per project, and that slot is used by the worker mobile app). It's
meant to be copied out of this workspace and run/built independently — for
example on your own computer, or in a separate Replit project.

It talks to your existing Workforce Compliance backend over HTTPS using the
same `/api/auth/*` and `/api/workforce/*` endpoints the web app and worker
mobile app already use. No backend changes are required.

## 1. Copy this folder out

Copy the entire `admin-mobile` folder to your own machine (or a fresh Expo
project location). You do not need the rest of this repo.

## 2. Point it at your backend

Edit `lib/config.ts` and set `API_DOMAIN` to the domain where your backend is
deployed, e.g.:

```ts
export const API_DOMAIN = "workforce.spx.site";
```

Use the same domain the Workforce Compliance web app and worker mobile app
already use.

## 3. Install dependencies

```bash
npm install
```

(or `yarn` / `pnpm install` if you prefer — this project has no dependency on
the original monorepo's pnpm workspace).

## 4. Run it

```bash
npx expo start
```

Scan the QR code with Expo Go on your phone, or press `i` / `a` to open an
iOS Simulator / Android emulator.

## 5. Build a real app (optional)

To produce an installable build (APK / IPA) via EAS:

```bash
npm install -g eas-cli
eas login
eas build --profile preview --platform android
```

See `eas.json` for the preview/production build profiles (mirrors the setup
used for the worker mobile app).

## What's included

- **Login** — admin-only sign-in against `/api/auth/unified-login`; worker
  accounts are rejected with a clear message.
- **Dashboard** — compliance stats and per-site breakdown
  (`/api/workforce/dashboard`, `/api/workforce/sites-with-stats`).
- **Review Queue** — approve/reject pending certification submissions
  (`/api/workforce/review-queue` + verify/reject endpoints), with a link to
  view the uploaded file.
- **Messages** — compose and send Email/Push messages to one or more workers
  and view recent delivery logs (`/api/workforce/emails/send`,
  `/api/workforce/emails/logs`).
- **Workers** — search workers and view a read-only profile with site
  assignments and certification status (`/api/workforce/workers`,
  `/api/workforce/workers/:id`).

## Notes

- Sessions are stored as a cookie in `AsyncStorage` (same approach as the
  worker mobile app), attached to each request via a `Cookie` header.
- Admin push notification registration is not included — this app only
  triggers pushes *to workers*, it doesn't need to receive them itself.
- Full parity with every Workforce Compliance web page (clients, PPE types,
  roles, schedule requests, etc.) is intentionally out of scope; this app
  covers the on-the-go admin tasks only.
