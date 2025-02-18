/* eslint-disable @typescript-eslint/no-explicit-any */
import { QueriesObserver } from '@tanstack/query-core'
import {
  computed,
  getCurrentScope,
  onScopeDispose,
  readonly,
  ref,
  watch,
} from 'vue-demi'

import { useQueryClient } from './useQueryClient'
import { cloneDeepUnref } from './utils'
import type { Ref } from 'vue-demi'
import type {
  DefaultError,
  QueriesObserverOptions,
  QueriesPlaceholderDataFunction,
  QueryFunction,
  QueryKey,
  QueryObserverResult,
  ThrowOnError,
} from '@tanstack/query-core'
import type { UseQueryOptions } from './useQuery'
import type { QueryClient } from './queryClient'
import type { DistributiveOmit, MaybeRefDeep } from './types'

// This defines the `UseQueryOptions` that are accepted in `QueriesOptions` & `GetOptions`.
// `placeholderData` function does not have a parameter
type UseQueryOptionsForUseQueries<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = DistributiveOmit<
  UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  'placeholderData'
> & {
  placeholderData?: TQueryFnData | QueriesPlaceholderDataFunction<TQueryFnData>
}

// Avoid TS depth-limit error in case of large array literal
type MAXIMUM_DEPTH = 20

type GetOptions<T> =
  // Part 1: responsible for applying explicit type parameter to function arguments, if object { queryFnData: TQueryFnData, error: TError, data: TData }
  T extends {
    queryFnData: infer TQueryFnData
    error?: infer TError
    data: infer TData
  }
    ? UseQueryOptionsForUseQueries<TQueryFnData, TError, TData>
    : T extends { queryFnData: infer TQueryFnData; error?: infer TError }
      ? UseQueryOptionsForUseQueries<TQueryFnData, TError>
      : T extends { data: infer TData; error?: infer TError }
        ? UseQueryOptionsForUseQueries<unknown, TError, TData>
        : // Part 2: responsible for applying explicit type parameter to function arguments, if tuple [TQueryFnData, TError, TData]
          T extends [infer TQueryFnData, infer TError, infer TData]
          ? UseQueryOptionsForUseQueries<TQueryFnData, TError, TData>
          : T extends [infer TQueryFnData, infer TError]
            ? UseQueryOptionsForUseQueries<TQueryFnData, TError>
            : T extends [infer TQueryFnData]
              ? UseQueryOptionsForUseQueries<TQueryFnData>
              : // Part 3: responsible for inferring and enforcing type if no explicit parameter was provided
                T extends {
                    queryFn?: QueryFunction<infer TQueryFnData, infer TQueryKey>
                    select?: (data: any) => infer TData
                    throwOnError?: ThrowOnError<any, infer TError, any, any>
                  }
                ? UseQueryOptionsForUseQueries<
                    TQueryFnData,
                    TError,
                    TData,
                    TQueryKey
                  >
                : T extends {
                      queryFn?: QueryFunction<
                        infer TQueryFnData,
                        infer TQueryKey
                      >
                      throwOnError?: ThrowOnError<any, infer TError, any, any>
                    }
                  ? UseQueryOptionsForUseQueries<
                      TQueryFnData,
                      TError,
                      TQueryFnData,
                      TQueryKey
                    >
                  : // Fallback
                    UseQueryOptionsForUseQueries

type GetResults<T> =
  // Part 1: responsible for mapping explicit type parameter to function result, if object
  T extends { queryFnData: any; error?: infer TError; data: infer TData }
    ? QueryObserverResult<TData, TError>
    : T extends { queryFnData: infer TQueryFnData; error?: infer TError }
      ? QueryObserverResult<TQueryFnData, TError>
      : T extends { data: infer TData; error?: infer TError }
        ? QueryObserverResult<TData, TError>
        : // Part 2: responsible for mapping explicit type parameter to function result, if tuple
          T extends [any, infer TError, infer TData]
          ? QueryObserverResult<TData, TError>
          : T extends [infer TQueryFnData, infer TError]
            ? QueryObserverResult<TQueryFnData, TError>
            : T extends [infer TQueryFnData]
              ? QueryObserverResult<TQueryFnData>
              : // Part 3: responsible for mapping inferred type to results, if no explicit parameter was provided
                T extends {
                    queryFn?: QueryFunction<infer TQueryFnData, any>
                    select?: (data: any) => infer TData
                    throwOnError?: ThrowOnError<any, infer TError, any, any>
                  }
                ? QueryObserverResult<
                    unknown extends TData ? TQueryFnData : TData,
                    unknown extends TError ? DefaultError : TError
                  >
                : T extends {
                      queryFn?: QueryFunction<infer TQueryFnData, any>
                      throwOnError?: ThrowOnError<any, infer TError, any, any>
                    }
                  ? QueryObserverResult<
                      TQueryFnData,
                      unknown extends TError ? DefaultError : TError
                    >
                  : // Fallback
                    QueryObserverResult

/**
 * UseQueriesOptions reducer recursively unwraps function arguments to infer/enforce type param
 */
