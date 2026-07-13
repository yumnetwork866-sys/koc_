import { useMemo, useSyncExternalStore } from 'react';
import { getSessionSnapshot, parseSessionSnapshot, subscribeSession } from './session';

export function useSession() {
  const snapshot = useSyncExternalStore(subscribeSession, getSessionSnapshot, () => null);
  return useMemo(() => parseSessionSnapshot(snapshot), [snapshot]);
}
