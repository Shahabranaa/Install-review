# Lautec manual DPR imports

## Scope and safeguards

An administrator can send exactly one selected DPR Capture date and team to Lautec from Capture. The import reads the date-named Google Sheet tab, validates the managed columns, and drives Lautec's visible Import Data interface in a headless browser. It does not call undocumented Lautec endpoints.

The managed Sheet header must be exactly:

`Activity Group, Activity, Location, Start, Finish, Comment, Team ID`

The first six columns are the Lautec destination values. `Team ID` is DPR-managed source metadata: it is required to isolate the selected team's rows and is never sent to Lautec. All destination fields except Comment are required. Start and Finish must be valid `HH:MM` values. PAX is deliberately cleared and never supplied.
For reliable completion within the browser runtime, a single import is limited to 75 rows.

Before a browser session starts, DPR stores the ordered source rows, date/team context, hash, operator, and started time in the import ledger. A completed identical hash is blocked unless the administrator explicitly confirms a re-send. At most one run may be active for a date/team. Only a run older than the 15-minute recovery window is marked interrupted before a new import starts; ordinary serverless cold starts never interrupt active work.

## Browser sequence and required server-only configuration

Administrators can configure the non-secret Login URL at **DPR Administration → DPR Mapping → Lautec**. The login URL defaults to `https://dpr.lautec.com/` and saved destinations take effect for future imports without a redeployment. For the Capture date and team selected by the administrator, the browser:

1. signs in to Lautec;
2. finds the DPR dashboard card with Lautec’s visible date label (for example, `Fri, Aug 21`);
3. clicks that card’s visible **Edit** control;
4. selects the matching team tab;
5. clicks the DPR page’s visible **Import Data** control;
6. completes, verifies, and submits the import grid.

DPR accepts only HTTPS pages on the approved Lautec origin and server-controlled path prefixes.

Set the following workspace/deployment secrets. The settings page only reports whether each secret is configured; it never displays or saves credential values in the DPR database, client build, source code, or browser requests:

- `LAUTEC_USERNAME` — dedicated non-MFA Lautec automation account.
- `LAUTEC_PASSWORD` — password for that account.
- `LAUTEC_LOGIN_URL` — fallback Lautec sign-in page when the admin setting is not saved.
- `LAUTEC_UI_SELECTORS_JSON` — JSON map for the visible UI controls:

```json
{
  "username": "#username",
  "continueSubmit": "button[type=submit]",
  "password": "#password",
  "loginSubmit": "button[type=submit]",
  "loginComplete": "[data-page=home]",
  "importDataButton": "[data-action=import-data]",
  "resetRows": "[data-action=reset-all-rows]",
  "addRow": "[data-action=add-row]",
  "row": "[data-import-row]",
  "activityGroup": "[name=activityGroup]",
  "activity": "[name=activity]",
  "location": "[name=location]",
  "start": "[name=start]",
  "finish": "[name=finish]",
  "comment": "[name=comment]",
  "pax": "[name=pax]",
  "submit": "[data-action=submit-import]",
  "success": "[role=status]"
}
```

The selectors above are placeholders only. Replace them with selectors observed in Lautec's normal user interface. The two-step login uses `username` → `continueSubmit` → `password` → `loginSubmit`; the defaults match Lautec’s email-first sign-in screen (`input[type="email"]`, Continue, `input[type="password"]`, Sign in). An optional `loginComplete` selector can make the completion check more specific. The five login selectors can also be managed under **DPR Administration → DPR Mapping → Lautec**. `resetRows` is a required safeguard: DPR must first clear the import grid before it adds source rows. The selected date is verified through its visible dashboard card and the selected team through Lautec’s team tab and `Team N: Import Data` heading; neither is typed into the grid. Optional `rejectedRows` identifies visible Lautec row-rejection messages. For a controlled local run only, `LAUTEC_BROWSER_EXECUTABLE_PATH` may point to a compatible Chromium executable.

## Operating and recovery path

1. Sign in as an administrator and select exactly one Capture date and team.
2. Choose **Send to Lautec**, verify the displayed rows and target team, then start the import.
3. Keep the dialog open while DPR reports the browser run. DPR reports success only after Lautec visibly confirms completion.
4. For validation, login, browser, or Lautec row-rejection failures, review the DPR run result and Lautec before retrying. A failed or interrupted run is not considered imported.
5. If the same snapshot already completed, the dialog requires an explicit re-send acknowledgement. Use it only after confirming that a duplicate submission is intended.
6. If a run is shown as interrupted after the recovery window, check Lautec's Import Data/history before retrying, because the browser may have submitted data before the process ended.

Run entries and DPR activity-log events provide the audit trail for every started, successful, failed, and interrupted attempt.