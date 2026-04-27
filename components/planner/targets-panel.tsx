"use client";

import { ChevronDown, Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getItem } from "@/lib/data";
import { solvePlan } from "@/lib/planner/solver";
import { usePlannerStore } from "@/lib/store/planner-store";
import type { PlannerConfig, PlannerTarget } from "@/lib/planner/types";
import { ItemIcon } from "@/components/item-icon";
import { PlannerEmptyState } from "@/components/planner/empty-state";
import { cn, formatRate } from "@/lib/utils";

interface TargetsPanelProps {
  targets: PlannerTarget[];
  config: PlannerConfig;
  /** When set, targets missing from this set get a hub-tier warning. */
  hubProducibleItemIds?: Set<string> | null;
  /** While true, hub warnings are hidden (reachability scan in progress). */
  hubTierScanPending?: boolean;
  onInspect: (itemId: string) => void;
}

interface MarginalRawCost {
  feasible: boolean;
  deltas: Array<{ itemId: string; delta: number }>;
}

function toRawMap(rows: Array<{ itemId: string; ratePerMin: number }>) {
  const out = new Map<string, number>();
  for (const row of rows) out.set(row.itemId, row.ratePerMin);
  return out;
}

export function TargetsPanel({
  targets,
  config,
  hubProducibleItemIds = null,
  hubTierScanPending = false,
  onInspect,
}: TargetsPanelProps) {
  const setRate = usePlannerStore((s) => s.setTargetRate);
  const remove = usePlannerStore((s) => s.removeTarget);
  const [bodyOpen, setBodyOpen] = useState(true);
  const [costByTarget, setCostByTarget] = useState<Record<string, MarginalRawCost>>(
    {},
  );
  const [isComputingCosts, setIsComputingCosts] = useState(false);

  const targetSignature = useMemo(
    () =>
      targets
        .map((t) => `${t.itemId}:${t.rate}`)
        .sort()
        .join("|"),
    [targets],
  );
  const configSignature = useMemo(
    () =>
      JSON.stringify({
        objective: config.objective,
        rawCaps: config.rawCaps ?? {},
        excludedRawInputs: config.excludedRawInputs ?? [],
        providedInputs: config.providedInputs ?? [],
        alternateInputRatios: config.alternateInputRatios ?? {},
        enabledAlternates: [...config.enabledAlternates].sort(),
        disabledRecipes: [...config.disabledRecipes].sort(),
        maxCompletedHubTier: config.maxCompletedHubTier,
      }),
    [
      config.disabledRecipes,
      config.enabledAlternates,
      config.excludedRawInputs,
      config.providedInputs,
      config.alternateInputRatios,
      config.objective,
      config.rawCaps,
      config.maxCompletedHubTier,
    ],
  );

  useEffect(() => {
    if (targets.length === 0) {
      setCostByTarget({});
      setIsComputingCosts(false);
      return;
    }

    let cancelled = false;
    setIsComputingCosts(true);

    const timer = setTimeout(() => {
      if (cancelled) return;
      const base = solvePlan(config);
      const next: Record<string, MarginalRawCost> = {};
      if (!base.feasible) {
        for (const t of targets) next[t.itemId] = { feasible: false, deltas: [] };
      } else {
        const baseRaw = toRawMap(base.rawInputs);
        for (const t of targets) {
          const bumpedConfig: PlannerConfig = {
            ...config,
            targets: config.targets.map((x) =>
              x.itemId === t.itemId ? { ...x, rate: x.rate + 1 } : x,
            ),
          };
          const bumped = solvePlan(bumpedConfig);
          if (!bumped.feasible) {
            next[t.itemId] = { feasible: false, deltas: [] };
            continue;
          }
          const bumpedRaw = toRawMap(bumped.rawInputs);
          const seen = new Set([...baseRaw.keys(), ...bumpedRaw.keys()]);
          const deltas: Array<{ itemId: string; delta: number }> = [];
          for (const itemId of seen) {
            const delta = (bumpedRaw.get(itemId) ?? 0) - (baseRaw.get(itemId) ?? 0);
            if (delta > 1e-5) deltas.push({ itemId, delta });
          }
          deltas.sort((a, b) => b.delta - a.delta);
          next[t.itemId] = { feasible: true, deltas };
        }
      }
      if (cancelled) return;
      setCostByTarget(next);
      setIsComputingCosts(false);
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [config, configSignature, targetSignature, targets]);

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
      {hubTierScanPending && config.maxCompletedHubTier !== undefined && (
        <p className="border-b border-surface-border px-3 py-2 text-[11px] text-gray-500">
          Checking hub-tier reachability for target warnings…
        </p>
      )}
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
                      {!hubTierScanPending &&
                        hubProducibleItemIds &&
                        !hubProducibleItemIds.has(t.itemId) && (
                          <span className="ml-1 text-amber-200/90">
                            · above hub tier
                          </span>
                        )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      {isComputingCosts ? (
                        <span className="inline-flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Calculating +1/min raw cost...
                        </span>
                      ) : costByTarget[t.itemId]?.feasible === false ? (
                        "No feasible +1/min increment under current caps/toggles."
                      ) : (costByTarget[t.itemId]?.deltas.length ?? 0) === 0 ? (
                        "+1/min raw cost: no additional capped/raw draw"
                      ) : (
                        <>
                          +1/min raw cost:{" "}
                          {costByTarget[t.itemId]?.deltas.slice(0, 3).map((d, i) => (
                            <span key={`${t.itemId}-${d.itemId}`}>
                              {getItem(d.itemId)?.name ?? d.itemId} +{formatRate(d.delta)}
                              {i <
                              Math.min(
                                3,
                                (costByTarget[t.itemId]?.deltas.length ?? 0),
                              ) -
                                1
                                ? ", "
                                : ""}
                            </span>
                          ))}
                          {(costByTarget[t.itemId]?.deltas.length ?? 0) > 3 && "…"}
                        </>
                      )}
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
