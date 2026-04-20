"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { getItem } from "@/lib/data";
import { usePlannerStore } from "@/lib/store/planner-store";
import type { PlannerTarget } from "@/lib/planner/types";
import { ItemIcon } from "@/components/item-icon";
import { PlannerEmptyState } from "@/components/planner/empty-state";

interface TargetsPanelProps {
  targets: PlannerTarget[];
  onInspect: (itemId: string) => void;
}

export function TargetsPanel({ targets, onInspect }: TargetsPanelProps) {
  const setRate = usePlannerStore((s) => s.setTargetRate);
  const remove = usePlannerStore((s) => s.removeTarget);

  if (targets.length === 0) return <PlannerEmptyState />;

  return (
    <div className="card relative overflow-hidden">
      <div className="belt absolute inset-x-0 top-0" aria-hidden />
      <div className="flex items-center justify-between border-b border-surface-border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
          Targets
        </div>
        <span className="num font-normal text-gray-500">
          {targets.length}
        </span>
      </div>
      <ul className="divide-y divide-surface-border">
        {targets.map((t) => {
          const item = getItem(t.itemId);
          if (!item) return null;
          const bump = (delta: number) =>
            setRate(t.itemId, Math.max(0, +(t.rate + delta).toFixed(4)));
          return (
            <li
              key={t.itemId}
              className="flex items-center gap-2 px-3 py-2"
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
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="btn px-2 py-1"
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
                  className="input num w-24 text-right"
                />
                <span className="text-xs text-gray-500">/min</span>
                <button
                  type="button"
                  className="btn px-2 py-1"
                  onClick={() => bump(10)}
                  aria-label="Increase rate"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="btn px-2 py-1 text-red-300 hover:text-red-200"
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
    </div>
  );
}
