import type {
  DprActivity,
  DprActivityGroup,
  DprJdrCode,
  DprTimesheetEntry,
} from "@workspace/api-client-react";

/**
 * Finds the JDR mappings available to a Clarify row using the narrowest
 * activity context that has been saved on the entry.
 */
export function filterJdrCodesForEntry(
  entry: DprTimesheetEntry,
  allJdrCodes: DprJdrCode[],
  allActivities: DprActivity[],
  activityGroups: DprActivityGroup[],
): DprJdrCode[] {
  if (entry.activityId != null) {
    return allJdrCodes.filter((code) => code.activityId === entry.activityId);
  }

  let activityIds: Set<number> | null = null;
  if (entry.activityGroupId != null) {
    activityIds = new Set(
      allActivities
        .filter((activity) => activity.activityGroupId === entry.activityGroupId)
        .map((activity) => activity.id),
    );
  } else if (entry.activityTypeId != null) {
    const groupIds = new Set(
      activityGroups
        .filter((group) => group.activityTypeId === entry.activityTypeId)
        .map((group) => group.id),
    );
    activityIds = new Set(
      allActivities
        .filter((activity) => groupIds.has(activity.activityGroupId))
        .map((activity) => activity.id),
    );
  }

  // A row without activity context still needs a usable picker so a reviewer
  // can categorise it.
  if (activityIds === null) return allJdrCodes;
  return allJdrCodes.filter((code) => code.activityId != null && activityIds.has(code.activityId));
}

/**
 * JDR mappings historically store a non-working-time prefix in the work
 * activity label. It is contractual reference text, not useful Clarify UI.
 */
export function formatJdrWorkActivity(value: string | null | undefined): string {
  const label = (value ?? "").replace(/^\s*NWT\s*(?:[-–—:]\s*)?/i, "").trim();
  return label || "—";
}