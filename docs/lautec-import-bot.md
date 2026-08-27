# Lautec manual DPR imports

## Scope and safeguards

An administrator can send exactly one selected DPR Capture date and team to Lautec from Capture. The import reads the date-named Google Sheet tab, validates the managed columns, and drives Lautec's visible Import Data interface in a headless browser. It does not call undocumented Lautec endpoints.

The managed Sheet header must be exactly:

`Activity Group, Activity, Location, Start, Finish, Comment, Team ID`

The first six columns are the Lautec destination values. `Team ID` is DPR-managed source metadata: it is required to isolate the selected team's rows and is never sent to Lautec. All destination fields except Comment are required. Start and Finish must be valid `HH:MM` values. PAX is deliberately cleared and never supplied.
For reliable completion within the browser runtime, a single import is limited to 75 rows.

Before a browser session starts, DPR stores the ordered source rows, date/team context, hash, operator, and started time in the import ledger. A completed identical hash is blocked unless the administrator explicitly confirms a re-send. At most one run may be active for a date/team. Only a run older than the 15-minute recovery window is marked interrupted before a new import starts; ordinary serverless cold starts never interrupt active work.

## Browser sequence and required server-only configuration

Administrators can configure the non-secret Login URL and an optional Direct DPR URL at **DPR Administration → DPR Mapping → Lautec**. The login URL defaults to `https://dpr.lautec.com/` and saved destinations take effect for future imports without a redeployment. A Direct DPR URL must be the verified Lautec DPR-details page for the intended date; one saved URL serves every team on that date. The browser verifies the visible date label, closes whichever team's Import Data grid the URL pre-opens (the URL pins one team's modal), selects the requested team tab, records the persisted activity-table baseline, and only then reopens the grid through the visible **Import Data** control before filling it. For the Capture date and team selected by the administrator, the browser:

1. signs in to Lautec;
2. opens the visible **All DPRs** list;
3. finds the DPR dashboard card with Lautec’s visible date label (for example, `Fri, Aug 21`);
4. clicks that card’s visible **Edit** control;
5. selects the matching team tab;
6. clicks the DPR page’s visible **Import Data** control;
7. completes, verifies, and submits the import grid.

DPR accepts only HTTPS pages on the approved Lautec origin and server-controlled path prefixes. The default policy permits the Lautec root and this project’s DPR-details route; deployments may replace that narrow set with `LAUTEC_APPROVED_PATH_PREFIXES`.

Set the following workspace/deployment secrets. The settings page only reports whether each credential is configured; it never displays or saves credential values in the DPR database, client build, source code, or browser requests:

- `LAUTEC_USERNAME` — dedicated non-MFA Lautec automation account.
- `LAUTEC_PASSWORD` — password for that account.
- `LAUTEC_LOGIN_URL` — optional fallback sign-in page when the admin setting is not saved.
- `LAUTEC_UI_SELECTORS_JSON` — optional JSON map for the login controls and optional visible-action hooks:

```json
{
  "username": "input[type=\"email\"]",
  "continueSubmit": "button[type=submit]",
  "password": "input[type=\"password\"]",
  "loginSubmit": "button[type=submit]",
  "loginComplete": "[data-page=home]",
  "submit": "[data-action=submit-import]",
  "success": "[role=status]",
  "rejectedRows": "[data-row-error]",
  "importDataButton": "[data-action=import-data]"
}
```

The four login selectors (`username`, `continueSubmit`, `password`, and `loginSubmit`) are the only required selectors. They default to Lautec's email-first sign-in controls and can be managed under **DPR Administration → DPR Mapping → Lautec**. `loginComplete` is optional. The remaining selectors are optional deployment-level hooks: `importDataButton`, `submit`, `success`, and `rejectedRows`; when absent, the adapter uses visible button text and its own server-backed readback checks. Legacy grid selectors such as `resetRows`, `addRow`, `row`, `activityGroup`, `activity`, `location`, `start`, `finish`, `comment`, and `pax` are not part of the contract and must not be configured.

The current Lautec grid is controlled through visible table cells (`td[data-x][data-y]`) and visible dropdown options. DPR first refuses a non-empty Import Data grid, selects Activity Group, Activity, and Location from Lautec's dropdowns, types Start, Finish, and Comment, and never fills PAX. It then verifies every visible value, clicks Import, waits for Lautec to show the edited table, clicks Save Changes, reloads, and verifies the saved rows again. The selected date is verified through its visible dashboard card and the selected team through Lautec's team tab; neither is typed into the grid. For a controlled local run only, `LAUTEC_BROWSER_EXECUTABLE_PATH` may point to a compatible Chromium executable.

Readback verification against the persisted activities table accounts for how the current Lautec UI renders it (verified against real imports on 27 Aug 2026):

- Lautec renders tabs, action controls, and buttons as generic elements, so the adapter clicks the deepest visible element whose exact text matches; clicks on outer layout wrappers never reach the control.
- An empty team table shows a single **No records to display** placeholder row; it disappears when a real row is added and is ignored by the before/after comparison.
- The table has both an **ORSTED Comments** column and a **Comment** column; the import writes only **Comment**, and verification reads that column, not the ORSTED one.
- Cells the import leaves empty (PAX, ORSTED Comments) render as `*`; verification treats `*` and blank as equally empty for PAX and still rejects any real PAX value.
- After Save Changes, the server-backed reload of a Direct DPR URL retains its `?modal=import-data` query, so the pinned team's empty grid can reopen over the persisted table; the adapter closes any reopened modal again before taking the final saved readback.
- If the readback still cannot match, the run's error detail includes the last visible table snapshot so the mismatch can be diagnosed from the run ledger alone.

## Operating and recovery path

1. Sign in as an administrator and select exactly one Capture date and team.
2. Choose **Send to Lautec**, verify the displayed rows and target team, then start the import.
3. Keep the dialog open while DPR reports the browser run. DPR reports success only after Lautec visibly confirms completion.
4. For a validation, login, or browser failure before the visible Submit checkpoint, review the run result and fix the reported cause before retrying. A failed run is not considered imported.
5. If the same snapshot already completed, the dialog requires an explicit re-send acknowledgement. Use it only after confirming that a duplicate submission is intended.
6. If Lautec reports rejected rows, or a run becomes **uncertain**, **interrupted**, or loses its completion confirmation after the submission checkpoint, check Lautec's saved table/history before retrying. Some rows may already have been accepted; explicitly acknowledge the retry only after that check.
7. An interrupted run is only automatically recovered after the 15-minute recovery window. An active run is never interrupted merely because a serverless worker restarted.

Run entries and DPR activity-log events provide the audit trail for every started, successful, failed, and interrupted attempt.