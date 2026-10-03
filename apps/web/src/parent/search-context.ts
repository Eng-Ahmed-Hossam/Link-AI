'use client';

import { useCallback, useEffect, useState } from 'react';
import { useChildren, type Child } from '@link/api-client';
import { useSession } from '../session';

const KEY = 'link.search.childId';

/**
 * The child a search is for (MKT-ACC-05 AC3: search defaults to the selected child).
 * Signed-out visitors pick a curriculum and year without a child.
 */
export function useSelectedChild() {
  const { session } = useSession();
  const children = useChildren({ enabled: !!session });
  const [childId, setChildIdState] = useState<string | null>(null);

  useEffect(() => {
    try {
      setChildIdState(localStorage.getItem(KEY));
    } catch {
      /* ignore */
    }
  }, []);

  const setChildId = useCallback((id: string) => {
    setChildIdState(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const list: Child[] = children.data?.data ?? [];
  const child = list.find((c) => c.id === childId) ?? list[0] ?? null;
  return { child, children: list, setChildId, query: children, signedIn: !!session };
}
