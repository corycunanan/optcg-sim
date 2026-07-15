"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncOperationStatus = "idle" | "pending" | "success" | "error";

interface AsyncOperationState<TData> {
  status: AsyncOperationStatus;
  data: TData | null;
  error: unknown | null;
}

const INITIAL_STATE = {
  status: "idle",
  data: null,
  error: null,
} as const;

export function useAsyncOperation<TData, TArgs extends unknown[] = []>(
  operation: (...args: TArgs) => Promise<TData>
) {
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const [state, setState] = useState<AsyncOperationState<TData>>(INITIAL_STATE);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const execute = useCallback(
    async (...args: TArgs): Promise<TData> => {
      const requestId = ++requestIdRef.current;

      if (mountedRef.current) {
        setState((current) => ({
          status: "pending",
          data: current.data,
          error: null,
        }));
      }

      try {
        const data = await operation(...args);
        if (mountedRef.current && requestId === requestIdRef.current) {
          setState({ status: "success", data, error: null });
        }
        return data;
      } catch (error) {
        if (mountedRef.current && requestId === requestIdRef.current) {
          setState({ status: "error", data: null, error });
        }
        throw error;
      }
    },
    [operation]
  );

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    if (mountedRef.current) {
      setState(INITIAL_STATE);
    }
  }, []);

  return {
    ...state,
    execute,
    reset,
  };
}
