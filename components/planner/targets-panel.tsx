"use client";

import { ChevronDown, Minus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { getItem } from "@/lib/data";
import { usePlannerStore } from "@/lib/store/planner-store";
import type { PlannerTarget } from "@/lib/planner/types";
import { ItemIcon } from "@/components/item-icon";
import { PlannerEmptyState } from "@/components/planner/empty-state";
import { cn } from "@/lib/utils";

interface TargetsPanelProps {
  targets: PlannerTarget[];
  onInspect: (itemId: string) => void;
}

export function TargetsPanel({ targets, onInspect }: TargetsPanelProps) {
  const setRate = usePlannerStore((s) => s.setTargetRate);
  const remove = usePlannerStore((s) => s.removeTarget);
  const [bodyOpen, setBodyOpen] = useState(true);

  if (targets.length === 0) return <PlannerEmptyState />;

  return (
    <div className="card relative overflow-hidden">
      <div className="belt absolute inset-x-0 top-0" aria-hidden />
      <button
        type="button"
        id="targets-panel-toggle"
        aria-expanded={bodyOpen}
        aria-controls="targets-panel-body"
        onClick={() => setBodyOpen((o) => !o)}
        className="flex min-h-11 w-full touch-manipulation items-center justify-between gap-2 border-b border-surface-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-400 sm:min-h-0"
      >
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
          Targets
        </div>
        <div className="flex items-center gap-2">
          <span className="num font-normal text-gray-500">{targets.length}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-gray-500 transition-transform",
              bodyOpen && "rotate-180",
            )}
            aria-hidden
          />
        </div>
      </button>
      {bodyOpen && (
        <ul
          id="targets-panel-body"
          role="region"
          aria-labelledby="targets-panel-toggle"
          className="divide-y divide-surface-border"
        >
          {targets.map((t) => {
            const item = getItem(t.itemId);
            if (!item) return null;
            const bump = (delta: number) =>
              setRate(t.itemId, Math.max(0, +(t.rate + delta).toFixed(4)));
            return (
              <li
                key={t.itemId}
                className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center"
              >
                <button
                  type="button"
                  onClick={() => onInspect(t.itemId)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-brand"
                >
                  <ItemIcon iconUrl={item.iconUrl} alt={item.name} size={32} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {item.category}
                    </div>
                  </div>
                </button>
                <div className="flex flex-wrap items-center gap-1 sm:flex-nowrap sm:justify-end">
                  <button
                    type="button"
                    className="btn min-h-9 min-w-9 px-0 py-0 sm:min-h-0 sm:min-w-0 sm:px-2 sm:py-1"
                    onClick={() => bump(-10)}
                    aria-label="Decrease rate"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={t.rate}
                    onChange={(e) => setRate(t.itemId, Number(e.target.value))}
                    className="input num min-h-9 w-full min-w-[5.5rem] flex-1 text-right sm:min-h-0 sm:w-24 sm:flex-none"
                  />
                  <span className="text-xs text-gray-500">/min</span>
                  <button
                    type="button"
                    className="btn min-h-9 min-w-9 px-0 py-0 sm:min-h-0 sm:min-w-0 sm:px-2 sm:py-1"
                    onClick={() => bump(10)}
                    aria-label="Increase rate"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="btn min-h-9 min-w-9 px-0 py-0 text-red-300 hover:text-red-200 sm:min-h-0 sm:min-w-0 sm:px-2 sm:py-1"
                    onClick={() => remove(t.itemId)}
                    aria-label="Remove target"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
