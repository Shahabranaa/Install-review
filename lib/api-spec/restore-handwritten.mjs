// Restores hand-written files that orval's clean:true removes on every codegen run.
// Also patches generated index files to remove invalid re-exports.
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "..");
const generatedDir = resolve(root, "lib", "api-client-react", "src", "generated");

// ── 1. Restore hand-written cables.ts ────────────────────────────────────────
const cablesDest = resolve(generatedDir, "cables.ts");
if (!existsSync(cablesDest)) {
  const src = resolve(root, ".migration-backup", "lib", "api-client-react", "src", "generated", "cables.ts");
  if (existsSync(src)) {
    writeFileSync(cablesDest, readFileSync(src, "utf8"));
    console.log("Restored: cables.ts");
  } else {
    console.warn("WARNING: Cannot restore cables.ts — source not found");
  }
}

// ── 2. Write fixed strings-towers.ts (types inlined, no @workspace/api-zod) ──
const stringsTowersDest = resolve(generatedDir, "strings-towers.ts");
const stringsTowersContent = `import {
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
  type QueryFunction,
  type QueryKey,
} from "@tanstack/react-query";
import { customFetch, type ErrorType } from "../custom-fetch";

type SecondParameter<T extends (...args: unknown[]) => unknown> = Parameters<T>[1];

export interface StringRecord {
  id: number;
  locationId: number;
  name: string;
  stringNumber?: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface TowerRecord {
  id: number;
  stringId: number;
  name: string;
  lat?: number | null;
  lng?: number | null;
  progressStatus: string;
  locationType: string;
  connectedTo?: string | null;
  countOnString?: number | null;
  createdAt: string;
  updatedAt: string;
}

// ─── STRINGS ─────────────────────────────────────────────────────────────────

export const getListStringsUrl = (params?: { locationId?: number }) => {
  const norm = new URLSearchParams();
  if (params?.locationId !== undefined) {
    norm.append("locationId", String(params.locationId));
  }
  const qs = norm.toString();
  return qs ? \`/api/strings?\${qs}\` : \`/api/strings\`;
};

export const listStrings = async (
  params?: { locationId?: number },
  options?: RequestInit,
): Promise<StringRecord[]> => {
  return customFetch<StringRecord[]>(getListStringsUrl(params), {
    ...options,
    method: "GET",
  });
};

export const getListStringsQueryKey = (params?: { locationId?: number }) =>
  [\`/api/strings\`, ...(params ? [params] : [])] as const;

export const getListStringsQueryOptions = <
  TData = Awaited<ReturnType<typeof listStrings>>,
  TError = ErrorType<unknown>,
>(
  params?: { locationId?: number },
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listStrings>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getListStringsQueryKey(params);
  const queryFn: QueryFunction<Awaited<ReturnType<typeof listStrings>>> = ({ signal }) =>
    listStrings(params, { signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof listStrings>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export function useListStrings<
  TData = Awaited<ReturnType<typeof listStrings>>,
  TError = ErrorType<unknown>,
>(
  params?: { locationId?: number },
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listStrings>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getListStringsQueryOptions(params, options);
  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey: queryOptions.queryKey };
}

export const getGetStringUrl = (id: number) => \`/api/strings/\${id}\`;

export const getString = async (id: number, options?: RequestInit): Promise<StringRecord> => {
  return customFetch<StringRecord>(getGetStringUrl(id), { ...options, method: "GET" });
};

export const getGetStringQueryKey = (id: number) => [\`/api/strings/\${id}\`] as const;

export function useGetString<TData = StringRecord, TError = ErrorType<unknown>>(
  id: number,
  options?: {
    query?: UseQueryOptions<StringRecord, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getGetStringQueryKey(id);
  const queryFn: QueryFunction<StringRecord> = ({ signal }) =>
    getString(id, { signal, ...requestOptions });
  const query = useQuery({ queryKey, queryFn, enabled: !!id, ...queryOptions }) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey };
}

// ─── TOWERS ──────────────────────────────────────────────────────────────────

export const getListTowersUrl = (params?: { stringId?: number; locationId?: number }) => {
  const norm = new URLSearchParams();
  if (params?.stringId !== undefined) norm.append("stringId", String(params.stringId));
  if (params?.locationId !== undefined) norm.append("locationId", String(params.locationId));
  const qs = norm.toString();
  return qs ? \`/api/towers?\${qs}\` : \`/api/towers\`;
};

export const listTowers = async (
  params?: { stringId?: number; locationId?: number },
  options?: RequestInit,
): Promise<TowerRecord[]> => {
  return customFetch<TowerRecord[]>(getListTowersUrl(params), {
    ...options,
    method: "GET",
  });
};

export const getListTowersQueryKey = (params?: { stringId?: number; locationId?: number }) =>
  [\`/api/towers\`, ...(params ? [params] : [])] as const;

export const getListTowersQueryOptions = <
  TData = Awaited<ReturnType<typeof listTowers>>,
  TError = ErrorType<unknown>,
>(
  params?: { stringId?: number; locationId?: number },
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listTowers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getListTowersQueryKey(params);
  const queryFn: QueryFunction<Awaited<ReturnType<typeof listTowers>>> = ({ signal }) =>
    listTowers(params, { signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof listTowers>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export function useListTowers<
  TData = Awaited<ReturnType<typeof listTowers>>,
  TError = ErrorType<unknown>,
>(
  params?: { stringId?: number; locationId?: number },
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listTowers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getListTowersQueryOptions(params, options);
  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey: queryOptions.queryKey };
}
`;
writeFileSync(stringsTowersDest, stringsTowersContent);
console.log("Wrote: strings-towers.ts (with inlined types)");

