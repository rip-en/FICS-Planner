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
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  className,
  contentClassName,
  heading: HeadingTag = "h3",
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className={className}>
      <button
        type="button"
        id={`${panelId}-trigger`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="mb-2 flex w-full items-center justify-between gap-2 text-left transition hover:text-gray-200"
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
          <div className={cn(contentClassName)}>{children}</div>
        </div>
      )}
    </section>
  );
}
