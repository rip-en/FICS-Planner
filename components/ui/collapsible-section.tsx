"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  contentClassName?: string;
  heading?: "h2" | "h3";
  /** Bordered panel with comfortable touch targets for mobile. */
  variant?: "plain" | "panel";
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  className,
  contentClassName,
  heading: HeadingTag = "h3",
  variant = "plain",
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const isPanel = variant === "panel";

  return (
    <section
      className={cn(
        "min-w-0",
        isPanel &&
          "rounded-lg border border-surface-border bg-surface-raised/80",
        className,
      )}
    >
      <button
        type="button"
        id={`${panelId}-trigger`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-2 text-left transition hover:text-gray-200",
          isPanel
            ? "min-h-11 touch-manipulation rounded-t-lg border-b border-transparent px-3 py-2.5 sm:min-h-0 sm:py-2"
            : "mb-2 min-h-10 touch-manipulation sm:min-h-0",
          open && isPanel && "border-surface-border",
        )}
      >
        <HeadingTag
          className={cn(
            "text-xs font-semibold uppercase tracking-wider text-gray-400",
            open && "text-gray-300",
          )}
        >
          {title}
        </HeadingTag>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-gray-500 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && (
        <div id={panelId} role="region" aria-labelledby={`${panelId}-trigger`}>
          <div
            className={cn(
              isPanel && "px-3 pb-3 pt-1",
              contentClassName,
            )}
          >
            {children}
          </div>
        </div>
      )}
    </section>
  );
}
