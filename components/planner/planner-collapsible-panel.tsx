"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PlannerCollapsiblePanelProps {
  /** Stable prefix for aria ids (defaults to a generated id). */
  id?: string;
  title: ReactNode;
  /** Extra content on the header row before the chevron (e.g. counts). */
  trailing?: ReactNode;
  defaultOpen?: boolean;
  /**
   * Increment when a child section becomes visible from the global Sections menu
   * so the panel opens even if the user had collapsed it earlier.
   */
  expandRevision?: number;
  children: ReactNode;
  /** Optional full-width strip between header and body. */
  banner?: ReactNode;
  className?: string;
}

export function PlannerCollapsiblePanel({
  id: idProp,
  title,
  trailing,
  defaultOpen = true,
  expandRevision,
  children,
  banner,
  className,
}: PlannerCollapsiblePanelProps) {
  const generated = useId().replace(/:/g, "");
  const baseId = idProp ?? `planner-panel-${generated}`;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (expandRevision === undefined) return;
    if (expandRevision > 0) setOpen(true);
  }, [expandRevision]);

  return (
    <div className={cn("card relative overflow-hidden", className)}>
      <div className="belt absolute inset-x-0 top-0" aria-hidden />
      <button
        type="button"
        id={`${baseId}-toggle`}
        aria-expanded={open}
        aria-controls={`${baseId}-body`}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full touch-manipulation items-center justify-between gap-2 border-b border-surface-border px-3 py-2 text-left sm:min-h-0"
      >
        <div className="min-w-0 flex-1">{title}</div>
        <div className="flex shrink-0 items-center gap-2">
          {trailing}
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-gray-500 transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </div>
      </button>
      {banner}
      {open && (
        <div
          id={`${baseId}-body`}
          role="region"
          aria-labelledby={`${baseId}-toggle`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