export type UseQueriesOptions<
  T extends Array<any>,
  Result extends Array<any> = [],
  Depth extends ReadonlyArray<number> = [],
> = Depth['length'] extends MAXIMUM_DEPTH
  ? Array<UseQueryOptionsForUseQueries>
  : T extends []
    ? []
    : T extends [infer Head]
      ? [...Result, GetOptions<Head>]
      : T extends [infer Head, ...infer Tail]
        ? UseQueriesOptions<
            [...Tail],
            [...Result, GetOptions<Head>],
            [...Depth, 1]
          >
        : Array<unknown> extends T
          ? T
          : // If T is *some* array but we couldn't assign unknown[] to it, then it must hold some known/homogenous type!
            // use this to infer the param types in the case of Array.map() argument
            T extends Array<
                UseQueryOptionsForUseQueries<
                  infer TQueryFnData,
                  infer TError,
                  infer TData,
                  infer TQueryKey
                >
              >
            ? Array<
                UseQueryOptionsForUseQueries<
                  TQueryFnData,
                  TError,
                  TData,
                  TQueryKey
                >
              >
            : // Fallback
              Array<UseQueryOptionsForUseQueries>

/**
 * UseQueriesResults reducer recursively maps type param to results
 */
export type UseQueriesResults<
  T extends Array<any>,
  Result extends Array<any> = [],
  Depth extends ReadonlyArray<number> = [],
> = Depth['length'] extends MAXIMUM_DEPTH
  ? Array<QueryObserverResult>
  : T extends []
    ? []
    : T extends [infer Head]
      ? [...Result, GetResults<Head>]
      : T extends [infer Head, ...infer Tail]
        ? UseQueriesResults<
            [...Tail],
            [...Result, GetResults<Head>],
            [...Depth, 1]
          >
        : T extends Array<
              UseQueryOptionsForUseQueries<
                infer TQueryFnData,
                infer TError,
                infer TData,
                any
              >
            >
          ? // Dynamic-size (homogenous) UseQueryOptions array: map directly to array of results
            Array<
              QueryObserverResult<
                unknown extends TData ? TQueryFnData : TData,
                TError
              >
            >
          : // Fallback
            Array<QueryObserverResult>

type UseQueriesOptionsArg<T extends Array<any>> = readonly [
  ...UseQueriesOptions<T>,
]

export function useQueries<
  T extends Array<any>,
  TCombinedResult = UseQueriesResults<T>,
>(
  {
    queries,
    ...options
  }: {
    queries: MaybeRefDeep<UseQueriesOptionsArg<T>>
    combine?: (result: UseQueriesResults<T>) => TCombinedResult
  },
  queryClient?: QueryClient,
): Readonly<Ref<TCombinedResult>> {
  if (process.env.NODE_ENV === 'development') {
    if (!getCurrentScope()) {
      console.warn(
        'vue-query composables like "useQuery()" should only be used inside a "setup()" function or a running effect scope. They might otherwise lead to memory leaks.',
      )
    }
  }

  const client = queryClient || useQueryClient()

  const defaultedQueries = computed(() =>
    cloneDeepUnref(queries).map((queryOptions) => {
      if (typeof queryOptions.enabled === 'function') {
        queryOptions.enabled = queryOptions.enabled()
      }

      const defaulted = client.defaultQueryOptions(queryOptions)
      defaulted._optimisticResults = client.isRestoring.value
        ? 'isRestoring'
        : 'optimistic'

      return defaulted
    }),
  )

  const observer = new QueriesObserver<TCombinedResult>(
    client,
    defaultedQueries.value,
    options as QueriesObserverOptions<TCombinedResult>,
  )
  const [, getCombinedResult] = observer.getOptimisticResult(
    defaultedQueries.value,
  )
  const state = ref(getCombinedResult()) as Ref<TCombinedResult>

  let unsubscribe = () => {
    // noop
  }

  watch(
    client.isRestoring,
    (isRestoring) => {
      if (!isRestoring) {
        unsubscribe()
        unsubscribe = observer.subscribe(() => {
          const [, getCombinedResultRestoring] = observer.getOptimisticResult(
            defaultedQueries.value,
          )
          state.value = getCombinedResultRestoring()
        })
        // Subscription would not fire for persisted results
        const [, getCombinedResultPersisted] = observer.getOptimisticResult(
          defaultedQueries.value,
        )
        state.value = getCombinedResultPersisted()
      }
    },
    { immediate: true },
  )

  watch(
    defaultedQueries,
    () => {
      observer.setQueries(
        defaultedQueries.value,
        options as QueriesObserverOptions<TCombinedResult>,
      )
      const [, getCombinedResultPersisted] = observer.getOptimisticResult(
        defaultedQueries.value,
      )
      state.value = getCombinedResultPersisted()
    },
    { flush: 'sync' },
  )

  onScopeDispose(() => {
    unsubscribe()
  })

  return readonly(state) as Readonly<Ref<TCombinedResult>>
}
