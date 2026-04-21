"use client";

import { useSyncExternalStore } from "react";

function subscribeToMediaQuery(query: string, onStoreChange: () => void) {
  const mq = window.matchMedia(query);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

/**
 * Subscribes to a CSS media query. Server snapshot is `false` (mobile-first)
 * to avoid SSR/client mismatch for client-only layouts.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => subscribeToMediaQuery(query, onStoreChange),
    () => window.matchMedia(query).matches,
    () => false,
  );
}