// ── 3. Restore api-zod extra.ts (hand-written supplement schemas) ─────────────
const apiZodGeneratedDir = resolve(root, "lib", "api-zod", "src", "generated");
const extraDest = resolve(apiZodGeneratedDir, "extra.ts");
if (!existsSync(extraDest)) {
  const extraContent = `// Hand-written Zod schemas for API routes not covered by the OpenAPI spec.
// This file is preserved by restore-handwritten.mjs and must not be deleted.
import * as zod from "zod";

// ── Issues ────────────────────────────────────────────────────────────────────

export const ResolveIssueBody = zod.object({
  resolvedBy: zod.string().nullish(),
});

// ── Strings ───────────────────────────────────────────────────────────────────

export const ListStringsQueryParams = zod.object({
  locationId: zod.coerce.number().optional(),
});

export const ListStringsResponseItem = zod.object({
  id: zod.number(),
  locationId: zod.number(),
  name: zod.string(),
  stringNumber: zod.number().nullish(),
  status: zod.string(),
  createdAt: zod.string(),
  updatedAt: zod.string(),
});
export const ListStringsResponse = zod.array(ListStringsResponseItem);

export const GetStringParams = zod.object({
  id: zod.coerce.number(),
});

export const GetStringResponse = zod.object({
  id: zod.number(),
  locationId: zod.number(),
  name: zod.string(),
  stringNumber: zod.number().nullish(),
  status: zod.string(),
  createdAt: zod.string(),
  updatedAt: zod.string(),
});

// ── Towers ────────────────────────────────────────────────────────────────────

export const ListTowersQueryParams = zod.object({
  stringId: zod.coerce.number().optional(),
  locationId: zod.coerce.number().optional(),
});

export const ListTowersResponseItem = zod.object({
  id: zod.number(),
  stringId: zod.number(),
  name: zod.string(),
  lat: zod.number().nullish(),
  lng: zod.number().nullish(),
  progressStatus: zod.string(),
  locationType: zod.string(),
  connectedTo: zod.string().nullish(),
  countOnString: zod.number().nullish(),
  createdAt: zod.string(),
  updatedAt: zod.string(),
});
export const ListTowersResponse = zod.array(ListTowersResponseItem);

export const GetTowerParams = zod.object({
  id: zod.coerce.number(),
});

export const GetTowerResponse = zod.object({
  id: zod.number(),
  stringId: zod.number(),
  name: zod.string(),
  lat: zod.number().nullish(),
  lng: zod.number().nullish(),
  progressStatus: zod.string(),
  locationType: zod.string(),
  connectedTo: zod.string().nullish(),
  countOnString: zod.number().nullish(),
  createdAt: zod.string(),
  updatedAt: zod.string(),
});

// ── DPR — date summary ────────────────────────────────────────────────────────

export const GetDprDateSummaryResponse = zod.object({
  totalTeams: zod.number(),
  items: zod.array(
    zod.object({
      date: zod.string(),
      noTime: zod.number(),
      partial: zod.number(),
      complete: zod.number(),
      captured: zod.number(),
    })
  ),
});

// ── DPR — lock entries ────────────────────────────────────────────────────────

export const LockDprTimesheetEntriesBody = zod.object({
  teamId: zod.number(),
  date: zod.string(),
});

// Response mirrors DprTimesheetEntry array; permissive shape since the
// full entry shape is validated by the GET endpoint schema.
export const LockDprTimesheetEntriesResponse = zod.array(zod.record(zod.unknown()));

// ── DPR — team date exceptions ────────────────────────────────────────────────

export const DprTeamDateException = zod.object({
  id: zod.number(),
  teamId: zod.number(),
  date: zod.string(),
  status: zod.string(),
});

export const GetDprTeamDateExceptionsQueryParams = zod.object({
  date: zod.string().optional(),
});

export const GetDprTeamDateExceptionsResponse = zod.array(DprTeamDateException);

export const CreateDprTeamDateExceptionBody = zod.object({
  teamId: zod.number(),
  date: zod.string(),
});

export const DeleteDprTeamDateExceptionParams = zod.object({
  id: zod.coerce.number(),
});

// ── DPR — shift attendance ────────────────────────────────────────────────────

export const GetDprShiftAttendanceQueryParams = zod.object({
  date: zod.string(),
});

export const ListDprShiftAttendanceResponse = zod.array(
  zod.object({
    id: zod.number(),
    firstName: zod.string(),
    lastName: zod.string(),
    roles: zod.array(zod.string()),
    company: zod.string().nullable(),
    active: zod.boolean(),
    teamIds: zod.array(zod.number()),
    shiftStatus: zod.enum(["off_shift", "signing_on", "on_shift", "signing_off"]),
    signOnTime: zod.string().nullable(),
    signOffTime: zod.string().nullable(),
  })
);

export const UpdateDprShiftAttendanceParams = zod.object({
  workerId: zod.coerce.number(),
});

export const UpdateDprShiftAttendanceBody = zod.object({
  date: zod.string(),
  status: zod.enum(["off_shift", "signing_on", "on_shift", "signing_off"]),
  signOnTime: zod.string().optional(),
  signOffTime: zod.string().optional(),
});

export const CopyDprShiftAttendanceQueryParams = zod.object({
  date: zod.string(),
});

export const CopyDprShiftAttendanceResponse = zod.object({
  copied: zod.number(),
});

export const GetDprShiftSessionQueryParams = zod.object({
  date: zod.string(),
});

export const DprShiftSessionResponse = zod.object({
  saved: zod.boolean(),
  savedAt: zod.string().nullable(),
});

export const SaveDprShiftAttendanceBody = zod.object({
  date: zod.string(),
});
`;
  writeFileSync(extraDest, extraContent);
  console.log("Restored: lib/api-zod/src/generated/extra.ts");
}

// ── 4. Ensure api-zod index.ts exports both generated/api and generated/extra ─
const apiZodIndex = resolve(root, "lib", "api-zod", "src", "index.ts");
if (existsSync(apiZodIndex)) {
  let content = readFileSync(apiZodIndex, "utf8");
  // Remove invalid types re-export
  let fixed = content
    .split("\n")
    .filter((line) => !line.includes("./generated/types"))
    .join("\n");
  // Ensure extra.ts is exported
  if (!fixed.includes("./generated/extra")) {
    fixed = fixed.trimEnd() + '\nexport * from "./generated/extra";\n';
  }
  if (fixed !== content) {
    writeFileSync(apiZodIndex, fixed);
    console.log("Fixed: lib/api-zod/src/index.ts");
  }
}
