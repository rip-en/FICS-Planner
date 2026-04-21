"use client";

import { BookOpen, LayoutList, ListTree } from "lucide-react";
import { cn } from "@/lib/utils";

export type MobilePlannerTab = "catalog" | "plan" | "detail";

interface MobilePlannerTabsProps {
  active: MobilePlannerTab;
  onChange: (tab: MobilePlannerTab) => void;
}

const tabs: Array<{
  id: MobilePlannerTab;
  label: string;
  icon: typeof BookOpen;
}> = [
  { id: "catalog", label: "Catalog", icon: LayoutList },
  { id: "plan", label: "Planner", icon: ListTree },
  { id: "detail", label: "Details", icon: BookOpen },
];

export function MobilePlannerTabs({
  active,
  onChange,
}: MobilePlannerTabsProps) {
  return (
    <nav
      className="flex shrink-0 border-t border-surface-border bg-surface/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur lg:hidden"
      aria-label="Planner sections"
    >
      {tabs.map(({ id, label, icon: Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium transition",
              isActive
                ? "text-brand"
                : "text-gray-500 hover:text-gray-200",
            )}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
