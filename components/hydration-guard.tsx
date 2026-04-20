"use client";

import { useEffect, useState } from "react";

/**
 * Zustand's `persist` middleware rehydrates on client mount, which can cause
 * flashes of default state. This guard defers rendering children until after
 * mount so the UI reflects localStorage state immediately.
 */
export function HydrationGuard({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <>{fallback}</>;
  return <>{children}</>;
}
