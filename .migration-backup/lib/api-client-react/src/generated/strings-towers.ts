import {
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
  type QueryFunction,
  type QueryKey,
} from "@tanstack/react-query";
import { customFetch, type ErrorType } from "../custom-fetch";
import type { StringRecord, TowerRecord } from "@workspace/api-zod";

type SecondParameter<T extends (...args: unknown[]) => unknown> = Parameters<T>[1];

// ─── STRINGS ─────────────────────────────────────────────────────────────────

export const getListStringsUrl = (params?: { locationId?: number }) => {
  const norm = new URLSearchParams();
  if (params?.locationId !== undefined) {
    norm.append("locationId", String(params.locationId));
  }
  const qs = norm.toString();
  return qs ? `/api/strings?${qs}` : `/api/strings`;
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
  [`/api/strings`, ...(params ? [params] : [])] as const;

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

export const getGetStringUrl = (id: number) => `/api/strings/${id}`;

export const getString = async (id: number, options?: RequestInit): Promise<StringRecord> => {
  return customFetch<StringRecord>(getGetStringUrl(id), { ...options, method: "GET" });
};

export const getGetStringQueryKey = (id: number) => [`/api/strings/${id}`] as const;

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
  return qs ? `/api/towers?${qs}` : `/api/towers`;
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
  [`/api/towers`, ...(params ? [params] : [])] as const;

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
