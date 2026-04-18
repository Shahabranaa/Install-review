import {
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
  type QueryFunction,
  type QueryKey,
} from "@tanstack/react-query";
import { customFetch, type ErrorType } from "../custom-fetch";

type SecondParameter<T extends (...args: unknown[]) => unknown> = Parameters<T>[1];

export interface CableRecord {
  cableName: string;
  tower:     string;
  string:    string;
}

export interface ListCablesResponse {
  cables: CableRecord[];
}

export const getListCablesUrl = (): string => `/api/cables`;

export const listCables = async (options?: RequestInit): Promise<ListCablesResponse> => {
  return customFetch<ListCablesResponse>(getListCablesUrl(), { ...options, method: "GET" });
};

export const getListCablesQueryKey = (): readonly [string] => [`/api/cables`] as const;

export const getListCablesQueryOptions = <
  TData = Awaited<ReturnType<typeof listCables>>,
  TError = ErrorType<unknown>,
>(
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCables>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getListCablesQueryKey();
  const queryFn: QueryFunction<Awaited<ReturnType<typeof listCables>>> = ({ signal }) =>
    listCables({ signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof listCables>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export function useListCables<
  TData = Awaited<ReturnType<typeof listCables>>,
  TError = ErrorType<unknown>,
>(
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCables>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getListCablesQueryOptions(options);
  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey: queryOptions.queryKey };
}
