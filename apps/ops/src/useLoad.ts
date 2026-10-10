'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiError } from '@link/api-client';

/**
 * Load once and on `reload()`. Ops screens read fresh every time (never cached: payment status
 * and decisions change under them, CLAUDE.md "never cache ledger balances, payment status").
 */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [n, setN] = useState(0);
  const run = useCallback(load, deps);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    run()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e: ApiError) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [run, n]);
  return { data, error, loading, reload: () => setN((x) => x + 1) };
}
