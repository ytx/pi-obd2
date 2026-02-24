import type { StoreApi } from 'zustand';

/**
 * Wait for Zustand persist middleware to finish hydrating from storage.
 * Returns immediately if already hydrated.
 */
export function waitForHydration(store: StoreApi<unknown>): Promise<void> {
  const persist = (store as unknown as { persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (fn: () => void) => () => void;
  } }).persist;

  if (persist.hasHydrated()) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const unsub = persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}
